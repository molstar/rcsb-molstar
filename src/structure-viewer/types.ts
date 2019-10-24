/**
 * Copyright (c) 2019 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import { StructureView } from './helpers/structure';
import { ModelLoader } from './helpers/model';
import { VolumeData } from './helpers/volume';

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
    /**
     * The assemblyId to show initially
     * - 'deposited' for the structure as it is given in the file
     * - a number as string, e.g. '1', '2', ... must be defined in the file
     * - 'unitcell' for the unitcell of an X-ray structure
     * - 'supercell' for the supercell of an X-ray structure
     * - 'crystal-contacts' for the symmetry mates of an X-ray structure
     */
    assemblyId?: string,
    // TODO The modelId to show initially
    // modelId?: string
}

export enum StateElements {
    Trajectory = 'trajectory',
    Model = 'model',
    ModelProps = 'model-props',
    ModelUnitcell = 'model-unitcell',
    Assembly = 'assembly',

    VolumeStreaming = 'volume-streaming',
}

export enum AssemblyNames {
    Deposited = 'deposited',
    Unitcell = 'unitcell',
    Supercell = 'supercell',
    CrystalContacts = 'crystal-contacts',
}

export interface StructureViewerState {
    props: StructureViewerProps
    modelLoader: ModelLoader
    structureView: StructureView
    volumeData: VolumeData
}