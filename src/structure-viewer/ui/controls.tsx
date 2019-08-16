/**
 * Copyright (c) 2019 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import * as React from 'react';
import { PluginUIComponent } from 'molstar/lib/mol-plugin/ui/base';
import { PluginContextContainer } from 'molstar/lib/mol-plugin/ui/plugin';
import { TransformUpdaterControl } from 'molstar/lib/mol-plugin/ui/state/update-transform';
import { StructureToolsWrapper } from 'molstar/lib/mol-plugin/ui/controls';
import { StateElements } from '../helpers';
import { Viewport, ViewportControls } from 'molstar/lib/mol-plugin/ui/viewport';
import { BackgroundTaskProgress } from 'molstar/lib/mol-plugin/ui/task';
import { LociLabelControl } from 'molstar/lib/mol-plugin/ui/controls';
import { GeneralSettings } from './general';
import { StructureControls } from './structure';

export class ControlsWrapper extends PluginUIComponent {
    componentDidMount() {
        this.subscribe(this.plugin.state.behavior.currentObject, () => this.forceUpdate());
        this.subscribe(this.plugin.events.state.object.updated, () => this.forceUpdate());
    }

    render() {
        return <div className='msp-scrollable-container msp-right-controls'>
            <PluginContextContainer plugin={this.plugin}>
                <GeneralSettings />
                <StructureControls />
                <TransformUpdaterControl nodeRef={StateElements.VolumeStreaming} header={{ name: 'Volume Controls', description: '' }} />
                <StructureToolsWrapper />
            </PluginContextContainer>
        </div>;
    }
}

export class ViewportWrapper extends PluginUIComponent {
    render() {
        return <>
            <Viewport />
            <ViewportControls hideSettingsIcon={true} />
            <div style={{ position: 'absolute', left: '10px', bottom: '10px' }}>
                <BackgroundTaskProgress />
            </div>
            <LociLabelControl />
        </>;
    }
}