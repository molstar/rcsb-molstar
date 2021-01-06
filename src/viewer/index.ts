/**
 * Copyright (c) 2019-2020 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import { BehaviorSubject } from 'rxjs';
import { DefaultPluginSpec } from 'molstar/lib/mol-plugin';
import { Plugin } from 'molstar/lib/mol-plugin-ui/plugin'
import './index.html'
import './favicon.ico'
import { PluginContext } from 'molstar/lib/mol-plugin/context';
import { PluginCommands } from 'molstar/lib/mol-plugin/commands';
import { ViewerState as ViewerState, CollapsedState, ModelUrlProvider } from './types';
import { PluginSpec } from 'molstar/lib/mol-plugin/spec';

import { ColorNames } from 'molstar/lib/mol-util/color/names';
import ReactDOM = require('react-dom');
import React = require('react');
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
require('./skin/rcsb.scss')

/** package version, filled in at bundle build time */
declare const __RCSB_MOLSTAR_VERSION__: string
export const RCSB_MOLSTAR_VERSION = __RCSB_MOLSTAR_VERSION__;

/** unix time stamp, to be filled in at bundle build time */
declare const __BUILD_TIMESTAMP__: number
export const BUILD_TIMESTAMP = __BUILD_TIMESTAMP__;
export const BUILD_DATE = new Date(BUILD_TIMESTAMP);

const Extensions = {
    'rcsb-assembly-symmetry': PluginSpec.Behavior(RCSBAssemblySymmetry),
    'rcsb-validation-report': PluginSpec.Behavior(RCSBValidationReport)
};

const DefaultViewerProps = {
    showImportControls: false,
    showExportControls: false,
    showSessionControls: false,
    modelUrlProviders: [
        (pdbId: string) => ({
            url: `//models.rcsb.org/${pdbId.toLowerCase()}.bcif`,
            format: 'mmcif',
            isBinary: true
        }),
        (pdbId: string) => ({
            url: `//files.rcsb.org/download/${pdbId.toLowerCase()}.cif`,
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
    volumeStreamingServer: '//maps.rcsb.org/',

    backgroundColor: ColorNames.white,
    showWelcomeToast: true,

    panelVisibility: {
        selection: false,
        measurements: true,
        superposition: false,
        component: true,
        volume: false,
        custom: false
    }
};
type ViewerProps = typeof DefaultViewerProps

export class Viewer {
    private readonly plugin: PluginContext;
    private readonly modelUrlProviders: ModelUrlProvider[];

    private get customState() {
        return this.plugin.customState as ViewerState
    }

    constructor(target: string | HTMLElement, props: Partial<ViewerProps> = {}) {
        target = typeof target === 'string' ? document.getElementById(target)! : target

        const o = { ...DefaultViewerProps, ...props }

        const spec: PluginSpec = {
            actions: [...DefaultPluginSpec.actions],
            behaviors: [
                ...DefaultPluginSpec.behaviors,
                ...o.extensions.map(e => Extensions[e]),
            ],
            animations: [...DefaultPluginSpec.animations || []],
            customParamEditors: DefaultPluginSpec.customParamEditors,
            layout: {
                initial: {
                    isExpanded: o.layoutIsExpanded,
                    showControls: o.layoutShowControls,
                    controlsDisplay: o.layoutControlsDisplay,
                },
                controls: {
                    ...DefaultPluginSpec.layout && DefaultPluginSpec.layout.controls,
                    top: o.layoutShowSequence ? undefined : 'none',
                    bottom: o.layoutShowLog ? undefined : 'none',
                    // left: 'none',
                    right: ControlsWrapper,
                }
            },
            components: {
                ...DefaultPluginSpec.components,
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

        this.plugin = new PluginContext(spec);
        this.modelUrlProviders = o.modelUrlProviders;

        (this.plugin.customState as ViewerState) = {
            showImportControls: o.showImportControls,
            showExportControls: o.showExportControls,
            showSessionControls: o.showSessionControls,
            modelLoader: new ModelLoader(this.plugin),
            collapsed: new BehaviorSubject<CollapsedState>({
                selection: true,
                measurements: true,
                superposition: true,
                component: false,
                volume: true,
                custom: true,
            }),
            visibility: new BehaviorSubject<CollapsedState>({ ...o.panelVisibility })
        }

        this.plugin.init();
        ReactDOM.render(React.createElement(Plugin, { plugin: this.plugin }), target)

        const renderer = this.plugin.canvas3d!.props.renderer;
        PluginCommands.Canvas3D.SetSettings(this.plugin, { settings: { renderer: { ...renderer, backgroundColor: o.backgroundColor } } });

        this.plugin.representation.structure.themes.colorThemeRegistry.add(SuperposeColorThemeProvider);

        if (o.showWelcomeToast) {
            PluginCommands.Toast.Show(this.plugin, {
                title: 'Welcome',
                message: `RCSB PDB Mol* Viewer ${RCSB_MOLSTAR_VERSION} [${BUILD_DATE.toLocaleString()}]`,
                key: 'toast-welcome',
                timeoutMs: 5000
            })
        }
    }

    //

    resetCamera(durationMs?: number) {
        this.plugin.managers.camera.reset(undefined, durationMs);
    }

    clear() {
        const state = this.plugin.state.data;
        return PluginCommands.State.RemoveObject(this.plugin, { state, ref: state.tree.root.ref })
    }

    async loadPdbId(pdbId: string, props?: PresetProps, matrix?: Mat4) {
        for (const provider of this.modelUrlProviders) {
            try {
                const p = provider(pdbId)
                await this.customState.modelLoader.load({ fileOrUrl: p.url, format: p.format, isBinary: p.isBinary }, props, matrix)
                break
            } catch (e) {
                console.warn(`loading '${pdbId}' failed with '${e}', trying next model-loader-provider`)
            }
        }
    }

    async loadPdbIds(args: { pdbId: string, props?: PresetProps, matrix?: Mat4 }[]) {
        for (const { pdbId, props, matrix } of args) {
            await this.loadPdbId(pdbId, props, matrix);
        }
        this.resetCamera(0);
    }

    loadStructureFromUrl(url: string, format: BuiltInTrajectoryFormat, isBinary: boolean, props?: PresetProps, matrix?: Mat4) {
        return this.customState.modelLoader.load({ fileOrUrl: url, format, isBinary }, props, matrix)
    }

    loadSnapshotFromUrl(url: string, type: PluginState.SnapshotType) {
        return PluginCommands.State.Snapshots.OpenUrl(this.plugin, { url, type });
    }

    async loadStructureFromData(data: string | number[], format: BuiltInTrajectoryFormat, isBinary: boolean, props?: PresetProps & { dataLabel?: string }, matrix?: Mat4) {
        return this.customState.modelLoader.parse({ data, format, isBinary }, props, matrix);
    }

    handleResize() {
        this.plugin.layout.events.updated.next();
    }

    async exportLoadedStructures() {
        const content = encodeStructureData(this.plugin);
        downloadAsZipFile(content);
    }
}