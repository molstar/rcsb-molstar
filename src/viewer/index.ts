/**
 * Copyright (c) 2019-2024 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 * @author Joan Segura <joan.segura@rcsb.org>
 * @author Yana Rose <yana.rose@rcsb.org>
 * @author Sebastian Bittrich <sebastian.bittrich@rcsb.org>
 */
import { MolScriptBuilder as MS } from 'molstar/lib/mol-script/language/builder';
import { BehaviorSubject, Subscription } from 'rxjs';
import { Plugin } from 'molstar/lib/mol-plugin-ui/plugin';
import { PluginCommands } from 'molstar/lib/mol-plugin/commands';
import { ViewerState, CollapsedState, ModelUrlProvider, LigandViewerState, LoadParams } from './types';
import { PluginSpec } from 'molstar/lib/mol-plugin/spec';

import { ColorNames } from 'molstar/lib/mol-util/color/names';
import * as React from 'react';

import { ModelLoader } from './helpers/model';
import { PresetProps } from './helpers/preset';
import { ControlsWrapper } from './ui/controls';
import { PluginConfig, PluginConfigItem } from 'molstar/lib/mol-plugin/config';
import { AssemblySymmetry } from 'molstar/lib/extensions/assembly-symmetry/behavior';
import { RCSBValidationReport } from 'molstar/lib/extensions/rcsb/validation-report/behavior';
import { Mat4 } from 'molstar/lib/mol-math/linear-algebra';
import { PluginState } from 'molstar/lib/mol-plugin/state';
import { BuiltInTrajectoryFormat } from 'molstar/lib/mol-plugin-state/formats/trajectory';
import { ObjectKeys } from 'molstar/lib/mol-util/type-helpers';
import { PluginLayoutControlsDisplay } from 'molstar/lib/mol-plugin/layout';
import { SuperposeColorThemeProvider } from './helpers/superpose/color';
import { NakbColorThemeProvider } from './helpers/nakb/color';
import { setFocusFromRange, removeComponent, clearSelection, createComponent, select, getAssemblyIdsFromModel, getAsymIdsFromModel, getDefaultModel as getDefaultStructureModel, getDefaultStructure } from './helpers/viewer';
import { lociToTargets, normalizeTarget, SelectBase, SelectRange, SelectTarget, Target, targetToExpression, targetToLoci } from './helpers/selection';
import { StructureRepresentationRegistry } from 'molstar/lib/mol-repr/structure/registry';
import { DefaultPluginUISpec, PluginUISpec } from 'molstar/lib/mol-plugin-ui/spec';
import { PluginUIContext } from 'molstar/lib/mol-plugin-ui/context';
import { ANVILMembraneOrientation, MembraneOrientationPreset } from 'molstar/lib/extensions/anvil/behavior';
import { MembraneOrientationRepresentationProvider } from 'molstar/lib/extensions/anvil/representation';
import { PluginContext } from 'molstar/lib/mol-plugin/context';
import { TrajectoryHierarchyPresetProvider } from 'molstar/lib/mol-plugin-state/builder/structure/hierarchy-preset';
import { AnimateStateSnapshots } from 'molstar/lib/mol-plugin-state/animation/built-in/state-snapshots';
import { PluginFeatureDetection } from 'molstar/lib/mol-plugin/features';
import { PresetStructureRepresentations } from 'molstar/lib/mol-plugin-state/builder/structure/representation-preset';
import { MAQualityAssessment } from 'molstar/lib/extensions/model-archive/quality-assessment/behavior';
import { ModelExport } from 'molstar/lib/extensions/model-export';
import { exportHierarchy } from 'molstar/lib/extensions/model-export/export';
import { GeometryExport } from 'molstar/lib/extensions/geo-export';
import { Mp4Export } from 'molstar/lib/extensions/mp4-export';
import { PartialCanvas3DProps } from 'molstar/lib/mol-canvas3d/canvas3d';
import { RSCCScore } from './helpers/rscc/behavior';
import { createRoot } from 'react-dom/client';
import { AssemblySymmetryData } from 'molstar/lib/extensions/assembly-symmetry/prop';
import { wwPDBChemicalComponentDictionary } from 'molstar/lib/extensions/wwpdb/ccd/behavior';
import { ChemicalCompontentTrajectoryHierarchyPreset } from 'molstar/lib/extensions/wwpdb/ccd/representation';
import { StateTransforms } from 'molstar/lib/mol-plugin-state/transforms';
import { lociLabel } from 'molstar/lib/mol-theme/label';
import { Loci } from 'molstar/lib/mol-model/loci';
import { Color } from 'molstar/lib/mol-util/color';
import { StructureSelection, QueryContext } from 'molstar/lib/mol-model/structure';
import { compile } from 'molstar/lib/mol-script/runtime/query/base';
import { EntitySubtype } from 'molstar/lib/mol-model/structure/model/properties/common';

