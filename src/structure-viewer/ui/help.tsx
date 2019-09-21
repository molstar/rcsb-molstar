/**
 * Copyright (c) 2019 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import * as React from 'react';
import { CollapsableControls } from 'molstar/lib/mol-plugin/ui/base';
import { Binding } from 'molstar/lib/mol-util/binding';

function getBindingsList(bindings: { [k: string]: Binding }) {
    return Object.keys(bindings).map(k => [k, bindings[k]] as [string, Binding])
}

export class BindingsHelp extends React.Component<{ bindings: { [k: string]: Binding } }, { isExpanded: boolean }> {
    getBindingComponents() {
        const bindingsList = getBindingsList(this.props.bindings)
        return bindingsList.map(value => {
            const [name, binding] = value
            return !Binding.isEmpty(binding) ? <div key={name} style={{ padding: '4px 0px' }}>
                {Binding.format(binding, name)}
            </div> : null
        })
    }

    render() {
        return <div className='msp-control-row msp-help-text'>
            <div>{this.getBindingComponents()}</div>
        </div>
    }
}

export class HelpGroup extends React.Component<{ header: string, initiallyExpanded?: boolean }, { isExpanded: boolean }> {
    state = {
        header: this.props.header,
        isExpanded: !!this.props.initiallyExpanded
    }

    toggleExpanded = () => this.setState({ isExpanded: !this.state.isExpanded });

    render() {
        return <div className='msp-control-group-wrapper'>
            <div className='msp-control-group-header'>
                <button className='msp-btn msp-btn-block' onClick={this.toggleExpanded}>
                    <span className={`msp-icon msp-icon-${this.state.isExpanded ? 'collapse' : 'expand'}`} />
                    {this.props.header}
                </button>
            </div>
            {this.state.isExpanded && <div className='msp-control-offset' style={{ display: this.state.isExpanded ? 'block' : 'none' }}>
                {this.props.children}
            </div>}
        </div>
    }
}

export class Help extends CollapsableControls {
    componentDidMount() {
        this.subscribe(this.plugin.events.canvas3d.settingsUpdated, () => this.forceUpdate());
    }

    defaultState() {
        return {
            isCollapsed: true,
            header: 'Help'
        }
    }

    getComponents() {
        const components = [
            <HelpGroup key='trackball' header='Trackball'>
                <BindingsHelp bindings={this.plugin.canvas3d.props.trackball.bindings} />
            </HelpGroup>
        ]
        this.plugin.spec.behaviors.forEach(b => {
            const { bindings } = b.defaultParams
            if (bindings) {
                components.push(
                    <HelpGroup key={b.transformer.id} header={b.transformer.definition.display.name}>
                        <BindingsHelp bindings={bindings} />
                    </HelpGroup>
                )
            }
        })
        return components
    }

    renderControls() {
        if (!this.plugin.canvas3d) return null

        return <div>{this.getComponents()}</div>
    }
}