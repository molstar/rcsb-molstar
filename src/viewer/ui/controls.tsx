/**
 * Copyright (c) 2019-2020 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import * as React from 'react';
import { PluginUIComponent } from 'molstar/lib/mol-plugin-ui/base';
import { ViewerState } from '../types';
import { CustomStructureControls } from 'molstar/lib/mol-plugin-ui/controls';
import { ImportControls } from './import';
import { StructureSourceControls } from 'molstar/lib/mol-plugin-ui/structure/source';
import { StructureMeasurementsControls } from 'molstar/lib/mol-plugin-ui/structure/measurements';
import { StructureSuperpositionControls } from 'molstar/lib/mol-plugin-ui/structure/superposition';
import { StructureComponentControls } from 'molstar/lib/mol-plugin-ui/structure/components';
import { VolumeStreamingControls } from 'molstar/lib/mol-plugin-ui/structure/volume';
import { SessionControls } from './session';

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
            {ViewerState(this.plugin).showSessionControls && <SessionControls />}
            <StructureTools />
        </div>;
    }
}