/** package version, filled in at bundle build time */
declare const __RCSB_MOLSTAR_VERSION__: string;
export const RCSB_MOLSTAR_VERSION = typeof __RCSB_MOLSTAR_VERSION__ != 'undefined' ? __RCSB_MOLSTAR_VERSION__ : 'none';

/** unix time stamp, to be filled in at bundle build time */
declare const __BUILD_TIMESTAMP__: number;
export const BUILD_TIMESTAMP = typeof __BUILD_TIMESTAMP__ != 'undefined' ? __BUILD_TIMESTAMP__ : 'none';
export const BUILD_DATE = new Date(BUILD_TIMESTAMP);

const Extensions = {
    'assembly-symmetry': PluginSpec.Behavior(AssemblySymmetry),
    'rcsb-validation-report': PluginSpec.Behavior(RCSBValidationReport),
    'rscc': PluginSpec.Behavior(RSCCScore),
    'anvil-membrane-orientation': PluginSpec.Behavior(ANVILMembraneOrientation),
    'ma-quality-assessment': PluginSpec.Behavior(MAQualityAssessment),
    'model-export': PluginSpec.Behavior(ModelExport),
    'mp4-export': PluginSpec.Behavior(Mp4Export),
    'geo-export': PluginSpec.Behavior(GeometryExport),
};

const DefaultViewerProps = {
    showImportControls: false,
    showSessionControls: false,
    showStructureSourceControls: true,
    showMeasurementsControls: true,
    showStrucmotifSubmitControls: true,
    showSuperpositionControls: true,
    showQuickStylesControls: false,
    showStructureComponentControls: true,
    showVolumeStreamingControls: true,
    showAssemblySymmetryControls: true,
    showValidationReportControls: true,
    showPredictedAlignedErrorPlot: true,

    showMembraneOrientationPreset: false,
    showNakbColorTheme: false,
    /**
     * Needed when running outside of sierra. If set to true, the strucmotif UI will use an absolute URL to sierra-prod.
     * Otherwise, the link will be relative on the current host.
     */
    detachedFromSierra: false,
    modelUrlProviders: [
        (pdbId: string) => ({
            url: `https://models.rcsb.org/${pdbId.toLowerCase()}.bcif`,
            format: 'mmcif',
            isBinary: true
        }),
        (pdbId: string) => ({
            url: `https://files.rcsb.org/download/${pdbId.toLowerCase()}.cif`,
            format: 'mmcif',
            isBinary: false
        })
    ] as ModelUrlProvider[],

    extensions: ObjectKeys(Extensions),
    layoutIsExpanded: false,
    layoutShowControls: true,
    layoutShowRightPanel: true,
    layoutControlsDisplay: 'reactive' as PluginLayoutControlsDisplay,
    layoutShowSequence: true,
    layoutShowLog: false,

    viewportShowExpand: true,
    viewportShowControls: true,
    viewportShowSettings: true,
    viewportShowScreenshotControls: true,
    // when set to true, the viewport control for activating selection mode is displayed
    viewportShowSelectionMode: true,
    viewportShowSelectionTools: true,
    viewportShowTrajectoryControls: true,
    // when set to true, selection mode is activated by default
    behaviorSelectionModeActive: false,

    volumeStreamingServer: 'https://maps.rcsb.org/',

    backgroundColor: ColorNames.white,
    manualReset: false, // switch to 'true' for 'motif' preset
    pickingAlphaThreshold: 0.5, // lower to 0.2 to accommodate 'motif' preset
    showWelcomeToast: true,

    config: [] as [PluginConfigItem, any][],
};
export type ViewerProps = typeof DefaultViewerProps & { canvas3d: PartialCanvas3DProps }

type SelectionEventType = 'add' | 'remove' | 'clear';

const LigandExtensions = {
    'wwpdb-chemical-component-dictionary': PluginSpec.Behavior(wwPDBChemicalComponentDictionary),
    'mp4-export': PluginSpec.Behavior(Mp4Export),
};

const DefaultLigandViewerProps = {
    modelUrlProviders: [
        (id: string) => ({
            url: id.length <= 5 ? `https://files.rcsb.org/ligands/view/${id.toUpperCase()}.cif` : `https://files.rcsb.org/birds/view/${id.toUpperCase()}.cif`,
            format: 'mmcif',
            isBinary: false
        })
    ] as ModelUrlProvider[],

    extensions: ObjectKeys(LigandExtensions),
    layoutIsExpanded: false,
    layoutShowControls: false,
    layoutControlsDisplay: 'reactive' as PluginLayoutControlsDisplay,
    layoutShowLog: false,

    viewportShowExpand: true,
    viewportShowSelectionMode: true,
    viewportShowControls: true,

    backgroundColor: ColorNames.white,
    showWelcomeToast: true,

    ignoreHydrogens: true,
    showLabels: false,
    shownCoordinateType: 'ideal' as const,
    aromaticBonds: false, // stylize aromatic rings
};

