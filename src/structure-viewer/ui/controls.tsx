/**
 * Copyright (c) 2019 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import * as React from 'react';
import { PluginUIComponent } from 'molstar/lib/mol-plugin/ui/base';
import { PluginContextContainer } from 'molstar/lib/mol-plugin/ui/plugin';
import { TransformUpdaterControl } from 'molstar/lib/mol-plugin/ui/state/update-transform';
import { StateElements } from '../helpers';
import { ParameterControls } from 'molstar/lib/mol-plugin/ui/controls/parameters';
import { ParamDefinition as PD } from 'molstar/lib/mol-util/param-definition';
import { PluginCommands } from 'molstar/lib/mol-plugin/command';
import { Canvas3DParams } from 'molstar/lib/mol-canvas3d/canvas3d';

export class ControlsWrapper extends PluginUIComponent {
    componentDidMount() {
        this.subscribe(this.plugin.state.behavior.currentObject, () => this.forceUpdate());
        this.subscribe(this.plugin.events.state.object.updated, () => this.forceUpdate());
    }

    render() {
        return <div className='msp-scrollable-container msp-right-controls'>
            <PluginContextContainer plugin={this.plugin}>
                <GeneralSettings/>
                <TransformUpdaterControl nodeRef={StateElements.VolumeStreaming} />
            </PluginContextContainer>
        </div>;
    }
}

//

const GeneralSettingsParams = {
    spin: Canvas3DParams.trackball.params.spin
}

type GeneralSettingsState = { isCollapsed?: boolean }

class GeneralSettings<P, S extends GeneralSettingsState> extends PluginUIComponent<P, S> {
    setSettings = (p: { param: PD.Base<any>, name: string, value: any }) => {
        if (p.name === 'spin') {
            const trackball = this.plugin.canvas3d.props.trackball;
            PluginCommands.Canvas3D.SetSettings.dispatch(this.plugin, { settings: { trackball: { ...trackball, spin: p.value } } });
        }
    }

    get values () {
        return {
            spin: this.plugin.canvas3d.props.trackball.spin
        }
    }

    componentDidMount() {
        this.subscribe(this.plugin.events.canvas3d.settingsUpdated, () => this.forceUpdate());
    }

    toggleExpanded = () => {
        this.setState({ isCollapsed: !this.state.isCollapsed });
    }

    state = {
        isCollapsed: false
    } as Readonly<S>

    render() {
        const wrapClass = this.state.isCollapsed
            ? 'msp-transform-wrapper msp-transform-wrapper-collapsed'
            : 'msp-transform-wrapper';

        return this.plugin.canvas3d ? <div className={wrapClass}>
            <div className='msp-transform-header'>
                <button className='msp-btn msp-btn-block' onClick={this.toggleExpanded}>
                    General Settings
                </button>
            </div>
            {!this.state.isCollapsed &&
                <ParameterControls params={GeneralSettingsParams} values={this.values} onChange={this.setSettings} />
            }
        </div> : null;
    }
}