/**
 * Copyright (c) 2019-2020 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import { LoadParams } from '../types';
import { PluginContext } from 'molstar/lib/mol-plugin/context';
import { PresetProps, RcsbPreset } from './preset';
import { Asset } from 'molstar/lib/mol-util/assets';
import { Mat4 } from 'molstar/lib/mol-math/linear-algebra';
import { StateTransforms } from 'molstar/lib/mol-plugin-state/transforms';

export class ModelLoader {
    async load(load: LoadParams, props?: PresetProps, matrix?: Mat4) {
        const { fileOrUrl, format, isBinary } = load

        const data = fileOrUrl instanceof File
            ? (await this.plugin.builders.data.readFile({ file: Asset.File(fileOrUrl), isBinary })).data
            : await this.plugin.builders.data.download({ url: fileOrUrl, isBinary })
        const trajectory = await this.plugin.builders.structure.parseTrajectory(data, format)

        const selector = await this.plugin.builders.structure.hierarchy.applyPreset(trajectory, RcsbPreset, {
            preset: props || { kind: 'standard', assemblyId: '' }
        });

        if (matrix && selector) {
            const params = {
                transform: {
                    name: 'matrix' as const,
                    params: { data: matrix, transpose: false }
                }
            };
            const b = this.plugin.state.data.build().to(selector.structureProperties)
                .insert(StateTransforms.Model.TransformStructureConformation, params);
            await this.plugin.runTask(this.plugin.state.data.updateTree(b));
        }
    }

    constructor(private plugin: PluginContext) {

    }
}