export type LigandViewerProps = typeof DefaultLigandViewerProps & { canvas3d: PartialCanvas3DProps }

export class Viewer {
    private readonly _plugin: PluginUIContext;
    private readonly modelUrlProviders: ModelUrlProvider[];
    private prevExpanded: boolean;
    private selectionRefs = new Map();

    constructor(elementOrId: string | HTMLElement, props: Partial<ViewerProps> = {}) {
        const element = typeof elementOrId === 'string' ? document.getElementById(elementOrId)! : elementOrId;
        if (!element) throw new Error(`Could not get element with id '${elementOrId}'`);

        const o = { ...DefaultViewerProps, ...props };

        const defaultSpec = DefaultPluginUISpec();
        const spec: PluginUISpec = {
            ...defaultSpec,
            actions: defaultSpec.actions,
            behaviors: [
                ...defaultSpec.behaviors,
                ...o.extensions.map(e => Extensions[e]),
            ],
            animations: [...defaultSpec.animations?.filter(a => a.name !== AnimateStateSnapshots.name) || []],
            layout: {
                initial: {
                    isExpanded: o.layoutIsExpanded,
                    showControls: o.layoutShowControls,
                    controlsDisplay: o.layoutControlsDisplay,
                },
            },
            canvas3d: {
                ...defaultSpec.canvas3d,
                ...o.canvas3d,
                renderer: {
                    ...defaultSpec.canvas3d?.renderer,
                    ...o.canvas3d?.renderer,
                    backgroundColor: o.backgroundColor,
                    pickingAlphaThreshold: o.pickingAlphaThreshold
                },
                camera: {
                    // desirable for alignment view so that the display doesn't "jump around" as more structures get loaded
                    manualReset: o.manualReset
                }
            },
            components: {
                ...defaultSpec.components,
                selectionTools: {
                    controls: o.viewportShowSelectionTools ? undefined : () => undefined,
                },
                controls: {
                    ...defaultSpec.components?.controls,
                    top: o.layoutShowSequence ? undefined : 'none',
                    bottom: o.layoutShowLog ? undefined : 'none',
                    left: 'none',
                    right: o.layoutShowRightPanel ? ControlsWrapper : 'none',
                },
                remoteState: 'none',
            },
            config: [
                [PluginConfig.Viewport.ShowExpand, o.viewportShowExpand],
                [PluginConfig.Viewport.ShowControls, o.viewportShowControls],
                [PluginConfig.Viewport.ShowSettings, o.viewportShowSettings],
                [PluginConfig.Viewport.ShowScreenshotControls, o.viewportShowScreenshotControls],
                [PluginConfig.Viewport.ShowSelectionMode, o.viewportShowSelectionMode],
                [PluginConfig.Viewport.ShowAnimation, false],
                [PluginConfig.Viewport.ShowTrajectoryControls, o.viewportShowTrajectoryControls],
                [PluginConfig.VolumeStreaming.DefaultServer, o.volumeStreamingServer],
                [PluginConfig.Download.DefaultPdbProvider, 'rcsb'],
                [PluginConfig.Download.DefaultEmdbProvider, 'rcsb'],
                [PluginConfig.Structure.DefaultRepresentationPreset, PresetStructureRepresentations.auto.id],
                // wboit & webgl1 checks are needed to work properly on recent Safari versions
                [PluginConfig.General.Transparency, PluginFeatureDetection.preferWebGl1 ? 'wboit' : undefined],
                [PluginConfig.General.PreferWebGl1, PluginFeatureDetection.preferWebGl1],
                ...(o.config ?? []),
            ]
        };

        this._plugin = new PluginUIContext(spec);
        this.modelUrlProviders = o.modelUrlProviders;

        (this._plugin.customState as ViewerState) = {
            showImportControls: o.showImportControls,
            showSessionControls: o.showSessionControls,
            showStructureSourceControls: o.showStructureSourceControls,
            showMeasurementsControls: o.showMeasurementsControls,
            showStrucmotifSubmitControls: o.showStrucmotifSubmitControls,
            showSuperpositionControls: o.showSuperpositionControls,
            showQuickStylesControls: o.showQuickStylesControls,
            showStructureComponentControls: o.showStructureComponentControls,
            showVolumeStreamingControls: o.showVolumeStreamingControls,
            showAssemblySymmetryControls: o.showAssemblySymmetryControls,
            showValidationReportControls: o.showValidationReportControls,
            showPredictedAlignedErrorPlot: o.showPredictedAlignedErrorPlot,
            modelLoader: new ModelLoader(this._plugin),
            collapsed: new BehaviorSubject<CollapsedState>({
                selection: true,
                measurements: true,
                strucmotifSubmit: true,
                superposition: true,
                quickStyles: false,
                component: false,
                volume: true,
                assemblySymmetry: true,
                validationReport: true,
                custom: true,
            }),
            detachedFromSierra: o.detachedFromSierra
        };

        this._plugin.init()
            .then(async () => {
                // hide 'Membrane Orientation' preset from UI - has to happen 'before' react render, apparently
                // the corresponding behavior must be registered either way, because the 3d-view uses it (even without appearing in the UI)
                if (!o.showMembraneOrientationPreset) {
                    this._plugin.builders.structure.representation.unregisterPreset(MembraneOrientationPreset);
                    this._plugin.representation.structure.registry.remove(MembraneOrientationRepresentationProvider);
                }
                // normally, this would be part of CustomStructureControls -- we want to manage its collapsed state individually though
                this._plugin.customStructureControls.delete(AssemblySymmetryData.Tag.Representation);

                const root = createRoot(element);
                root.render(React.createElement(Plugin, { plugin: this._plugin }));

                this._plugin.representation.structure.themes.colorThemeRegistry.add(SuperposeColorThemeProvider);
                if (o.showNakbColorTheme) this._plugin.representation.structure.themes.colorThemeRegistry.add(NakbColorThemeProvider);

                if (o.showWelcomeToast) {
                    await PluginCommands.Toast.Show(this._plugin, {
                        title: 'Welcome',
                        message: `RCSB PDB Mol* Viewer ${RCSB_MOLSTAR_VERSION} [${BUILD_DATE.toLocaleString()}]`,
                        key: 'toast-welcome',
                        timeoutMs: 5000
                    });
                }

                this.prevExpanded = this._plugin.layout.state.isExpanded;
                this._plugin.layout.events.updated.subscribe(() => this.toggleControls());

                if (o.behaviorSelectionModeActive) {
                    this._plugin.behaviors.interaction.selectionMode.next(true);
                }
            });
    }

