/**
 * Copyright (c) 2019 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import { StateElements, StructureViewerState, LoadParams } from '../types';
import { PluginCommands } from 'molstar/lib/mol-plugin/command';
import { StateBuilder } from 'molstar/lib/mol-state';
import { StateTransforms } from 'molstar/lib/mol-plugin/state/transforms';
import { PluginContext } from 'molstar/lib/mol-plugin/context';
import { PluginStateObject as PSO } from 'molstar/lib/mol-plugin/state/objects';

export class ModelLoader {
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

    async load({ fileOrUrl, format = 'cif', assemblyId = 'deposited' }: LoadParams) {
        if (!fileOrUrl) return

        const state = this.plugin.state.dataState;
        await PluginCommands.State.RemoveObject.dispatch(this.plugin, { state, ref: state.tree.root.ref })

        const isBinary = format === 'bcif'
        const data = fileOrUrl instanceof File
            ? this.readFile(state.build().toRoot(), fileOrUrl, isBinary)
            : this.download(state.build().toRoot(), fileOrUrl, isBinary)
        const model = this.model(data);
        await this.applyState(model)
        await this.init(assemblyId)
    }

    async init(assemblyId = 'deposited') {
        await (this.plugin.customState as StructureViewerState).structureView.setAssembly(assemblyId)
    }

    async applyState(tree: StateBuilder) {
        await PluginCommands.State.Update.dispatch(this.plugin, { state: this.plugin.state.dataState, tree })
    }

    constructor(private plugin: PluginContext) {

    }
}