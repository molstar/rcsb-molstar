/**
 * Copyright (c) 2019-2020 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import { DefaultPluginSpec } from 'molstar/lib/mol-plugin';
import { Plugin } from 'molstar/lib/mol-plugin-ui/plugin'
import './index.html'
import './favicon.ico'
import { PluginContext } from 'molstar/lib/mol-plugin/context';
import { PluginCommands } from 'molstar/lib/mol-plugin/commands';
import { PluginBehaviors } from 'molstar/lib/mol-plugin/behavior';
import { AnimateModelIndex } from 'molstar/lib/mol-plugin-state/animation/built-in';
import { SupportedFormats, StructureViewerState, StructureViewerProps } from './types';
import { PluginSpec } from 'molstar/lib/mol-plugin/spec';
import { StructureFocusRepresentation } from 'molstar/lib/mol-plugin/behavior/dynamic/selection/structure-focus-representation';

import { ColorNames } from 'molstar/lib/mol-util/color/names';
import ReactDOM = require('react-dom');
import React = require('react');
import { ModelLoader } from './helpers/model';
import { PresetProps } from './helpers/preset';
import { ControlsWrapper, ViewportWrapper } from './ui/controls';
import { PluginConfig } from 'molstar/lib/mol-plugin/config';
require('./skin/rcsb.scss')

/** package version, filled in at bundle build time */
declare const __RCSB_MOLSTAR_VERSION__: string
export const RCSB_MOLSTAR_VERSION = __RCSB_MOLSTAR_VERSION__;

/** unix time stamp, to be filled in at bundle build time */
declare const __VERSION_TIMESTAMP__: number
export const BUILD_TIMESTAMP = __VERSION_TIMESTAMP__;
export const BUILD_DATE = new Date(BUILD_TIMESTAMP);

export const DefaultStructureViewerProps: StructureViewerProps = {
    volumeServerUrl: '//maps.rcsb.org/',
    modelUrlProviders: [
        (pdbId: string) => ({
            url: `//models.rcsb.org/${pdbId.toLowerCase()}.bcif`,
            format: 'bcif' as const
        }),
        (pdbId: string) => ({
            url: `//files.rcsb.org/download/${pdbId.toLowerCase()}.cif`,
            format: 'cif' as const
        })
    ],
    showOpenFileControls: false,
}

export class StructureViewer {
    private readonly plugin: PluginContext;
    private readonly props: Readonly<StructureViewerProps>

    private get customState() {
        return this.plugin.customState as StructureViewerState
    }

    constructor(target: string | HTMLElement, props: Partial<StructureViewerProps> = {}) {
        target = typeof target === 'string' ? document.getElementById(target)! : target

        this.props = { ...DefaultStructureViewerProps, ...props }

        this.plugin = new PluginContext({
            ...DefaultPluginSpec,
            behaviors: [
                PluginSpec.Behavior(PluginBehaviors.Representation.HighlightLoci),
                PluginSpec.Behavior(PluginBehaviors.Representation.SelectLoci),
                PluginSpec.Behavior(PluginBehaviors.Representation.DefaultLociLabelProvider),
                PluginSpec.Behavior(PluginBehaviors.Representation.FocusLoci),
                PluginSpec.Behavior(PluginBehaviors.Camera.FocusLoci),
                PluginSpec.Behavior(StructureFocusRepresentation),

                PluginSpec.Behavior(PluginBehaviors.CustomProps.AccessibleSurfaceArea),
                PluginSpec.Behavior(PluginBehaviors.CustomProps.Interactions),
                PluginSpec.Behavior(PluginBehaviors.CustomProps.SecondaryStructure),
                PluginSpec.Behavior(PluginBehaviors.CustomProps.ValenceModel),
                PluginSpec.Behavior(PluginBehaviors.CustomProps.CrossLinkRestraint),

                PluginSpec.Behavior(PluginBehaviors.CustomProps.RCSBAssemblySymmetry),
                PluginSpec.Behavior(PluginBehaviors.CustomProps.RCSBValidationReport),
            ],
            animations: [
                AnimateModelIndex
            ],
            layout: {
                initial: {
                    isExpanded: false,
                    showControls: true,
                    controlsDisplay: 'reactive'
                },
                controls: {
                    left: 'none',
                    right: ControlsWrapper,
                    bottom: 'none'
                }
            },
            components: {
                viewport: {
                    view: ViewportWrapper,
                }
            },
            config: new Map([
                [PluginConfig.VolumeStreaming.DefaultServer, this.props.volumeServerUrl]
            ])
        });

        (this.plugin.customState as StructureViewerState) = {
            props: this.props,
            modelLoader: new ModelLoader(this.plugin),
        }

        ReactDOM.render(React.createElement(Plugin, { plugin: this.plugin }), target)

        const renderer = this.plugin.canvas3d!.props.renderer;
        PluginCommands.Canvas3D.SetSettings(this.plugin, { settings: { renderer: { ...renderer, backgroundColor: ColorNames.white } } })

        PluginCommands.Toast.Show(this.plugin, {
            title: 'Welcome',
            message: `RCSB PDB Mol* Viewer ${RCSB_MOLSTAR_VERSION} [${BUILD_DATE.toLocaleString()}]`,
            key: 'toast-welcome',
            timeoutMs: 5000
        })
    }

    //

    async loadPdbId(pdbId: string, props?: PresetProps) {
        for (const provider of this.props.modelUrlProviders) {
            try {
                const p = provider(pdbId)
        await this.customState.modelLoader.load({ fileOrUrl: p.url, format: p.format }, props)
                break
            } catch (e) {
                console.warn(`loading '${pdbId}' failed with '${e}', trying next model-loader-provider`)
            }
        }
    }

    async loadUrl(url: string, props?: PresetProps) {
        await this.customState.modelLoader.load({ fileOrUrl: url, format: 'cif', }, props)
    }
}