    get plugin() {
        return this._plugin;
    }

    pluginCall(f: (plugin: PluginContext) => void) {
        f(this.plugin);
    }

    private get customState() {
        return this._plugin.customState as ViewerState;
    }

    async loadPdbId<P, S>(pdbId: string, config?: { props?: PresetProps; matrix?: Mat4; reprProvider?: TrajectoryHierarchyPresetProvider<P, S>, params?: P }) {
        for (const provider of this.modelUrlProviders) {
            try {
                const p = provider(pdbId);
                return await this.customState.modelLoader.load<P, S>({ fileOrUrl: p.url, format: p.format, isBinary: p.isBinary }, config?.props, config?.matrix, config?.reprProvider, config?.params);
            } catch (e) {
                console.warn(`loading '${pdbId}' failed with '${e}', trying next model-loader-provider`);
            }
        }
    }

    async loadPdbIds<P, S>(args: { pdbId: string, config?: {props?: PresetProps; matrix?: Mat4; reprProvider?: TrajectoryHierarchyPresetProvider<P, S>, params?: P} }[]) {
        const out = [];
        for (const { pdbId, config } of args) {
            out.push(await this.loadPdbId(pdbId, config));
        }
        if (!this.plugin.spec.canvas3d?.camera?.manualReset) this.resetCamera(0);
        return out;
    }

    async loadStructureFromUrl<P, S>(url: string, format: BuiltInTrajectoryFormat, isBinary: boolean, config?: {props?: PresetProps & { dataLabel?: string }; matrix?: Mat4; reprProvider?: TrajectoryHierarchyPresetProvider<P, S>, params?: P}) {
        try {
            return await this.customState.modelLoader.load({ fileOrUrl: url, format, isBinary }, config?.props, config?.matrix, config?.reprProvider, config?.params);
        } catch (e) {
            throw new Error(`Failed to load ${url}. Error: ${e instanceof Error ? e.message : e}. The file may be in an unsupported format.`);
        }
    }

    loadSnapshotFromUrl(url: string, type: PluginState.SnapshotType) {
        return PluginCommands.State.Snapshots.OpenUrl(this._plugin, { url, type });
    }

    loadStructureFromData<P, S>(data: string | number[], format: BuiltInTrajectoryFormat, isBinary: boolean, config?: {props?: PresetProps & { dataLabel?: string }; matrix?: Mat4; reprProvider?: TrajectoryHierarchyPresetProvider<P, S>, params?: P}) {
        return this.customState.modelLoader.parse({ data, format, isBinary }, config?.props, config?.matrix, config?.reprProvider, config?.params);
    }

