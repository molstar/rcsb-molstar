/**
 * Copyright (c) 2019-2020 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 * @author Joan Segura <joan.segura@rcsb.org>
 */

import { BehaviorSubject } from 'rxjs';
import { Plugin } from 'molstar/lib/mol-plugin-ui/plugin';
import { PluginContext } from 'molstar/lib/mol-plugin/context';
import { PluginCommands } from 'molstar/lib/mol-plugin/commands';
import { ViewerState as ViewerState, CollapsedState, ModelUrlProvider } from './types';
import { PluginSpec } from 'molstar/lib/mol-plugin/spec';

import { ColorNames } from 'molstar/lib/mol-util/color/names';
import * as React from 'react';
import * as ReactDOM from 'react-dom';

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
import { encodeStructureData, downloadAsZipFile } from './helpers/export';
import { ViewerMethods } from './helpers/viewer';
import { StructureRef } from 'molstar/lib/mol-plugin-state/manager/structure/hierarchy-state';
import { StructureRepresentationRegistry } from 'molstar/lib/mol-repr/structure/registry';
import { Mp4Export } from 'molstar/lib/extensions/mp4-export';
import { DefaultPluginUISpec, PluginUISpec } from 'molstar/lib/mol-plugin-ui/spec';
import { PluginUIContext } from 'molstar/lib/mol-plugin-ui/context';
import { ANVILMembraneOrientation, MembraneOrientationPreset } from 'molstar/lib/extensions/anvil/behavior';
import { MembraneOrientationRepresentationProvider } from 'molstar/lib/extensions/anvil/representation';
import { MotifAlignmentRequest, alignMotifs } from './helpers/superpose/pecos-integration';

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
    'mp4-export': PluginSpec.Behavior(Mp4Export),
    'anvil-membrane-orientation': PluginSpec.Behavior(ANVILMembraneOrientation)
};

