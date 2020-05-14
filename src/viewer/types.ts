/**
 * Copyright (c) 2019-2020 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import { BehaviorSubject } from 'rxjs';
import { ModelLoader } from './helpers/model';
import { PluginContext } from 'molstar/lib/mol-plugin/context';
import { BuiltInTrajectoryFormat } from 'molstar/lib/mol-plugin-state/formats/trajectory';

export type ModelUrlProvider = (pdbId: string) => {
    url: string,
    format: BuiltInTrajectoryFormat,
    isBinary: boolean
}

export interface LoadParams {
    /** A File object or URL representing a structure file  */
    fileOrUrl: File | string,
    /** A supported file format extension string */
    format: BuiltInTrajectoryFormat,
    /** Set to true is the data is binary, e.g. bcif mmCIF files */
    isBinary: boolean
}

export type CollapsedState = {
    selection: boolean
    measurements: boolean
    superposition: boolean
    component: boolean
    volume: boolean
    custom: boolean
}
export interface ViewerState {
    showImportControls: boolean
    showSessionControls: boolean
    modelLoader: ModelLoader
    collapsed: BehaviorSubject<CollapsedState>
}
export function ViewerState(plugin: PluginContext) {
    return plugin.customState as ViewerState
}