    /**
     * Subscribes to a structural selection-related event in the plugin.
     *
     * This method allows clients to react to changes in structure selections,
     * including when selections are added, removed, or cleared. The callback
     * receives a `Target` object derived from the selection loci, except in
     * the case of `clear-selection`, where no target is provided.
     *
     * @param {SelectionEventType} type - The type of selection event to subscribe to.
     *        - `'add'`: Triggered when a new selection is added.
     *        - `'remove'`: Triggered when a selection is removed.
     *        - `'clear'`: Triggered when all selections are cleared.
     *
     * @param {(target?: Target) => void} callback - The function to call when the event occurs.
     *        The callback receives a `Target` object for add/remove events,
     *        and `undefined` for clear events.
     *
     * @returns {Subscription} A subscription object that can be used to unsubscribe later.
     *
     * @example
     * // Subscribe to add selection events
     * const subscription = viewer.subscribeToEvent('add', (target) => {
     *     if (target) console.log('Selection added:', target);
     * });
     *
     * // Unsubscribe when no longer needed
     * subscription.unsubscribe();
     */
    subscribeToSelection(type: SelectionEventType, callback: (targets?: Target[]) => void): Subscription {
        switch (type) {
            case 'add':
                return this.plugin.managers.structure.selection.events.loci.add.subscribe((loci) => {
                    const granularity = this.plugin.managers.interactivity.props.granularity;
                    const targets = lociToTargets(loci, granularity);
                    if (targets)
                        callback(targets);
                });
            case 'remove':
                return this.plugin.managers.structure.selection.events.loci.remove.subscribe((loci) => {
                    const granularity = this.plugin.managers.interactivity.props.granularity;
                    const targets = lociToTargets(loci, granularity);
                    if (targets)
                        callback(targets);
                });
            case 'clear':
                return this.plugin.managers.structure.selection.events.loci.clear.subscribe((_loci) => {
                    callback();
                });
        }
    };

    /**
     * This method updates the interactivity settings in the plugin's interactivity manager,
     * specifically changing how fine or coarse the selection behavior should be (e.g., by atom, residue, chain, etc.).
     *
     * @param {Loci.Granularity} granularity - The desired level of selection granularity.
     *        Common values might include:
     *        - `element`: individual atoms
     *        - `residue`: whole residues
     *        - `chain`: entire chains
     */
    setSelectionGranularity(granularity: Loci.Granularity) {
        this.plugin.managers.interactivity.setProps({ granularity: granularity });
    }

    /**
     * Retrieves the list of assembly IDs for a default structure model.
     *
     * This method accesses the default structure model and returns
     * all associated assembly IDs, as defined in the `_pdbx_struct_assembly` category.
     * If the model is not available, it returns an empty array.
     *
     * @returns {string[]} An array of assembly ID strings, or an empty array if no model is available.
     */
    getAssemblyIds(): string[] {
        const model = getDefaultStructureModel(this.plugin);
        if (!model) return [];
        return getAssemblyIdsFromModel(model);
    }

    /**
     * Retrieves asym and author chain IDs for a default structure model.
     *
     * This method accesses the default structure model and returns a list of
     * asym and author IDs. Asym IDs correspond to unique chains or subunits in the model
     * and are typically defined in the `_struct_asym` category of the mmCIF format.
     *
     * If the model is not available, the method returns an empty array.
     *
     * @returns {string[][]} A 2D array of asym and author chain IDs (in this format: [asym Id, auth Id]),
     * or an empty array if the model is unavailable.
     */
    getAsymIds(types?: EntitySubtype[]): string[][] {
        const model = getDefaultStructureModel(this.plugin);
        if (!model) return [];
        return getAsymIdsFromModel(model, types);
    }

    /**
     * Sets the current structure view based on the provided assembly ID.
     *
     * If an `assemblyId` is provided, the structure view is updated to show
     * the corresponding assembly (as defined in `_pdbx_struct_assembly`).
     * If no `assemblyId` is provided, the structure view is reverted to the default model view.
     *
     * This updates the plugin's structure hierarchy manager using the first loaded structure.
     *
     * @param {string | undefined} assemblyId - The assembly ID to display, or `undefined`
     *         to display the model.
     *
     * @returns {Promise<void>} A promise that resolves once the structure view is updated.
     */
    setStructureView(assemblyId: string | undefined): Promise<void> {
        if (assemblyId) {
            return this.plugin.managers.structure.hierarchy.updateStructure(this.plugin.managers.structure.hierarchy.current.structures[0], {
                type: {
                    name: 'assembly',
                    params: {
                        id: assemblyId,
                    }
                }
            });
        } else {
            return this.plugin.managers.structure.hierarchy.updateStructure(this.plugin.managers.structure.hierarchy.current.structures[0], {
                type: {
                    name: 'model'
                }
            });
        }
    }

