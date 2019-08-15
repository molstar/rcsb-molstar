/**
 * Copyright (c) 2019 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 * @author David Sehnal <david.sehnal@gmail.com>
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
import { StructureSelectionQueries as Q } from 'molstar/lib/mol-plugin/util/structure-selection-helper';
import { Model } from 'molstar/lib/mol-model/structure';
import { MolScriptBuilder as MS } from 'molstar/lib/mol-script/language/builder';
require('molstar/lib/mol-plugin/skin/light.scss')

export class StructureViewer {
    plugin: PluginContext;

    init(target: string | HTMLElement, options?: {
        // TODO
    }) {
        this.plugin = createPlugin(typeof target === 'string' ? document.getElementById(target)! : target, {
            ...DefaultPluginSpec,
            behaviors: [
                PluginSpec.Behavior(PluginBehaviors.Representation.HighlightLoci),
                PluginSpec.Behavior(PluginBehaviors.Representation.SelectLoci),
                PluginSpec.Behavior(PluginBehaviors.Representation.DefaultLociLabelProvider),
                PluginSpec.Behavior(PluginBehaviors.Camera.FocusLociOnSelect, { minRadius: 8, extraRadius: 4 }),
                PluginSpec.Behavior(PluginBehaviors.CustomProps.RCSBAssemblySymmetry, { autoAttach: true }),
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
    }

    get state() {
        return this.plugin.state.dataState;
    }

    private download(b: StateBuilder.To<PSO.Root>, url: string) {
        return b.apply(StateTransforms.Data.Download, { url, isBinary: false })
    }

    private model(b: StateBuilder.To<PSO.Data.Binary | PSO.Data.String>, format: SupportedFormats, assemblyId: string) {
        const parsed = format === 'cif'
            ? b.apply(StateTransforms.Data.ParseCif).apply(StateTransforms.Model.TrajectoryFromMmCif, {}, { ref: StateElements.Trajectory })
            : b.apply(StateTransforms.Model.TrajectoryFromPDB, {}, { ref: StateElements.Trajectory });

        return parsed
            .apply(StateTransforms.Model.ModelFromTrajectory, { modelIndex: 0 }, { ref: StateElements.Model });
    }

    private structure(assemblyId: string) {
        const model = this.state.build().to(StateElements.Model);

        const s = model
            .apply(StateTransforms.Model.StructureAssemblyFromModel, { id: assemblyId || 'deposited' }, { ref: StateElements.Assembly });

        return s;
    }

    private applyState(tree: StateBuilder) {
        return PluginCommands.State.Update.dispatch(this.plugin, { state: this.plugin.state.dataState, tree });
    }

    private loadedParams: LoadParams = { url: '', format: 'cif', assemblyId: '' };
    async load({ url, format = 'cif', assemblyId = '' }: LoadParams) {
        let loadType: 'full' | 'update' = 'full';

        const state = this.plugin.state.dataState;

        if (this.loadedParams.url !== url || this.loadedParams.format !== format) {
            loadType = 'full';
        } else if (this.loadedParams.url === url) {
            if (state.select(StateElements.Assembly).length > 0) loadType = 'update';
        }

        if (loadType === 'full') {
            await PluginCommands.State.RemoveObject.dispatch(this.plugin, { state, ref: state.tree.root.ref });
            const modelTree = this.model(this.download(state.build().toRoot(), url), format, assemblyId);
            await this.applyState(modelTree);
            const structureTree = this.structure(assemblyId);
            await this.applyState(structureTree);
        } else {
            const tree = state.build();
            tree.to(StateElements.Assembly).update(StateTransforms.Model.StructureAssemblyFromModel, p => ({ ...p, id: assemblyId || 'deposited' }));
            await this.applyState(tree);
        }

        await this.updateStyle();

        this.loadedParams = { url, format, assemblyId };
        Scheduler.setImmediate(() => PluginCommands.Camera.Reset.dispatch(this.plugin, { }));

        this.experimentalData.init()
    }

    async updateStyle() {
        const { structureRepresentation: rep } = this.plugin.helpers
        await rep.setFromExpression('add', 'cartoon', Q.all)
        await rep.setFromExpression('add', 'carbohydrate', Q.all)
        await rep.setFromExpression('add', 'ball-and-stick', MS.struct.modifier.union([
            MS.struct.combinator.merge([ Q.ligandsPlusConnected, Q.branchedConnectedOnly, Q.water ])
        ]))
    }

    experimentalData = {
        init: async () => {
            const model = this.state.select(StateElements.Model)[0].obj;
            const asm = this.state.select(StateElements.Assembly)[0].obj;
            if (!model || !asm) return

            const m = model.data as Model
            const hasXrayMap = m.sourceData.data.pdbx_database_status.status_code_sf.value(0) === 'REL'
            let hasEmMap = false
            for (let i = 0, il = m.sourceData.data.pdbx_database_related._rowCount; i < il; ++i) {
                if (m.sourceData.data.pdbx_database_related.db_name.value(i).toUpperCase() === 'EMDB') {
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
        remove: () => {
            const r = this.state.select(StateSelection.Generators.ofTransformer(CreateVolumeStreamingInfo))[0];
            if (!r) return;
            PluginCommands.State.RemoveObject.dispatch(this.plugin, { state: this.state, ref: r.transform.ref });
        }
    }
}