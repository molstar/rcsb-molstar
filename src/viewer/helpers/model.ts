/**
 * Copyright (c) 2019-2020 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import { LoadParams, ParseParams } from '../types';
import { PluginContext } from 'molstar/lib/mol-plugin/context';
import { PresetProps, RcsbPreset } from './preset';
import { Asset } from 'molstar/lib/mol-util/assets';
import { Mat4 } from 'molstar/lib/mol-math/linear-algebra';
import { StateTransforms } from 'molstar/lib/mol-plugin-state/transforms';
import { BuiltInTrajectoryFormat } from 'molstar/lib/mol-plugin-state/formats/trajectory';
import { TrajectoryHierarchyPresetProvider } from 'molstar/lib/mol-plugin-state/builder/structure/hierarchy-preset';
import { StateObjectRef } from 'molstar/lib/mol-state';
import { ModelExport } from 'molstar/lib/extensions/model-export/export';

export class ModelLoader {
    async load<P = any, S = {}>(load: LoadParams, props?: PresetProps & { dataLabel?: string }, matrix?: Mat4, reprProvider?: TrajectoryHierarchyPresetProvider<P, S>, params?: P) {
        const { fileOrUrl, format, isBinary } = load;

        const data = fileOrUrl instanceof File
            ? (await this.plugin.builders.data.readFile({ file: Asset.File(fileOrUrl), isBinary, label: props?.dataLabel })).data
            : await this.plugin.builders.data.download({ url: fileOrUrl, isBinary, label: props?.dataLabel });

        const hierarchy = await this.handleTrajectory<P, S>(data, format, props, matrix, reprProvider, params) as any;
        const structureCell = StateObjectRef.resolveAndCheck(this.plugin.state.data, hierarchy.structure);
        ModelExport.setStructureName(structureCell?.obj?.data, props?.dataLabel || '');

        return hierarchy;
    }

    async parse<P = any, S = {}>(parse: ParseParams, props?: PresetProps & { dataLabel?: string }, matrix?: Mat4, reprProvider?: TrajectoryHierarchyPresetProvider<P, S>, params?: P) {
        const { data, format } = parse;
        const _data = await this.plugin.builders.data.rawData({ data, label: props?.dataLabel });
        return await this.handleTrajectory(_data, format, props, matrix, reprProvider, params);
    }

    private async handleTrajectory<P = any, S = {}>(
        data: any,
        format: BuiltInTrajectoryFormat,
        props?: PresetProps,
        matrix?: Mat4,
        reprProvider?: TrajectoryHierarchyPresetProvider<P, S>,
        params?: P
    ): Promise<S | ReturnType<typeof RcsbPreset.apply> | undefined> {
        const trajectory = await this.plugin.builders.structure.parseTrajectory(data, format);
        if (reprProvider) {
            return this.plugin.builders.structure.hierarchy.applyPreset(trajectory, reprProvider, params);
        } else {
            const selector = await this.plugin.builders.structure.hierarchy.applyPreset(trajectory, RcsbPreset, {
                preset: props || { kind: 'standard', assemblyId: '' }
            });

            if (matrix && selector?.structureProperties) {
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
            return selector;
        }

    }

    constructor(private plugin: PluginContext) {

    }
}