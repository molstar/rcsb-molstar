/**
 * Copyright (c) 2019 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import { DefaultPluginSpec } from 'molstar/lib/mol-plugin';
import { Plugin } from 'molstar/lib/mol-plugin/ui/plugin'
import './index.html'
import './favicon.ico'
import { PluginContext } from 'molstar/lib/mol-plugin/context';
import { PluginCommands } from 'molstar/lib/mol-plugin/command';
import { PluginBehaviors } from 'molstar/lib/mol-plugin/behavior';
import { AnimateModelIndex } from 'molstar/lib/mol-plugin/state/animation/built-in';
import { SupportedFormats, StructureViewerState, StructureViewerProps } from './types';
import { ControlsWrapper, ViewportWrapper } from './ui/controls';
import { PluginSpec } from 'molstar/lib/mol-plugin/spec';
import { StructureRepresentationInteraction } from 'molstar/lib/mol-plugin/behavior/dynamic/selection/structure-representation-interaction';

import { ColorNames } from 'molstar/lib/mol-util/color/names';
import { StructureView } from './helpers/structure';
import ReactDOM = require('react-dom');
import React = require('react');
import { ModelLoader } from './helpers/model';
import { VolumeData } from './helpers/volume';
require('./skin/rcsb.scss')

/** package version, filled in at bundle build time */
declare const __RCSB_MOLSTAR_VERSION__: string
export const RCSB_MOLSTAR_VERSION = __RCSB_MOLSTAR_VERSION__;

export const DefaultStructureViewerProps: StructureViewerProps = {
    volumeServerUrl: '//maps.rcsb.org/',
    modelUrlProvider: (pdbId: string) => {
        const id = pdbId.toLowerCase()
        return {
            url: `//models.rcsb.org/${id}.bcif`,
            format: 'bcif' as SupportedFormats
        }
    },
    showOpenFileControls: false,
}

export class StructureViewer {
    private readonly plugin: PluginContext;
    private readonly props: Readonly<StructureViewerProps>

    constructor(target: string | HTMLElement, props: Partial<StructureViewerProps> = {}) {
        target = typeof target === 'string' ? document.getElementById(target)! : target

        this.props = { ...DefaultStructureViewerProps, ...props }

        this.plugin = new PluginContext({
            ...DefaultPluginSpec,
            behaviors: [
                PluginSpec.Behavior(PluginBehaviors.Representation.HighlightLoci),
                PluginSpec.Behavior(PluginBehaviors.Representation.SelectLoci),
                PluginSpec.Behavior(PluginBehaviors.Representation.DefaultLociLabelProvider),
                PluginSpec.Behavior(PluginBehaviors.Camera.FocusLoci, {
                    minRadius: 8,
                    extraRadius: 4
                }),
                PluginSpec.Behavior(PluginBehaviors.CustomProps.RCSBAssemblySymmetry, {
                    autoAttach: true
                }),
                PluginSpec.Behavior(StructureRepresentationInteraction)
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
                },
                viewport: ViewportWrapper
            }
        });

        (this.plugin.customState as StructureViewerState) = {
            props: this.props,
            modelLoader: new ModelLoader(this.plugin),
            structureView: new StructureView(this.plugin),
            volumeData: new VolumeData(this.plugin)
        }

        ReactDOM.render(React.createElement(Plugin, { plugin: this.plugin }), target)

        const renderer = this.plugin.canvas3d.props.renderer;
        PluginCommands.Canvas3D.SetSettings.dispatch(this.plugin, { settings: { renderer: { ...renderer, backgroundColor: ColorNames.white } } })

        PluginCommands.Toast.Show.dispatch(this.plugin, {
            title: 'Welcome',
            message: `RCSB PDB Mol* Viewer ${RCSB_MOLSTAR_VERSION}`,
            key: 'toast-welcome',
            timeoutMs: 10000
        })
    }

    async loadPdbId(pdbId: string, assemblyId = 'deposited') {
        const p = this.props.modelUrlProvider(pdbId)
        return (this.plugin.customState as StructureViewerState).modelLoader.load({
            fileOrUrl: p.url,
            format: p.format,
            assemblyId,
        })
    }

    async loadUrl(url: string, assemblyId = 'deposited') {
        return (this.plugin.customState as StructureViewerState).modelLoader.load({
            fileOrUrl: url,
            format: 'cif',
            assemblyId,
        })
    }
}