    /**
     * Adds custom labels to specified targets within the current structure.
     *
     * This method iterates over an array of target objects, converts each target to a
     * corresponding loci in the current structure, and then adds a label at that loci
     * position using the structure measurement manager.
     *
     * The label text and appearance can be customized via the `config` parameter.
     *
     * @param targets - An array of Target objects to label on the structure.
     *                  Each Target is expected to have `labelCompId` and `labelSeqId` properties.
     * @param config - Configuration object specifying how labels should be rendered.
     * @param config.text - A function that takes a `Target` and returns a `string` to be shown as the label.
     *                      For example: `(t) => \`\${t.labelCompId} \${t.labelSeqId}\``.
     * @param config.borderColor - Label border color, as a hex number (e.g., `0x555555`).
     * @param config.textColor - Label text color, as a hex number (e.g., `0xB9B9B9`).
     */
    showLabels(targets: Target[], config: {
        text: (t: Target) => string,
        borderColor: number,
        textColor: number
    }) {
        const structure = getDefaultStructure(this._plugin);
        if (!structure) return;
        for (const t of targets) {
            const nt = normalizeTarget(t, structure);
            const loci = targetToLoci(nt, structure);
            this.plugin.managers.structure.measurement.addLabel(loci, {
                labelParams: {
                    customText: config.text(t),
                    borderColor: Color(config.borderColor),
                    textColor: Color(config.textColor)
                }
            });
        }
    }

    /**
     * Focuses the 3D viewer on a specific residue within the current structure.
     *
     * This function identifies the residue using either `authSeqId` or `labelSeqId` from the given `Target`,
     * constructs a query to locate the corresponding atoms, and then adjusts the camera to focus on the selection.
     *
     * It combines sequence-based and chain-level constraints to ensure precise targeting, including the chain
     * (`label_asym_id`) and operator (`operatorName`).
     *
     * @param target - A `Target` object specifying the residue to focus on. It must include:
     *   - `labelAsymId`: the chain ID (label format),
     *   - `operatorName`: the operator applied to the chain,
     *   - Either `authSeqId` or `labelSeqId` to locate the residue.
     */
    focusOnResidue(target: Target) {
        const structure = getDefaultStructure(this.plugin);
        if (!structure) return;
        const residueTest = (target.authSeqId) ?
            MS.core.rel.eq([target.authSeqId, MS.ammp('auth_seq_id')]) :
            MS.core.rel.eq([target.labelSeqId, MS.ammp('label_seq_id')]);
        const tests = {
            'residue-test': MS.core.logic.and([residueTest]),
            'chain-test': MS.core.logic.and([
                MS.core.rel.eq([target.labelAsymId, MS.ammp('label_asym_id')]),
                MS.core.rel.eq([target.operatorName, MS.acp('operatorName')])
            ]),
        };
        const expression = MS.struct.modifier.union([
            MS.struct.generator.atomGroups(tests)
        ]);
        const query = compile<StructureSelection>(expression);
        const selection = query(new QueryContext(structure));
        const loci = StructureSelection.toLociWithSourceUnits(selection);
        this.plugin.managers.structure.focus.setFromLoci(loci);
        this.plugin.managers.camera.focusLoci(loci);
    }

    async setBallAndStick(target: Target | Target[], mode: 'on' | 'off') {

        const s = getDefaultStructure(this.plugin);
        if (!s) return;

        const parent = this.plugin.helpers.substructureParent.get(s);
        if (!parent || !parent.obj) return;

        const state = this.plugin.state.data;
        const builder = state.build();

        const targets = Array.isArray(target) ? target : [target];
        for (const t of targets) {
            const label = `${t.labelAsymId} ${t.structOperId} ${t.labelSeqId}`;
            if (mode === 'on') {
                const exp = targetToExpression(t);
                const selectionRef = builder
                    .to(parent)
                    .apply(StateTransforms.Model.StructureSelectionFromExpression,
                        { expression: exp, label }, { tags: 'selected-residues' }).ref;
                this.selectionRefs.set(label, selectionRef);
                builder
                    .to(selectionRef)
                    .apply(StateTransforms.Representation.StructureRepresentation3D, {
                        type: { name: 'ball-and-stick', params: {} },
                        sizeTheme: { name: 'physical', params: {} }
                    });
            } else {
                const transformRef = this.selectionRefs.get(label);
                if (transformRef) {
                    builder.delete(transformRef);
                    this.selectionRefs.delete(transformRef);
                }
            }
        }
        await PluginCommands.State.Update(this.plugin, {
            state,
            tree: builder,
            options: { doNotLogTiming: true, doNotUpdateCurrent: true }
        });
    }

