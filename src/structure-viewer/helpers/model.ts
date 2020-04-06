/**
 * Copyright (c) 2019-2020 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import { StructureViewerState, LoadParams } from '../types';
import { PluginCommands } from 'molstar/lib/mol-plugin/commands';
import { PluginContext } from 'molstar/lib/mol-plugin/context';
import { PresetProps, RcsbPreset } from './preset';

export class ModelLoader {
    get customState() {
        return StructureViewerState(this.plugin)
    }

    async clear() {
        const state = this.plugin.state.data;
        await PluginCommands.State.RemoveObject(this.plugin, { state, ref: state.tree.root.ref })
    }

    async load(load: LoadParams, props?: PresetProps) {
        await this.clear()

        const { fileOrUrl, format } = load
        const isBinary = format === 'bcif'

        const data = fileOrUrl instanceof File
            ? (await this.plugin.builders.data.readFile({ file: fileOrUrl, isBinary })).data
            : await this.plugin.builders.data.download({ url: fileOrUrl, isBinary })
        await this.plugin.builders.structure.parseTrajectory(data, 'mmcif')

        const mng = this.plugin.managers.structure.hierarchy
        await mng.applyPreset(mng.current.trajectories, RcsbPreset, {
            preset: props || { kind: 'standard', assemblyId: 'deposited' }
        })
    }

    constructor(private plugin: PluginContext) {

    }
}