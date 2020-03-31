/**
 * Copyright (c) 2019-2020 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import { ModelLoader } from './helpers/model';

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

export interface StructureViewerState {
    props: StructureViewerProps
    modelLoader: ModelLoader
}