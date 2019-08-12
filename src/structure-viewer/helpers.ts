/**
 * Copyright (c) 2019 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 * @author David Sehnal <david.sehnal@gmail.com>
 */

export type SupportedFormats = 'cif' | 'pdb'
export interface LoadParams {
    url: string,
    format?: SupportedFormats,
    assemblyId?: string,
}

export enum StateElements {
    Trajectory = 'trajectory',
    Model = 'model',
    ModelProps = 'model-props',
    Assembly = 'assembly',

    VolumeStreaming = 'volume-streaming',
}