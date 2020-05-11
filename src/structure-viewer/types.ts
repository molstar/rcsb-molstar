/**
 * Copyright (c) 2019-2020 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import { BehaviorSubject } from 'rxjs';
import { ModelLoader } from './helpers/model';
import { PluginContext } from 'molstar/lib/mol-plugin/context';

export type ModelUrlProvider = (pdbId: string) => {
    url: string,
    format: SupportedFormats
}

export interface StructureViewerProps {
    volumeServerUrl: string,
    modelUrlProviders: ModelUrlProvider[],
    showOpenFileControls: boolean,
}

export type SupportedFormats = 'cif' | 'bcif'
export interface LoadParams {
    /** A File object or URL representing a structure file  */
    fileOrUrl: File | string,
    /** A supported file format extension string */
    format?: SupportedFormats,
}

export type CollapsedState = {
    selection: boolean
    measurements: boolean
    superposition: boolean
    component: boolean
    volume: boolean
    custom: boolean
}
export interface StructureViewerState {
    props: StructureViewerProps
    modelLoader: ModelLoader
    collapsed: BehaviorSubject<CollapsedState>
}
export function StructureViewerState(plugin: PluginContext) {
    return plugin.customState as StructureViewerState
}