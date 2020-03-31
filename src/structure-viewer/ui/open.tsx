/**
 * Copyright (c) 2019-2020 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import * as React from 'react';
import { ParamDefinition as PD } from 'molstar/lib/mol-util/param-definition';
import { StateAction, StateTransform } from 'molstar/lib/mol-state';
import { PluginStateObject } from 'molstar/lib/mol-plugin-state/objects';
import { PluginContext } from 'molstar/lib/mol-plugin/context';
import { Task } from 'molstar/lib/mol-task';
import { ApplyActionControl } from 'molstar/lib/mol-plugin-ui/state/apply-action';
import { PluginUIComponent } from 'molstar/lib/mol-plugin-ui/base';
import { StructureViewerState } from '../types';

const OpenFileAction = StateAction.build({
    display: { name: 'Open mmCIF File', description: 'Load a file and create its default visuals' },
    from: PluginStateObject.Root,
    params: (a, ctx: PluginContext) => {
        return {
            file: PD.File({ accept: '.cif, .mcif, .mmcif, .bcif, .gz, .zip' })
        }
    }
})(({ params, state }, ctx: PluginContext) => Task.create('Open File', async taskCtx => {

    if (params.file.type !== 'cif' && params.file.type !== 'bcif') {
        throw new Error(`unsupported file format '${params.file.type}`)
    }
    await (ctx.customState as StructureViewerState).modelLoader.load({ fileOrUrl: params.file, format: params.file.type, })
}));

export class OpenFile extends PluginUIComponent<{ initiallyCollapsed?: boolean }> {
    render() {
        return <ApplyActionControl key={`${OpenFileAction.id}`} state={this.plugin.state.data} action={OpenFileAction} nodeRef={StateTransform.RootRef} initiallyCollapsed={this.props.initiallyCollapsed} />
    }
}