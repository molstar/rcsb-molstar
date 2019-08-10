/**
 * Copyright (c) 2019 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 * @author David Sehnal <david.sehnal@gmail.com>
 */

import { BuiltInStructureRepresentationsName } from 'molstar/lib/mol-repr/structure/registry';
import { BuiltInColorThemeName } from 'molstar/lib/mol-theme/color';
import Expression from 'molstar/lib/mol-script/language/expression';
import { Structure, StructureSelection, QueryContext } from 'molstar/lib/mol-model/structure';
import { compile } from 'molstar/lib/mol-script/runtime/query/compiler';

export type SupportedFormats = 'cif' | 'pdb'
export interface LoadParams {
    url: string,
    format?: SupportedFormats,
    assemblyId?: string,
    representationStyle?: RepresentationStyle
}

export interface RepresentationStyle {
    sequence?: RepresentationStyle.Entry,
    hetGroups?: RepresentationStyle.Entry,
    carbs?: { hide?: boolean },
    water?: RepresentationStyle.Entry
}

export namespace RepresentationStyle {
    export type Entry = { hide?: boolean, kind?: BuiltInStructureRepresentationsName, coloring?: BuiltInColorThemeName }
}

export enum StateElements {
    Trajectory = 'trajectory',
    Model = 'model',
    ModelProps = 'model-props',
    Assembly = 'assembly',

    VolumeStreaming = 'volume-streaming',

    Sequence = 'sequence',
    SequenceVisual = 'sequence-visual',
    Het = 'het',
    HetVisual = 'het-visual',
    HetCarbs = 'het-3dsnfg',
    Water = 'water',
    WaterVisual = 'water-visual',

    HetGroupFocus = 'het-group-focus'
}