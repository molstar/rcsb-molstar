/**
 * Copyright (c) 2019 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import * as React from 'react';
import { CollapsableControls, PluginUIComponent } from 'molstar/lib/mol-plugin/ui/base';
import { Binding } from 'molstar/lib/mol-util/binding';
import { StateSelection, StateTransformer } from 'molstar/lib/mol-state';
import { StructureRepresentationInteraction } from 'molstar/lib/mol-plugin/behavior/dynamic/selection/structure-representation-interaction';

function getBindingsList(bindings: { [k: string]: Binding }) {
    return Object.keys(bindings).map(k => [k, bindings[k]] as [string, Binding])
}

class BindingsHelp extends React.Component<{ bindings: { [k: string]: Binding } }, { isExpanded: boolean }> {
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
        return <HelpText>{this.getBindingComponents()}</HelpText>
    }
}

class HelpText extends React.PureComponent {
    render() {
        return <div className='msp-control-row msp-help-text'>
            <div>{this.props.children}</div>
        </div>
    }
}

class HelpGroup extends React.Component<{ header: string, initiallyExpanded?: boolean }, { isExpanded: boolean }> {
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

const HelpSectionStyle: React.CSSProperties = {
    height: '28px',
    lineHeight: '28px',
    marginTop: '5px',
    marginBottom: '5px',
    padding: '0 10px',
    fontWeight: 500,
    background: '#ecf2f8',
    color: '#595959'
}

class HelpSection extends React.PureComponent<{ header: string }> {
    render() {
        return <div style={HelpSectionStyle}>{this.props.header}</div>
    }
}

export class HelpContent extends PluginUIComponent {
    componentDidMount() {
        this.subscribe(this.plugin.events.canvas3d.settingsUpdated, () => this.forceUpdate());
    }

    private getMouseBindingComponents() {
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

    private getTriggerFor(transformer: StateTransformer, name: string) {
        const state = this.plugin.state.behaviorState
        const selections = state.select(StateSelection.Generators.ofTransformer(transformer))
        const params = selections.length === 1 ? selections[0].params : undefined
        const bindings = params ? params.values.bindings : {}
        const binding: Binding = name in bindings ? bindings[name] : Binding.Empty
        return binding.triggers.map(t => Binding.Trigger.format(t)).join(' or ')
    }

    render() {
        if (!this.plugin.canvas3d) return null

        // const structureInteractionTriggers = this.getTriggerFor(StructureRepresentationInteraction, 'clickInteractionAroundOnly')
        const volumeAroundTriggers = this.getTriggerFor(StructureRepresentationInteraction, 'clickInteractionAroundOnly') // TODO get from correct behavior transform

        return <div>
            <HelpSection header='Interface Controls' />
            <HelpGroup header='Inline Help'>
                <HelpText>Many user interface elements show a little questionmark icon when hovered over. Clicking the icon toggles the display of an inline help text.</HelpText>
                <HelpText>Tooltips may provide additional information on a user interface element and are shown when hovering over it with the mouse.</HelpText>
            </HelpGroup>
            <HelpGroup header='Selections'>
                <HelpText>
                    The viewer allows changing colors and representations for selections of atoms, residues or chains. Selections can be created by
                    <ul style={{ paddingLeft: '20px' }}>
                        <li>picking elements on the 3D canvas or the sequence view using the mouse (see help section on 'Mouse Bindings')</li>
                        <li>using the 'Add', 'Remove' and 'Only' dropdown buttons in the 'Manage Selection' panel which allow modifing the current selection by predefined sets</li>
                    </ul>
                </HelpText>
            </HelpGroup>
            <HelpGroup header='Coloring'>
                <HelpText>
                    There are two ways to color structures. Every representation (e.g. cartoon or spacefill) has a color theme which can be changed using the dropdown for each representation in the 'Structure Settings' panel. Additionally any selection atoms, residues or chains can by given a custom color. For that, first select the parts of the structure to be colored (see help section on 'Selections') and, second, choose a color from the color dropdown botton in the 'Selection' row of the 'Change Representation' panel. The theme color can be seen as a base color that is overpainted by the custom color. Custom colors can be removed for a selection with the 'Clear' option in the color dropdown.
                </HelpText>
            </HelpGroup>
            <HelpGroup header='Representations'>
                <HelpText>
                    Structures can be shown with many different representations (e.g. cartoon or spacefill). The 'Change Representation' panel offers a collection of predefined styles which can be applied using the 'Preset' dropdown button. Additionally any selection atoms, residues or chains can by shown with a custom representation. For that, first select the parts of the structure to be mofified (see help section on 'Selections') and, second, choose a representation to hide or show from the 'Show' and 'Hide' dropdown bottons in the 'Selection' row of the 'Change Representation' panel. The 'Everything' row applies the action to the whole structure instead of the current selection.
                </HelpText>
            </HelpGroup>
            <HelpGroup header='Densities'>
                <HelpText>
                    Densities can be shown for both X-ray and cryo-EM structures. By default the density around an element/atom can be shown by clicking using {volumeAroundTriggers}. The 'Density Controls' panel offers a variety of options to adjust the display of density maps. The absence of the 'Density Controls' panel indicates that no density is available for the loaded entry which is the case for e.g. NMR structures or very old X-ray structures.
                </HelpText>
            </HelpGroup>

            <HelpSection header='How-to Guides' />
            <HelpGroup header='Molecule of the Month Style'>
                <HelpText>
                    <ol style={{ paddingLeft: '20px' }}>
                        <li>First, hide everything, then show everything with the spacefill representation using the 'Representation' panel.</li>
                        <li>Change color theme of the spacefill representation to 'illustrative' using the 'Structure Settings' panel.</li>
                        <li>Set render style to 'toon' and activate 'occlusion' in the 'General Settings' panel.</li>
                    </ol>
                </HelpText>
            </HelpGroup>
            <HelpGroup header='Create an Image'>
                <HelpText>
                    <ol style={{ paddingLeft: '20px' }}>
                        <li>First, hide everything, then show everything with the spacefill representation using the 'Representation' panel.</li>
                        <li>Change color theme of the spacefill representation to 'illustrative' using the 'Structure Settings' panel.</li>
                        <li>Set render style to 'toon' and activate 'occlusion' in the 'General Settings' panel.</li>
                    </ol>
                </HelpText>
            </HelpGroup>

            <HelpSection header='Mouse Bindings' />
            {this.getMouseBindingComponents()}
        </div>
    }
}

export class Help extends CollapsableControls {
    defaultState() {
        return {
            isCollapsed: true,
            header: 'Help'
        }
    }

    renderControls() {
        return <HelpContent />
    }
}