    private toggleControls(): void {
        const currExpanded = this._plugin.layout.state.isExpanded;
        const expandedChanged = (this.prevExpanded !== currExpanded);
        if (!expandedChanged) return;

        if (currExpanded && !this._plugin.layout.state.showControls) {
            this._plugin.layout.setProps({ showControls: true });
        } else if (!currExpanded && this._plugin.layout.state.showControls) {
            this._plugin.layout.setProps({ showControls: false });
        }
        this.prevExpanded = this._plugin.layout.state.isExpanded;
    }

    resetCamera(durationMs?: number) {
        this._plugin.managers.camera.reset(undefined, durationMs);
    }

    clear() {
        const state = this._plugin.state.data;
        return PluginCommands.State.RemoveObject(this._plugin, { state, ref: state.tree.root.ref });
    }

    handleResize() {
        this._plugin.layout.events.updated.next(void 0);
    }

    exportLoadedStructures(options?: { format?: 'cif' | 'bcif' }) {
        return exportHierarchy(this.plugin, options);
    }

    setFocus(target: SelectRange) {
        setFocusFromRange(this._plugin, target);
    }

    clearFocus(): void {
        this._plugin.managers.structure.focus.clear();
    }

    select(targets: SelectTarget | SelectTarget[], mode: 'select' | 'hover', modifier: 'add' | 'set') {
        select(this._plugin, targets, mode, modifier);
    }

    clearSelection(mode: 'select' | 'hover', target?: Target) {
        clearSelection(this._plugin, mode, target);
    }

    async createComponent(label: string, targets: SelectBase | SelectTarget | SelectTarget[], representationType: StructureRepresentationRegistry.BuiltIn) {
        await createComponent(this._plugin, label, targets, representationType);
    }

    async removeComponent(componentLabel: string) {
        await removeComponent(this._plugin, componentLabel);
    }
}

export class LigandViewer {
    private readonly _plugin: PluginUIContext;
    private readonly modelUrlProviders: ModelUrlProvider[];
    private prevExpanded: boolean;

    constructor(elementOrId: string | HTMLElement, props: Partial<LigandViewerProps> = {}) {
        const element = typeof elementOrId === 'string' ? document.getElementById(elementOrId)! : elementOrId;
        if (!element) throw new Error(`Could not get element with id '${elementOrId}'`);

        const o = { ...DefaultLigandViewerProps, ...props };

        const defaultSpec = DefaultPluginUISpec();
        const spec: PluginUISpec = {
            ...defaultSpec,
            actions: defaultSpec.actions,
            behaviors: [
                ...defaultSpec.behaviors,
                ...o.extensions.map(e => LigandExtensions[e]),
            ],
            animations: [...defaultSpec.animations?.filter(a => a.name !== AnimateStateSnapshots.name) || []],
            layout: {
                initial: {
                    isExpanded: o.layoutIsExpanded,
                    showControls: o.layoutShowControls,
                    controlsDisplay: o.layoutControlsDisplay,
                },
            },
            canvas3d: {
                ...defaultSpec.canvas3d,
                ...o.canvas3d,
                renderer: {
                    ...defaultSpec.canvas3d?.renderer,
                    ...o.canvas3d?.renderer,
                    backgroundColor: o.backgroundColor,
                },
                camera: {
                    helper: {
                        axes: {
                            name: 'off', params: {}
                        }
                    }
                }
            },
            components: {
                ...defaultSpec.components,
                controls: {
                    ...defaultSpec.components?.controls,
                    top: 'none',
                    bottom: o.layoutShowLog ? undefined : 'none',
                    left: 'none',
                    right: ControlsWrapper,
                },
                remoteState: 'none',
            },
            config: [
                [PluginConfig.VolumeStreaming.Enabled, false],
                [PluginConfig.Viewport.ShowExpand, o.viewportShowExpand],
                [PluginConfig.Viewport.ShowSelectionMode, o.viewportShowSelectionMode],
                [PluginConfig.Viewport.ShowAnimation, false],
                [PluginConfig.Download.DefaultPdbProvider, 'rcsb'],
                [PluginConfig.Download.DefaultEmdbProvider, 'rcsb'],
                [PluginConfig.Structure.DefaultRepresentationPreset, PresetStructureRepresentations.auto.id],
                // wboit & webgl1 checks are needed to work properly on recent Safari versions
                [PluginConfig.General.Transparency, PluginFeatureDetection.preferWebGl1 ? 'wboit' : undefined],
                [PluginConfig.General.PreferWebGl1, PluginFeatureDetection.preferWebGl1]
            ]
        };

        this._plugin = new PluginUIContext(spec);
        this.modelUrlProviders = o.modelUrlProviders;

        (this._plugin.customState as LigandViewerState) = {
            showMeasurementsControls: true,
            showStructureComponentControls: true,
            modelLoader: new ModelLoader(this._plugin),
            collapsed: new BehaviorSubject<CollapsedState>({
                selection: true,
                measurements: true,
                strucmotifSubmit: true,
                superposition: true,
                quickStyles: true,
                component: false,
                volume: true,
                assemblySymmetry: true,
                validationReport: true,
                custom: true,
            }),
            ignoreHydrogens: o.ignoreHydrogens,
            showLabels: o.showLabels,
            shownCoordinateType: o.shownCoordinateType,
            aromaticBonds: o.aromaticBonds,
        };

        this._plugin.init()
            .then(async () => {
                const root = createRoot(element);
                root.render(React.createElement(Plugin, { plugin: this._plugin }));

                if (o.showWelcomeToast) {
                    await PluginCommands.Toast.Show(this._plugin, {
                        title: 'Welcome',
                        message: `RCSB PDB Mol* Ligand Viewer ${RCSB_MOLSTAR_VERSION} [${BUILD_DATE.toLocaleString()}]`,
                        key: 'toast-welcome',
                        timeoutMs: 5000
                    });
                }

                // allow picking of individual atoms
                this._plugin.managers.interactivity.setProps({ granularity: 'element' });

                // custom tooltips that only include atom names
                this._plugin.managers.lociLabels.clearProviders();
                this._plugin.managers.lociLabels.addProvider({ label: loci => lociLabel(loci, { condensed: true }) });

                this.prevExpanded = this._plugin.layout.state.isExpanded;
                this._plugin.layout.events.updated.subscribe(() => this.toggleControls());
            });
    }

