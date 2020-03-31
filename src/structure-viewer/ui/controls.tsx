/**
 * Copyright (c) 2019-2020 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import * as React from 'react';
import { PluginUIComponent } from 'molstar/lib/mol-plugin-ui/base';
import { StructureViewerState } from '../types';
import { Viewport, ViewportControls } from 'molstar/lib/mol-plugin-ui/viewport';
import { BackgroundTaskProgress } from 'molstar/lib/mol-plugin-ui/task';
import { LociLabels, DefaultStructureTools } from 'molstar/lib/mol-plugin-ui/controls';
import { Toasts } from 'molstar/lib/mol-plugin-ui/toast';
import { OpenFile } from './open';

export class ControlsWrapper extends PluginUIComponent {
    get customState() {
        return this.plugin.customState as StructureViewerState
    }

    render() {
        const { showOpenFileControls } = this.customState.props
        return <div className='msp-scrollable-container'>
            {showOpenFileControls && <OpenFile initiallyCollapsed={false} />}
            <DefaultStructureTools />
        </div>;
    }
}

export class ViewportWrapper extends PluginUIComponent {
    render() {
        return <>
            <Viewport />
            <ViewportControls />
            <div style={{ position: 'absolute', left: '10px', bottom: '10px' }}>
                <BackgroundTaskProgress />
            </div>
            <div className='msp-highlight-toast-wrapper'>
                <LociLabels />
                <Toasts />
            </div>
        </>;
    }
}