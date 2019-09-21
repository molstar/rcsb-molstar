/**
 * Copyright (c) 2019 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

export type SupportedFormats = 'cif' | 'bcif' | 'pdb'
export interface LoadParams {
    /** URL pointing to a structure file  */
    url: string,
    /** A supported file format extension string */
    format?: SupportedFormats,
    /**
     * The assemblyId to show initially
     * - 'deposited' for the structure as it is given in the file
     * - a number as string, e.g. '1', '2', ... must be defined in the file
     * - 'unitcell' for the unitcell of an X-ray structure
     * - 'supercell' for the supercell of an X-ray structure
     */
    assemblyId?: string,
}

export enum StateElements {
    Trajectory = 'trajectory',
    Model = 'model',
    ModelProps = 'model-props',
    Assembly = 'assembly',

    VolumeStreaming = 'volume-streaming',
}