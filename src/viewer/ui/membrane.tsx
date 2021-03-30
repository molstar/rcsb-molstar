/**
 * Copyright (c) 2021 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Sebastian Bittrich <sebastian.bittrich@rcsb.org>
 */

import { CollapsableControls, CollapsableState } from 'molstar/lib/mol-plugin-ui/base';
import { StateTransform } from 'molstar/lib/mol-state/transform';
import { StructureHierarchyManager } from 'molstar/lib/mol-plugin-state/manager/structure/hierarchy';
import { ApplyActionControl } from 'molstar/lib/mol-plugin-ui/state/apply-action';
import { CheckSvg } from 'molstar/lib/mol-plugin-ui/controls/icons';
import { StateAction, StateSelection } from 'molstar/lib/mol-state';
import { PluginStateObject } from 'molstar/lib/mol-plugin-state/objects';
import { PluginContext } from 'molstar/lib/mol-plugin/context';
import { Task } from 'molstar/lib/mol-task';
import { MembraneOrientationPreset, tryCreateMembraneOrientation } from 'molstar/lib/extensions/anvil/behavior';
import { ParameterControls } from 'molstar/lib/mol-plugin-ui/controls/parameters';
import { ParamDefinition as PD } from 'molstar/lib/mol-util/param-definition';
import {
    MembraneOrientation,
    MembraneOrientationProps,
    MembraneOrientationProvider
} from 'molstar/lib/extensions/anvil/prop';

interface MembraneOrientationControlState extends CollapsableState {
    isBusy: boolean
    error: boolean
}

/**
 * The component that exposes the ANVIL functionality.
 */
export class MembraneOrientationControls extends CollapsableControls<{}, MembraneOrientationControlState> {
    protected defaultState() {
        return {
            header: 'Membrane Layer',
            isCollapsed: false,
            isBusy: false,
            isHidden: true,
            brand: { accent:  'gray' as const, svg: MembraneIconSvg },
            error: false
        };
    }

    componentDidMount() {
        this.subscribe(this.plugin.managers.structure.hierarchy.behaviors.selection, () => {
            this.setState({
                isHidden: !this.canEnable(),
                description: StructureHierarchyManager.getSelectedStructuresDescription(this.plugin)
            });
        });
        this.subscribe(this.plugin.state.events.cell.stateUpdated, e => {
            if (StateTransform.hasTag(e.cell.transform, MembraneOrientation.Tag.Representation)) this.forceUpdate();
        });
        this.subscribe(this.plugin.behaviors.state.isBusy, v => {
            this.setState({ isBusy: v });
        });
    }

    get pivot() {
        return this.plugin.managers.structure.hierarchy.selection.structures[0];
    }

    canEnable() {
        const { selection } = this.plugin.managers.structure.hierarchy;
        if (selection.structures.length !== 1) return false;
        const pivot = this.pivot.cell;
        if (!pivot.obj) return false;
        // TODO check if delegate makes sense
        return true;
    }

    renderEnable() {
        const pivot = this.pivot;
        if (!pivot.cell.parent) return null;
        return <ApplyActionControl state={pivot.cell.parent} action={EnableMembraneOrientation} initiallyCollapsed={true} nodeRef={pivot.cell.transform.ref} simpleApply={{ header: 'Enable', icon: CheckSvg }} />;
    }

    renderNoMembraneProtein() {
        // TODO allow to 'force' calculation?
        return <div className='msp-row-text'>
            <div>Not registered as Membrane Protein</div>
        </div>;
    }

    renderError() {
        return <div className='msp-row-text'>

        </div>;
    }

    get params() {
        const structure = this.pivot.cell.obj?.data;
        const params = PD.clone(structure ? MembraneOrientationProvider.getParams(structure) : MembraneOrientationProvider.defaultParams);
        // TODO more?
        return params;
    }

    get values() {
        const structure = this.pivot.cell.obj?.data;
        if (structure) {
            return MembraneOrientationProvider.props(structure);
        } else {
            return PD.getDefaultValues(MembraneOrientationProvider.defaultParams);
        }
    }

