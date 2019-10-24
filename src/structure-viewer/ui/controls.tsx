/**
 * Copyright (c) 2019 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import * as React from 'react';
import { PluginUIComponent } from 'molstar/lib/mol-plugin/ui/base';
import { TransformUpdaterControl } from 'molstar/lib/mol-plugin/ui/state/update-transform';
import { StructureSelectionControls } from 'molstar/lib/mol-plugin/ui/structure/selection';
import { StructureRepresentationControls } from 'molstar/lib/mol-plugin/ui/structure/representation';
import { StateElements } from '../helpers';
import { Viewport, ViewportControls } from 'molstar/lib/mol-plugin/ui/viewport';
import { BackgroundTaskProgress } from 'molstar/lib/mol-plugin/ui/task';
import { ImageControls } from 'molstar/lib/mol-plugin/ui/image';
import { LociLabels } from 'molstar/lib/mol-plugin/ui/controls';
import { IconButton } from 'molstar/lib/mol-plugin/ui/controls/common';
import { Toasts } from 'molstar/lib/mol-plugin/ui/toast';
import { GeneralSettings } from './general';
import { StructureControls } from './structure';
import { HelpContent } from './help';

export class ControlsWrapper extends PluginUIComponent {
    componentDidMount() {
        this.subscribe(this.plugin.state.behavior.currentObject, () => this.forceUpdate());
        this.subscribe(this.plugin.events.state.object.updated, () => this.forceUpdate());
    }

    render() {
        return <div className='msp-scrollable-container msp-right-controls' style={{ paddingTop: '0px' }}>
            <GeneralSettings initiallyCollapsed={true} />
            <StructureControls  />
            <StructureSelectionControls header='Manage Selection' initiallyCollapsed={true} />
            <StructureRepresentationControls header='Change Representation' initiallyCollapsed={true} />
            <ImageControls initiallyCollapsed={true} />
            <TransformUpdaterControl nodeRef={StateElements.VolumeStreaming} header={{ name: 'Density Controls', description: '' }} initiallyCollapsed={true} />
        </div>;
    }
}

class HelpViewportControls extends PluginUIComponent<{}, { isExpanded: boolean }> {
    state = { isExpanded: false }

    toggleExpanded = () => this.setState({ isExpanded: !this.state.isExpanded });

    render() {
        return <div className='msp-help-viewport-controls'>
            <div>
                <div className='msp-semi-transparent-background' />
                <IconButton icon='help-circle' title='Help' onClick={this.toggleExpanded} />
            </div>
            {this.state.isExpanded && <div className='msp-help-viewport-controls-content'>
                <HelpContent />
            </div>}
        </div>;
    }
}

export class ViewportWrapper extends PluginUIComponent {
    render() {
        return <>
            <Viewport />
            <div className='msp-viewport-top-left-controls'>
                <HelpViewportControls />
            </div>
            <ViewportControls hideSettingsIcon={true} />
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