/**
 * Copyright (c) 2019-2020 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import * as React from 'react';
import { PluginUIComponent } from 'molstar/lib/mol-plugin-ui/base';
import { ViewerState } from '../types';
import { Viewport, ViewportControls } from 'molstar/lib/mol-plugin-ui/viewport';
import { BackgroundTaskProgress } from 'molstar/lib/mol-plugin-ui/task';
import { LociLabels, CustomStructureControls, SelectionViewportControls } from 'molstar/lib/mol-plugin-ui/controls';
import { Toasts } from 'molstar/lib/mol-plugin-ui/toast';
import { ImportControls } from './import';
import { StructureSourceControls } from 'molstar/lib/mol-plugin-ui/structure/source';
import { StructureMeasurementsControls } from 'molstar/lib/mol-plugin-ui/structure/measurements';
import { StructureSuperpositionControls } from 'molstar/lib/mol-plugin-ui/structure/superposition';
import { StructureComponentControls } from 'molstar/lib/mol-plugin-ui/structure/components';
import { VolumeStreamingControls } from 'molstar/lib/mol-plugin-ui/structure/volume';

export class StructureTools extends PluginUIComponent {
    get customState() {
        return ViewerState(this.plugin)
    }

    componentDidMount() {
        this.subscribe(this.customState.collapsed, () => this.forceUpdate())
    }

    render() {
        const collapsed = this.customState.collapsed.value
        return <>
            <StructureSourceControls />
            <StructureMeasurementsControls initiallyCollapsed={collapsed.measurements} />
            <StructureSuperpositionControls initiallyCollapsed={collapsed.superposition} />
            <StructureComponentControls initiallyCollapsed={collapsed.component} />
            <VolumeStreamingControls header='Density' initiallyCollapsed={collapsed.volume} />

            <CustomStructureControls initiallyCollapsed={collapsed.custom} />
        </>;
    }
}

export class ControlsWrapper extends PluginUIComponent {
    render() {
        return <div className='msp-scrollable-container'>
            {ViewerState(this.plugin).showImportControls && <ImportControls />}
            <StructureTools />
        </div>;
    }
}

export class ViewportWrapper extends PluginUIComponent {
    render() {
        return <>
            <Viewport />
            <SelectionViewportControls />
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