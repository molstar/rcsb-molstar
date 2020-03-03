/**
 * Copyright (c) 2019-2020 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import { StateElements, StructureViewerState } from '../types';
import { PluginCommands } from 'molstar/lib/mol-plugin/commands';
import { StateSelection, StateBuilder } from 'molstar/lib/mol-state';
import { PluginContext } from 'molstar/lib/mol-plugin/context';
import { InitVolumeStreaming, CreateVolumeStreamingInfo, CreateVolumeStreamingBehavior } from 'molstar/lib/mol-plugin/behavior/dynamic/volume-streaming/transformers';
import { ParamDefinition as PD } from 'molstar/lib/mol-util/param-definition';
import { Model } from 'molstar/lib/mol-model/structure';
import { deepClone } from 'molstar/lib/mol-util/object';
import { modelHasMap } from './util';

export class VolumeData {
    get customState() {
        return this.plugin.customState as StructureViewerState
    }

    get state() {
        return this.plugin.state.dataState
    }

    async applyState(tree: StateBuilder) {
        await PluginCommands.State.Update(this.plugin, { state: this.state, tree });
    }

    async init() {
        const r = this.state.select(StateSelection.Generators.ofTransformer(CreateVolumeStreamingInfo))[0]
        if (r) return

        const { props } = this.customState
        const model = this.state.select(StateElements.Model)[0].obj
        const asm = this.state.select(StateElements.Assembly)[0].obj
        if (!model || !asm) return

        const m = model.data as Model
        if (modelHasMap(m)) {
            const params = PD.getDefaultValues(InitVolumeStreaming.definition.params!(asm, this.plugin))
            params.defaultView = 'selection-box';
            params.options.behaviorRef = StateElements.VolumeStreaming
            params.options.serverUrl = props.volumeServerUrl
            await this.plugin.runTask(this.state.applyAction(InitVolumeStreaming, params, StateElements.Assembly))
        }
    }

    async setView(view: 'off' | 'cell' | 'selection-box') {
        const r = this.state.select(StateSelection.Generators.ofTransformer(CreateVolumeStreamingInfo))[0]
        if (!r) return

        const vol = this.state.select(StateElements.VolumeStreaming)[0]
        if (!vol) return

        const tree = this.state.build();
        tree.to(StateElements.VolumeStreaming).update(
            CreateVolumeStreamingBehavior,
            props => {
                const p = deepClone(props)
                if (p.entry.params.view.name !== view) {
                    p.entry.params.view.name = view
                    if (view === 'selection-box') {
                        p.entry.params.view.params = {
                            radius: 5,
                            topRight: [0, 0, 0],
                            bottomLeft: [0, 0, 0],
                        }
                    } else {
                        p.entry.params.view.params = {}
                    }
                }
                return p
            }
        )

        await this.applyState(tree)
    }

    async remove() {
        const r = this.state.select(StateSelection.Generators.ofTransformer(CreateVolumeStreamingInfo))[0]
        if (!r) return
        await PluginCommands.State.RemoveObject(this.plugin, { state: this.state, ref: r.transform.ref })
    }

    constructor(private plugin: PluginContext) {

    }
}