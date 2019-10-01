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
import { StateTransforms } from 'molstar/lib/mol-plugin/state/transforms';
import { PluginStateObject as PSO } from 'molstar/lib/mol-plugin/state/objects';
import { AnimateModelIndex } from 'molstar/lib/mol-plugin/state/animation/built-in';
import { StateBuilder, StateSelection } from 'molstar/lib/mol-state';
import { LoadParams, SupportedFormats, StateElements, StructureViewerState } from './helpers';
import { ControlsWrapper, ViewportWrapper } from './ui/controls';
import { Scheduler } from 'molstar/lib/mol-task';
import { InitVolumeStreaming, CreateVolumeStreamingInfo } from 'molstar/lib/mol-plugin/behavior/dynamic/volume-streaming/transformers';
import { ParamDefinition as PD } from 'molstar/lib/mol-util/param-definition';
import { PluginSpec } from 'molstar/lib/mol-plugin/spec';
import { StructureRepresentationInteraction } from 'molstar/lib/mol-plugin/behavior/dynamic/selection/structure-representation-interaction';
import { Model } from 'molstar/lib/mol-model/structure';
import { ColorNames } from 'molstar/lib/mol-util/color/names';
import { StructureControlsHelper } from './ui/structure';
import ReactDOM = require('react-dom');
import React = require('react');
require('./skin/rcsb.scss')

export const DefaultStructureViewerProps = {
    // volumeServerUrl: 'https://ds.litemol.org/',
    volumeServerUrl: '//alpha-maps.rcsb.org/',
    modelUrlProvider: (pdbId: string) => {
        const id = pdbId.toLowerCase()
        return {
            // url: `https://files.rcsb.org/download/${id}.cif`,
            // format: 'cif' as SupportedFormats
            url: `//alpha-models.rcsb.org/${id}.bcif`,
            format: 'bcif' as SupportedFormats
        }
    },
}
export type StructureViewerProps = typeof DefaultStructureViewerProps

export class StructureViewer {
    private readonly plugin: PluginContext;
    private readonly props: Readonly<StructureViewerProps>

    constructor(target: string | HTMLElement, props: Partial<StructureViewerProps> = {}) {
        target = typeof target === 'string' ? document.getElementById(target)! : target

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
                    outsideControls: false
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
            structureControlsHelper: new StructureControlsHelper(this.plugin),
            experimentalData: this.experimentalData
        };

        this.props = { ...DefaultStructureViewerProps, ...props }

        ReactDOM.render(React.createElement(Plugin, { plugin: this.plugin }), target)

        const renderer = this.plugin.canvas3d.props.renderer;
        PluginCommands.Canvas3D.SetSettings.dispatch(this.plugin, { settings: { renderer: { ...renderer, backgroundColor: ColorNames.white } } });
    }

    get state() {
        return this.plugin.state.dataState;
    }

    private download(b: StateBuilder.To<PSO.Root>, url: string, isBinary: boolean) {
        return b.apply(StateTransforms.Data.Download, { url, isBinary })
    }

    private model(b: StateBuilder.To<PSO.Data.Binary | PSO.Data.String>, format: SupportedFormats) {
        const isMmcif = format === 'cif' || format === 'bcif'
        const parsed = isMmcif
            ? b.apply(StateTransforms.Data.ParseCif).apply(StateTransforms.Model.TrajectoryFromMmCif, {}, { ref: StateElements.Trajectory })
            : b.apply(StateTransforms.Model.TrajectoryFromPDB, {}, { ref: StateElements.Trajectory });

        return parsed
            .apply(StateTransforms.Model.ModelFromTrajectory, { modelIndex: 0 }, { ref: StateElements.Model });
    }

    private applyState(tree: StateBuilder) {
        return PluginCommands.State.Update.dispatch(this.plugin, { state: this.plugin.state.dataState, tree });
    }

    async load({ url, format = 'cif', assemblyId = 'deposited' }: LoadParams) {
        if (!url) return

        const state = this.plugin.state.dataState;
        await PluginCommands.State.RemoveObject.dispatch(this.plugin, { state, ref: state.tree.root.ref });

        const isBinary = format === 'bcif'
        const modelTree = this.model(this.download(state.build().toRoot(), url, isBinary), format);
        await this.applyState(modelTree);

        await (this.plugin.customState as StructureViewerState).structureControlsHelper.setAssembly(assemblyId)

        Scheduler.setImmediate(() => PluginCommands.Camera.Reset.dispatch(this.plugin, { }));
    }

    async loadPdbId(pdbId: string, assemblyId = 'deposited') {
        return this.load({
            assemblyId,
            ...this.props.modelUrlProvider(pdbId),
        })
    }

    experimentalData = {
        init: async () => {
            const model = this.state.select(StateElements.Model)[0].obj;
            const asm = this.state.select(StateElements.Assembly)[0].obj;
            if (!model || !asm) return

            const m = model.data as Model
            const d = m.sourceData.data
            const hasXrayMap = d.pdbx_database_status.status_code_sf.value(0) === 'REL'
            let hasEmMap = false
            for (let i = 0, il = d.pdbx_database_related._rowCount; i < il; ++i) {
                if (d.pdbx_database_related.db_name.value(i).toUpperCase() === 'EMDB') {
                    hasEmMap = true
                    break
                }
            }

            if (hasXrayMap || hasEmMap) {
                const params = PD.getDefaultValues(InitVolumeStreaming.definition.params!(asm, this.plugin));
                params.behaviorRef = StateElements.VolumeStreaming;
                params.defaultView = 'selection-box';
                params.serverUrl = this.props.volumeServerUrl
                await this.plugin.runTask(this.state.applyAction(InitVolumeStreaming, params, StateElements.Assembly));
            }
        },
        remove: async () => {
            const r = this.state.select(StateSelection.Generators.ofTransformer(CreateVolumeStreamingInfo))[0];
            if (!r) return;
            await PluginCommands.State.RemoveObject.dispatch(this.plugin, { state: this.state, ref: r.transform.ref });
        }
    }
}