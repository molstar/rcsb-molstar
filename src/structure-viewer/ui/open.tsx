/**
 * Copyright (c) 2019-2020 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import * as React from 'react';
import { StateTransform } from 'molstar/lib/mol-state';
import { OpenFiles } from 'molstar/lib/mol-plugin-state/actions/file';
import { ApplyActionControl } from 'molstar/lib/mol-plugin-ui/state/apply-action';
import { PluginUIComponent } from 'molstar/lib/mol-plugin-ui/base';

export class OpenFilesControls extends PluginUIComponent {
    render() {
        return <ApplyActionControl key={`${OpenFiles.id}`} state={this.plugin.state.data} action={OpenFiles} nodeRef={StateTransform.RootRef} initiallyCollapsed={false} />
    }
}