const DefaultViewerProps = {
    showImportControls: false,
    showExportControls: false,
    showSessionControls: false,
    showStructureSourceControls: true,
    showSuperpositionControls: true,
    showMembraneOrientationPreset: false,
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
export type ViewerProps = typeof DefaultViewerProps


export class Viewer {
    private readonly plugin: PluginUIContext;
    private readonly modelUrlProviders: ModelUrlProvider[];

    private get customState() {
        return this.plugin.customState as ViewerState;
    }

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
            animations: [...defaultSpec.animations || []],
            layout: {
                initial: {
                    isExpanded: o.layoutIsExpanded,
                    showControls: o.layoutShowControls,
                    controlsDisplay: o.layoutControlsDisplay,
                },
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
                [PluginConfig.Download.DefaultEmdbProvider, 'rcsb']
            ]
        };

        this.plugin = new PluginUIContext(spec);
        this.modelUrlProviders = o.modelUrlProviders;

        (this.plugin.customState as ViewerState) = {
            showImportControls: o.showImportControls,
            showExportControls: o.showExportControls,
            showSessionControls: o.showSessionControls,
            showStructureSourceControls: o.showStructureSourceControls,
            showSuperpositionControls: o.showSuperpositionControls,
            modelLoader: new ModelLoader(this.plugin),
            collapsed: new BehaviorSubject<CollapsedState>({
                selection: true,
                strucmotifSubmit: true,
                measurements: true,
                superposition: true,
                component: false,
                volume: true,
                custom: true
            }),
            detachedFromSierra: o.detachedFromSierra
        };

        this.plugin.init()
            .then(async () => {
                // hide 'Membrane Orientation' preset from UI - has to happen 'before' react render, apparently
                if (!o.showMembraneOrientationPreset) {
                    this.plugin.builders.structure.representation.unregisterPreset(MembraneOrientationPreset);
                    this.plugin.representation.structure.registry.remove(MembraneOrientationRepresentationProvider);
                }

                ReactDOM.render(React.createElement(Plugin, { plugin: this.plugin }), element);

                const renderer = this.plugin.canvas3d!.props.renderer;
                await PluginCommands.Canvas3D.SetSettings(this.plugin, { settings: { renderer: { ...renderer, backgroundColor: o.backgroundColor } } });
                this.plugin.representation.structure.themes.colorThemeRegistry.add(SuperposeColorThemeProvider);

                if (o.showWelcomeToast) {
                    await PluginCommands.Toast.Show(this.plugin, {
                        title: 'Welcome',
                        message: `RCSB PDB Mol* Viewer ${RCSB_MOLSTAR_VERSION} [${BUILD_DATE.toLocaleString()}]`,
                        key: 'toast-welcome',
                        timeoutMs: 5000
                    });
                }

                this.prevExpanded = this.plugin.layout.state.isExpanded;
                this.plugin.layout.events.updated.subscribe(() => this.toggleControls());
            });
    }

    private prevExpanded: boolean;

    private toggleControls(): void {

        const currExpanded = this.plugin.layout.state.isExpanded;
        const expandedChanged = (this.prevExpanded !== currExpanded);
        if (!expandedChanged) return;

        if (currExpanded && !this.plugin.layout.state.showControls) {
            this.plugin.layout.setProps({showControls: true});
        } else if (!currExpanded && this.plugin.layout.state.showControls) {
            this.plugin.layout.setProps({showControls: false});
        }
        this.prevExpanded = this.plugin.layout.state.isExpanded;
    }

    //

    resetCamera(durationMs?: number) {
        this.plugin.managers.camera.reset(undefined, durationMs);
    }

    clear() {
        const state = this.plugin.state.data;
        return PluginCommands.State.RemoveObject(this.plugin, { state, ref: state.tree.root.ref });
    }

    async loadPdbId(pdbId: string, props?: PresetProps, matrix?: Mat4) {
        for (const provider of this.modelUrlProviders) {
            try {
                const p = provider(pdbId);
                await this.customState.modelLoader.load({ fileOrUrl: p.url, format: p.format, isBinary: p.isBinary }, props, matrix);
                break;
            } catch (e) {

                console.warn(`loading '${pdbId}' failed with '${e}', trying next model-loader-provider`);
            }
        }
    }

    async loadPdbIds(args: { pdbId: string, props?: PresetProps, matrix?: Mat4 }[]) {
        for (const { pdbId, props, matrix } of args) {
            await this.loadPdbId(pdbId, props, matrix);
        }
        this.resetCamera(0);
    }

    async alignMotifs(request: MotifAlignmentRequest) {
        const { query, hits } = request;

        await this.loadPdbId(query.entry_id,
            {
                kind: 'motif',
                label: query.entry_id,
                targets: query.residue_ids
            });

        for (const hit of hits) {
            const { rmsd, matrix } = await alignMotifs(query, hit);
            await this.loadPdbId(hit.entry_id, {
                kind: 'motif',
                assemblyId: hit.assembly_id,
                label: `${hit.entry_id} #${hit.id}: ${rmsd.toFixed(2)} RMSD`,
                targets: hit.residue_ids
            }, matrix);
            this.resetCamera(0);
        }
    }

    loadStructureFromUrl(url: string, format: BuiltInTrajectoryFormat, isBinary: boolean, props?: PresetProps, matrix?: Mat4) {
        return this.customState.modelLoader.load({ fileOrUrl: url, format, isBinary }, props, matrix);
    }

    loadSnapshotFromUrl(url: string, type: PluginState.SnapshotType) {
        return PluginCommands.State.Snapshots.OpenUrl(this.plugin, { url, type });
    }

    async loadStructureFromData(data: string | number[], format: BuiltInTrajectoryFormat, isBinary: boolean, props?: PresetProps & { dataLabel?: string }, matrix?: Mat4) {
        return this.customState.modelLoader.parse({ data, format, isBinary }, props, matrix);
    }

    handleResize() {
        this.plugin.layout.events.updated.next(void 0);
    }

    exportLoadedStructures() {
        const content = encodeStructureData(this.plugin);
        return downloadAsZipFile(this.plugin, content);
    }

    pluginCall(f: (plugin: PluginContext) => void){
        f(this.plugin);
    }

    public getPlugin(): PluginContext {
        return this.plugin;
    }

    public setFocus(modelId: string, asymId: string, begin: number, end: number): void;
    public setFocus(...args: any[]): void{
        if(args.length === 4)
            ViewerMethods.setFocusFromRange(this.plugin, args[0], args[1], args[2], args[3]);
        if(args.length === 2)
            ViewerMethods.setFocusFromSet(this.plugin, args[0], args[1]);
    }

    public clearFocus(): void {
        this.plugin.managers.structure.focus.clear();
    }

    public select(selection: Array<{modelId: string; asymId: string; position: number;}>, mode: 'select'|'hover', modifier: 'add'|'set'): void;
    public select(selection: Array<{modelId: string; asymId: string; begin: number; end: number;}>, mode: 'select'|'hover', modifier: 'add'|'set'): void;
    public select(modelId: string, asymId: string, position: number, mode: 'select'|'hover', modifier: 'add'|'set'): void;
    public select(modelId: string, asymId: string, begin: number, end: number, mode: 'select'|'hover', modifier: 'add'|'set'): void;
    public select(...args: any[]){
        if(args.length === 3 && (args[0] as Array<{modelId: string; asymId: string; position: number;}>).length > 0 && typeof (args[0] as Array<{modelId: string; asymId: string; position: number;}>)[0].position === 'number'){
            if(args[2] === 'set')
                this.clearSelection('select');
            (args[0] as Array<{modelId: string; asymId: string; position: number;}>).forEach(r=>{
                ViewerMethods.selectSegment(this.plugin, r.modelId, r.asymId, r.position, r.position, args[1], 'add');
            });
        }else if(args.length === 3 && (args[0] as Array<{modelId: string; asymId: string; begin: number; end: number;}>).length > 0 && typeof (args[0] as Array<{modelId: string; asymId: string; begin: number; end: number;}>)[0].begin === 'number'){
            ViewerMethods.selectMultipleSegments(this.plugin, args[0], args[1], args[2]);
        }else if(args.length === 5){
            ViewerMethods.selectSegment(this.plugin, args[0], args[1], args[2], args[2], args[3], args[4]);
        }else if(args.length === 6){
            ViewerMethods.selectSegment(this.plugin, args[0], args[1], args[2], args[3], args[4], args[5]);
        }
    }

    public clearSelection(mode: 'select'|'hover', options?: {modelId: string; labelAsymId: string;}): void {
        ViewerMethods.clearSelection(this.plugin, mode, options);
    }

    public async createComponent(componentLabel: string, modelId: string, asymId: string, representationType: StructureRepresentationRegistry.BuiltIn): Promise<void>;
    public async createComponent(componentLabel: string, modelId: string, residues: Array<{asymId: string; position: number;}>, representationType: StructureRepresentationRegistry.BuiltIn): Promise<void>;
    public async createComponent(componentLabel: string, modelId: string, residues: Array<{asymId: string; begin: number; end: number;}>, representationType: StructureRepresentationRegistry.BuiltIn): Promise<void>;
    public async createComponent(componentLabel: string, modelId: string, asymId: string, begin: number, end: number, representationType: StructureRepresentationRegistry.BuiltIn): Promise<void>;
    public async createComponent(...args: any[]): Promise<void>{
        const structureRef: StructureRef | undefined = ViewerMethods.getStructureRefWithModelId(this.plugin.managers.structure.hierarchy.current.structures, args[1]);
        if(structureRef == null)
            throw 'createComponent error: model not found';
        if (args.length === 4 && typeof args[2] === 'string') {
            await ViewerMethods.createComponentFromChain(this.plugin, args[0], structureRef, args[2], args[3]);
        } else if (args.length === 4 && args[2] instanceof Array && args[2].length > 0 && typeof args[2][0].position === 'number') {
            await ViewerMethods.createComponentFromSet(this.plugin, args[0], structureRef, args[2], args[3]);
        } else if (args.length === 4 && args[2] instanceof Array && args[2].length > 0 && typeof args[2][0].begin === 'number') {
            await ViewerMethods.createComponentFromMultipleRange(this.plugin, args[0], structureRef, args[2], args[3]);
        }else if (args.length === 6) {
            await ViewerMethods.createComponentFromRange(this.plugin, args[0], structureRef, args[2], args[3], args[4], args[5]);
        }
    }

    public removeComponent(componentLabel: string): void{
        ViewerMethods.removeComponent(this.plugin, componentLabel);
    }
}