    private get customState() {
        return this._plugin.customState as LigandViewerState;
    }

    private toggleControls(): void {
        const currExpanded = this._plugin.layout.state.isExpanded;
        const expandedChanged = (this.prevExpanded !== currExpanded);
        if (!expandedChanged) return;

        if (currExpanded && !this._plugin.layout.state.showControls) {
            this._plugin.layout.setProps({ showControls: true });
        } else if (!currExpanded && this._plugin.layout.state.showControls) {
            this._plugin.layout.setProps({ showControls: false });
        }
        this.prevExpanded = this._plugin.layout.state.isExpanded;
    }

    clear() {
        const state = this._plugin.state.data;
        return PluginCommands.State.RemoveObject(this._plugin, { state, ref: state.tree.root.ref });
    }

    async loadLigandId(id: string) {
        for (const provider of this.modelUrlProviders) {
            try {
                const p = provider(id);
                await this.load({ fileOrUrl: p.url, format: p.format, isBinary: p.isBinary });
            } catch (e) {
                console.warn(`loading '${id}' failed with '${e}', trying next ligand-loader-provider`);
            }
        }
    }

    private async load(p: LoadParams) {
        await this.customState.modelLoader.load<any, any>(p, undefined, undefined, ChemicalCompontentTrajectoryHierarchyPreset, { shownCoordinateType: this.customState.shownCoordinateType, aromaticBonds: this.customState.aromaticBonds });
        await this.syncHydrogenState();

        for (const s of this._plugin.managers.structure.hierarchy.current.structures) {
            for (const c of s.components) {
                const isHidden = c.cell.state.isHidden === true || !this.customState.showLabels;
                await this._plugin.builders.structure.representation.addRepresentation(c.cell, { type: 'label', color: 'uniform', colorParams: { value: ColorNames.black }, typeParams: { level: 'element', fontQuality: 4, borderWidth: 0.1, borderColor: ColorNames.lightgray, attachment: 'bottom-left', ignoreHydrogens: this.customState.ignoreHydrogens } }, { initialState: { isHidden } });
            }
        }
    }

    async toggleHydrogens() {
        this.customState.ignoreHydrogens = !this.customState.ignoreHydrogens;
        await this.syncHydrogenState();
    }

    private async syncHydrogenState() {
        const update = this._plugin.build();
        for (const s of this._plugin.managers.structure.hierarchy.current.structures) {
            for (const c of s.components) {
                for (const r of c.representations) {
                    update.to(r.cell).update(StateTransforms.Representation.StructureRepresentation3D, old => {
                        old.type.params.ignoreHydrogens = this.customState.ignoreHydrogens;
                    });
                }
            }
        }
        await update.commit();
    }

    async toggleLabels() {
        this.customState.showLabels = !this.customState.showLabels;
        await this.syncLabelState();
    }

    private async syncLabelState() {
        for (const s of this._plugin.managers.structure.hierarchy.current.structures) {
            for (const c of s.components) {
                if (c.cell.state.isHidden) continue;
                for (const r of c.representations) {
                    if (r.cell.obj?.label !== 'Label') continue;
                    this._plugin.managers.structure.hierarchy.toggleVisibility([r], this.customState.showLabels ? 'show' : 'hide');
                }
            }
        }
    }
}
