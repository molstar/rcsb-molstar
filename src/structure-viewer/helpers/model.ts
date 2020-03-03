/**
 * Copyright (c) 2019-2020 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import { StateElements, StructureViewerState, LoadParams } from '../types';
import { PluginCommands } from 'molstar/lib/mol-plugin/commands';
import { StateBuilder } from 'molstar/lib/mol-state';
import { StateTransforms } from 'molstar/lib/mol-plugin-state/transforms';
import { PluginContext } from 'molstar/lib/mol-plugin/context';
import { PluginStateObject as PSO } from 'molstar/lib/mol-plugin-state/objects';

export class ModelLoader {
    get customState() {
        return this.plugin.customState as StructureViewerState
    }

    download(b: StateBuilder.To<PSO.Root>, url: string, isBinary: boolean) {
        return b.apply(StateTransforms.Data.Download, { url, isBinary })
    }

    readFile(b: StateBuilder.To<PSO.Root>, file: File, isBinary: boolean) {
        return b.apply(StateTransforms.Data.ReadFile, { file, isBinary })
    }

    model(b: StateBuilder.To<PSO.Data.Binary | PSO.Data.String>) {
        const parsed = b.apply(StateTransforms.Data.ParseCif).apply(StateTransforms.Model.TrajectoryFromMmCif, {}, { ref: StateElements.Trajectory })

        return parsed
            .apply(StateTransforms.Model.ModelFromTrajectory, { modelIndex: 0 }, { ref: StateElements.Model })
    }

    async load({ fileOrUrl, format = 'cif' }: LoadParams) {
        if (!fileOrUrl) return

        const state = this.plugin.state.dataState;
        await PluginCommands.State.RemoveObject(this.plugin, { state, ref: state.tree.root.ref })

        const isBinary = format === 'bcif'
        const data = fileOrUrl instanceof File
            ? this.readFile(state.build().toRoot(), fileOrUrl, isBinary)
            : this.download(state.build().toRoot(), fileOrUrl, isBinary)
        const model = this.model(data);
        await this.applyState(model)
    }

    async applyState(tree: StateBuilder) {
        await PluginCommands.State.Update(this.plugin, { state: this.plugin.state.dataState, tree }).catch(e => console.log(e))
    }

    constructor(private plugin: PluginContext) {

    }
}