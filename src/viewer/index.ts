/**
 * Copyright (c) 2019-2020 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 * @author Joan Segura <joan.segura@rcsb.org>
 * @author Yana Rose <yana.rose@rcsb.org>
 * @author Sebastian Bittrich <sebastian.bittrich@rcsb.org>
 */

import { BehaviorSubject } from 'rxjs';
import { Plugin } from 'molstar/lib/mol-plugin-ui/plugin';
import { PluginCommands } from 'molstar/lib/mol-plugin/commands';
import { ViewerState, CollapsedState, ModelUrlProvider } from './types';
import { PluginSpec } from 'molstar/lib/mol-plugin/spec';

import { ColorNames } from 'molstar/lib/mol-util/color/names';
import * as React from 'react';

import { ModelLoader } from './helpers/model';
import { PresetProps } from './helpers/preset';
import { ControlsWrapper } from './ui/controls';
import { PluginConfig } from 'molstar/lib/mol-plugin/config';
import { RCSBAssemblySymmetry } from 'molstar/lib/extensions/rcsb/assembly-symmetry/behavior';
import { RCSBValidationReport } from 'molstar/lib/extensions/rcsb/validation-report/behavior';
import { Mat4 } from 'molstar/lib/mol-math/linear-algebra';
import { PluginState } from 'molstar/lib/mol-plugin/state';
import { BuiltInTrajectoryFormat } from 'molstar/lib/mol-plugin-state/formats/trajectory';
import { ObjectKeys } from 'molstar/lib/mol-util/type-helpers';
import { PluginLayoutControlsDisplay } from 'molstar/lib/mol-plugin/layout';
import { SuperposeColorThemeProvider } from './helpers/superpose/color';
import { NakbColorThemeProvider } from './helpers/nakb/color';
import { setFocusFromRange, removeComponent, clearSelection, createComponent, select } from './helpers/viewer';
import { SelectBase, SelectRange, SelectTarget, Target } from './helpers/selection';
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
import { AssemblySymmetry } from 'molstar/lib/extensions/rcsb/assembly-symmetry/prop';

/** package version, filled in at bundle build time */
declare const __RCSB_MOLSTAR_VERSION__: string;
export const RCSB_MOLSTAR_VERSION = typeof __RCSB_MOLSTAR_VERSION__ != 'undefined' ? __RCSB_MOLSTAR_VERSION__ : 'none';

/** unix time stamp, to be filled in at bundle build time */
declare const __BUILD_TIMESTAMP__: number;
export const BUILD_TIMESTAMP = typeof __BUILD_TIMESTAMP__ != 'undefined' ? __BUILD_TIMESTAMP__ : 'none';
export const BUILD_DATE = new Date(BUILD_TIMESTAMP);

const Extensions = {
    'rcsb-assembly-symmetry': PluginSpec.Behavior(RCSBAssemblySymmetry),
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
    layoutControlsDisplay: 'reactive' as PluginLayoutControlsDisplay,
    layoutShowSequence: true,
    layoutShowLog: false,

    viewportShowExpand: true,
    viewportShowSelectionMode: true,
    volumeStreamingServer: 'https://maps.rcsb.org/',

    backgroundColor: ColorNames.white,
    showWelcomeToast: true
};
export type ViewerProps = typeof DefaultViewerProps & { canvas3d: PartialCanvas3DProps }

export class Viewer {
    private readonly _plugin: PluginUIContext;
    private readonly modelUrlProviders: ModelUrlProvider[];
    private prevExpanded: boolean;

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
                    backgroundColor: o.backgroundColor
                }
            },
            components: {
                ...defaultSpec.components,
                controls: {
                    ...defaultSpec.components?.controls,
                    top: o.layoutShowSequence ? undefined : 'none',
                    bottom: o.layoutShowLog ? undefined : 'none',
                    left: 'none',
                    right: ControlsWrapper,
                },
                remoteState: 'none',
            },
            config: [
                [PluginConfig.Viewport.ShowExpand, o.viewportShowExpand],
                [PluginConfig.Viewport.ShowSelectionMode, o.viewportShowSelectionMode],
                [PluginConfig.Viewport.ShowAnimation, false],
                [PluginConfig.VolumeStreaming.DefaultServer, o.volumeStreamingServer],
                [PluginConfig.Download.DefaultPdbProvider, 'rcsb'],
                [PluginConfig.Download.DefaultEmdbProvider, 'rcsb'],
                [PluginConfig.Structure.DefaultRepresentationPreset, PresetStructureRepresentations.auto.id],
                // wboit & webgl1 checks are needed to work properly on recent Safari versions
                [PluginConfig.General.EnableWboit, PluginFeatureDetection.preferWebGl1],
                [PluginConfig.General.PreferWebGl1, PluginFeatureDetection.preferWebGl1]
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
                this._plugin.customStructureControls.delete(AssemblySymmetry.Tag.Representation);

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
        this.resetCamera(0);
        return out;
    }

    loadStructureFromUrl<P, S>(url: string, format: BuiltInTrajectoryFormat, isBinary: boolean, config?: {props?: PresetProps; matrix?: Mat4; reprProvider?: TrajectoryHierarchyPresetProvider<P, S>, params?: P}) {
        return this.customState.modelLoader.load({ fileOrUrl: url, format, isBinary }, config?.props, config?.matrix, config?.reprProvider, config?.params);
    }

    loadSnapshotFromUrl(url: string, type: PluginState.SnapshotType) {
        return PluginCommands.State.Snapshots.OpenUrl(this._plugin, { url, type });
    }

    loadStructureFromData<P, S>(data: string | number[], format: BuiltInTrajectoryFormat, isBinary: boolean, config?: {props?: PresetProps & { dataLabel?: string }; matrix?: Mat4; reprProvider?: TrajectoryHierarchyPresetProvider<P, S>, params?: P}) {
        return this.customState.modelLoader.parse({ data, format, isBinary }, config?.props, config?.matrix, config?.reprProvider, config?.params);
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

    clearSelection(mode: 'select' | 'hover', target?: { modelId: string; } & Target) {
        clearSelection(this._plugin, mode, target);
    }

    async createComponent(label: string, targets: SelectBase | SelectTarget | SelectTarget[], representationType: StructureRepresentationRegistry.BuiltIn) {
        await createComponent(this._plugin, label, targets, representationType);
    }

    async removeComponent(componentLabel: string) {
        await removeComponent(this._plugin, componentLabel);
    }
}