    async updateMembraneOrientation(values: MembraneOrientationProps) {
        const s = this.pivot;
        const currValues = MembraneOrientationProvider.props(s.cell.obj!.data);
        if (PD.areEqual(MembraneOrientationProvider.defaultParams, currValues, values)) return;

        if (s.properties) {
            const b = this.plugin.state.data.build();
            b.to(s.properties.cell).update(old => {
                old.properties[MembraneOrientationProvider.descriptor.name] = values;
            });
            await b.commit();
        } else {
            const pd = this.plugin.customStructureProperties.getParams(s.cell.obj?.data);
            const params = PD.getDefaultValues(pd);
            params.properties[MembraneOrientationProvider.descriptor.name] = values;
            await this.plugin.builders.structure.insertStructureProperties(s.cell, params);
        }

        for (const components of this.plugin.managers.structure.hierarchy.currentComponentGroups) {
            tryCreateMembraneOrientation(this.plugin, s.cell);
            await this.plugin.managers.structure.component.updateRepresentationsTheme(components, { color: 'default' });
        }
    }

    paramsOnChange = (options: MembraneOrientationProps) => {
        this.updateMembraneOrientation(options);
    }

    get hasMembraneOrientation() {
        return !this.pivot.cell.parent || !!StateSelection.findTagInSubtree(this.pivot.cell.parent.tree, this.pivot.cell.transform.ref, MembraneOrientation.Tag.Representation);
    }

    get enable() {
        return !this.hasMembraneOrientation;
    }

    get noMembraneProtein() {
        const structure = this.pivot.cell.obj?.data;
        const data = structure && MembraneOrientationProvider.get(structure).value;
        return !!data;
    }

    renderParams() {
        return <>
            <ParameterControls params={this.params} values={this.values} onChangeValues={this.paramsOnChange} />
        </>;
    }

    renderControls() {
        if (!this.pivot) return null;
        if (this.noMembraneProtein) return this.renderNoMembraneProtein();
        if (!this.noMembraneProtein && this.state.error) return this.renderError();
        if (this.enable) return this.renderEnable();
        return this.renderParams();
    }
}

const EnableMembraneOrientation = StateAction.build({
    from: PluginStateObject.Molecule.Structure,
})(({ a, ref, state }, plugin: PluginContext) => Task.create('Enable Membrane Orientation', async ctx => {
    await MembraneOrientationPreset.apply(ref, Object.create(null), plugin);
}));

const _MembraneIcon = <svg width='24px' height='24px' viewBox='0 0 12 12'>
    <rect x="6.71" y="2.45" width="1.96" height="7.1" ry=".979" fill="none" strokeLinejoin="round"/>
    <rect x="3.33" y="2.45" width="1.96" height="7.1" ry=".979" fill="none" strokeLinejoin="round"/>
    <g>
        <ellipse cx="1.77" cy="4.64" rx=".433" ry=".456"/>
        <ellipse cx=".685" cy="4.64" rx=".433" ry=".456"/>
        <ellipse cx=".685" cy="7.36" rx=".433" ry=".456"/>
        <ellipse cx="1.77" cy="7.36" rx=".433" ry=".456"/>
        <ellipse cx="9.19" cy="7.36" rx=".433" ry=".456"/>
        <ellipse cx="11.3" cy="7.36" rx=".433" ry=".456"/>
        <ellipse cx="10.3" cy="4.64" rx=".433" ry=".456"/>
        <ellipse cx="9.19" cy="4.64" rx=".433" ry=".456"/>
        <ellipse cx="2.86" cy="4.64" rx=".433" ry=".456"/>
        <ellipse cx="2.86" cy="7.36" rx=".433" ry=".456"/>
        <ellipse cx="10.3" cy="7.36" rx=".433" ry=".456"/>
        <ellipse cx="11.3" cy="4.64" rx=".433" ry=".456"/>
    </g>
</svg>;
export function MembraneIconSvg() { return _MembraneIcon; }