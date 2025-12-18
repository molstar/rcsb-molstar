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

        return await this.handleTrajectory<P, S>(data, format, props, matrix, reprProvider, params) as any;
    }

    async parse<P = any, S = {}>(parse: ParseParams, props?: PresetProps & { dataLabel?: string }, matrix?: Mat4, reprProvider?: TrajectoryHierarchyPresetProvider<P, S>, params?: P) {
        const { data, format } = parse;
        const _data = await this.plugin.builders.data.rawData({ data, label: props?.dataLabel });
        return await this.handleTrajectory(_data, format, props, matrix, reprProvider, params);
    }

    private async handleTrajectory<P = any, S = {}>(
        data: any,
        format: BuiltInTrajectoryFormat,
        props?: PresetProps & { dataLabel?: string },
        matrix?: Mat4,
        reprProvider?: TrajectoryHierarchyPresetProvider<P, S>,
        params?: P
    ): Promise<S | ReturnType<typeof RcsbPreset.apply> | undefined> {
        const trajectory = await this.plugin.builders.structure.parseTrajectory(data, format);
        if (!trajectory) {
            throw new Error('Trajectory data is unavailable or invalid');
        }
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

            const structureCell = StateObjectRef.resolveAndCheck(this.plugin.state.data, selector?.structure);
            structureCell?.obj?.data && ModelExport.setStructureName(structureCell?.obj?.data, props?.dataLabel || '');

            // TODO is this the best place for this functionality?
            if (props?.kind === 'motif') {
                const group = this.plugin.managers.structure.hierarchy.currentComponentGroups[0];
                this.plugin.managers.camera.focusSpheres(group, e => e.cell.obj?.data.boundary.sphere, { durationMs: 0 });
            }

            return selector;
        }

    }

    constructor(private plugin: PluginContext) {

    }
}