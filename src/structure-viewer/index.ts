/**
 * Copyright (c) 2019 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import { createPlugin, DefaultPluginSpec } from 'molstar/lib/mol-plugin';
import './index.html'
import { PluginContext } from 'molstar/lib/mol-plugin/context';
import { PluginCommands } from 'molstar/lib/mol-plugin/command';
import { PluginBehaviors } from 'molstar/lib/mol-plugin/behavior';
import { StateTransforms } from 'molstar/lib/mol-plugin/state/transforms';
import { PluginStateObject as PSO } from 'molstar/lib/mol-plugin/state/objects';
import { AnimateModelIndex } from 'molstar/lib/mol-plugin/state/animation/built-in';
import { StateBuilder, StateSelection } from 'molstar/lib/mol-state';
import { LoadParams, SupportedFormats, StateElements } from './helpers';
import { ControlsWrapper, ViewportWrapper } from './ui/controls';
import { Scheduler } from 'molstar/lib/mol-task';
import { InitVolumeStreaming, CreateVolumeStreamingInfo } from 'molstar/lib/mol-plugin/behavior/dynamic/volume-streaming/transformers';
import { ParamDefinition } from 'molstar/lib/mol-util/param-definition';
import { PluginSpec } from 'molstar/lib/mol-plugin/spec';
import { StructureRepresentationInteraction } from 'molstar/lib/mol-plugin/behavior/dynamic/selection/structure-representation-interaction';
import { Model } from 'molstar/lib/mol-model/structure';
import { ColorNames } from 'molstar/lib/mol-util/color/names';
import { StructureControlsHelper } from './ui/structure';
require('./skin/rcsb.scss')

export class StructureViewer {
    plugin: PluginContext;
    structureControlsHelper: StructureControlsHelper;

    init(target: string | HTMLElement) {
        target = typeof target === 'string' ? document.getElementById(target)! : target
        this.plugin = createPlugin(target, {
            ...DefaultPluginSpec,
            behaviors: [
                PluginSpec.Behavior(PluginBehaviors.Representation.HighlightLoci),
                PluginSpec.Behavior(PluginBehaviors.Representation.SelectLoci),
                PluginSpec.Behavior(PluginBehaviors.Representation.DefaultLociLabelProvider),
                PluginSpec.Behavior(PluginBehaviors.Camera.FocusLociOnSelect, {
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

        const renderer = this.plugin.canvas3d.props.renderer;
        PluginCommands.Canvas3D.SetSettings.dispatch(this.plugin, { settings: { renderer: { ...renderer, backgroundColor: ColorNames.white } } });
        this.structureControlsHelper = new StructureControlsHelper(this.plugin)
    }

    get state() {
        return this.plugin.state.dataState;
    }

    private download(b: StateBuilder.To<PSO.Root>, url: string) {
        return b.apply(StateTransforms.Data.Download, { url, isBinary: false })
    }

    private model(b: StateBuilder.To<PSO.Data.Binary | PSO.Data.String>, format: SupportedFormats) {
        const parsed = format === 'cif'
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

        const modelTree = this.model(this.download(state.build().toRoot(), url), format);
        await this.applyState(modelTree);

        await this.structureControlsHelper.setAssembly(assemblyId)

        Scheduler.setImmediate(() => PluginCommands.Camera.Reset.dispatch(this.plugin, { }));

        this.experimentalData.init()
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
                const params = ParamDefinition.getDefaultValues(InitVolumeStreaming.definition.params!(asm, this.plugin));
                params.behaviorRef = StateElements.VolumeStreaming;
                params.defaultView = 'selection-box';
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