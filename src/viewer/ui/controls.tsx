/**
 * Copyright (c) 2019-2020 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

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
import { StrucmotifSubmitControls } from './strucmotif';
import { ValidationReportControls } from './validation';
import { StructureQuickStylesControls } from 'molstar/lib/mol-plugin-ui/structure/quick-styles';

export class StructureTools extends PluginUIComponent {
    get customState() {
        return ViewerState(this.plugin);
    }

    componentDidMount() {
        this.subscribe(this.customState.collapsed, () => this.forceUpdate());
    }

    render() {
        const collapsed = this.customState.collapsed.value;
        return <>
            {this.customState.showStructureSourceControls && <StructureSourceControls />}
            {this.customState.showMeasurementsControls && <StructureMeasurementsControls initiallyCollapsed={collapsed.measurements} />}
            {this.customState.showStrucmotifSubmitControls && <StrucmotifSubmitControls initiallyCollapsed={collapsed.strucmotifSubmit} />}
            {this.customState.showSuperpositionControls && <StructureSuperpositionControls initiallyCollapsed={collapsed.superposition} />}
            {this.customState.showQuickStylesControls && <StructureQuickStylesControls initiallyCollapsed={collapsed.quickStyles} />}
            {this.customState.showStructureComponentControls && <StructureComponentControls initiallyCollapsed={collapsed.component} />}
            {this.customState.showVolumeStreamingControls && <VolumeStreamingControls header='Density' initiallyCollapsed={collapsed.volume} />}
            {this.customState.showValidationReportControls && <ValidationReportControls initiallyCollapsed={collapsed.validationReport} />}
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