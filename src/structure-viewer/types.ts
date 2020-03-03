/**
 * Copyright (c) 2019-2020 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import { StructureView } from './helpers/structure';
import { ModelLoader } from './helpers/model';
import { VolumeData } from './helpers/volume';
import { PresetManager } from './helpers/preset';

export interface StructureViewerProps {
    volumeServerUrl: string,
    modelUrlProvider: (pdbId: string) => {
        url: string,
        format: SupportedFormats
    },
    showOpenFileControls: boolean,
}

export type SupportedFormats = 'cif' | 'bcif'
export interface LoadParams {
    /** A File object or URL representing a structure file  */
    fileOrUrl: File | string,
    /** A supported file format extension string */
    format?: SupportedFormats,
}

export enum StateElements {
    Trajectory = 'trajectory',
    Model = 'model',
    ModelProps = 'model-props',
    ModelUnitcell = 'model-unitcell',
    Assembly = 'assembly',
    AssemblySymmetry = 'assembly-symmetry',

    VolumeStreaming = 'volume-streaming',
}

export enum AssemblyNames {
    Deposited = 'deposited',
    Unitcell = 'unitcell',
    Supercell = 'supercell',
    CrystalContacts = 'crystal-contacts',
}

export enum ModelNames {
    All = -1,
}

export interface StructureViewerState {
    props: StructureViewerProps

    modelLoader: ModelLoader
    presetManager: PresetManager
    structureView: StructureView
    volumeData: VolumeData
}