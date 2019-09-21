/**
 * Copyright (c) 2019 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import * as React from 'react';
import { CollapsableControls, CollapsableState } from 'molstar/lib/mol-plugin/ui/base';
import { StateElements } from '../helpers';
import { ParameterControls } from 'molstar/lib/mol-plugin/ui/controls/parameters';
import { ParamDefinition as PD } from 'molstar/lib/mol-util/param-definition';
import { PluginCommands } from 'molstar/lib/mol-plugin/command';
import { StateObject, StateBuilder, StateTree, StateSelection } from 'molstar/lib/mol-state';
import { PluginStateObject as PSO } from 'molstar/lib/mol-plugin/state/objects';
import { StateTransforms } from 'molstar/lib/mol-plugin/state/transforms';
import { Vec3 } from 'molstar/lib/mol-math/linear-algebra';
import { Model } from 'molstar/lib/mol-model/structure';
import { PluginContext } from 'molstar/lib/mol-plugin/context';

interface StructureControlsState extends CollapsableState {
    trajectoryRef: string
}

export class StructureControlsHelper {
    applyState(tree: StateBuilder) {
        return PluginCommands.State.Update.dispatch(this.plugin, { state: this.plugin.state.dataState, tree });
    }

    async preset() {
        await this.plugin.helpers.structureRepresentation.preset()
    }

    async setAssembly(id: string) {
        const state = this.plugin.state.dataState;
        const tree = state.build();
        if (id === 'unitcell') {
            const props = { ijkMin: Vec3.create(0, 0, 0), ijkMax: Vec3.create(0, 0, 0) }
            tree.delete(StateElements.Assembly)
                .to(StateElements.Model).apply(
                    StateTransforms.Model.StructureSymmetryFromModel,
                    props, { ref: StateElements.Assembly, tags: [ 'unitcell' ] }
                )
        } else if (id === 'supercell') {
            const props = { ijkMin: Vec3.create(-1, -1, -1), ijkMax: Vec3.create(1, 1, 1) }
            tree.delete(StateElements.Assembly)
                .to(StateElements.Model).apply(
                    StateTransforms.Model.StructureSymmetryFromModel,
                    props, { ref: StateElements.Assembly, tags: [ 'supercell' ] }
                )
        } else {
            tree.delete(StateElements.Assembly)
                .to(StateElements.Model).apply(
                    StateTransforms.Model.StructureAssemblyFromModel,
                    { id }, { ref: StateElements.Assembly }
                )
        }
        await this.applyState(tree)
        await this.preset()
    }

    async setModel(modelIndex: number) {
        const state = this.plugin.state.dataState;
        const tree = state.build();
        if (modelIndex === -1) {
            tree.delete(StateElements.Model)
                .to(StateElements.Trajectory).apply(
                    StateTransforms.Model.StructureFromTrajectory,
                    {}, { ref: StateElements.Assembly }
                )
            await this.applyState(tree);
            await this.preset()
        } else {
            if (state.tree.transforms.has(StateElements.Model)) {
                tree.to(StateElements.Model).update(
                    StateTransforms.Model.ModelFromTrajectory,
                    props => ({ ...props, modelIndex })
                );
                await this.applyState(tree);
            } else {
                tree.delete(StateElements.Assembly)
                    .to(StateElements.Trajectory).apply(
                        StateTransforms.Model.ModelFromTrajectory,
                        { modelIndex }, { ref: StateElements.Model }
                    )
                    .apply(
                        StateTransforms.Model.StructureAssemblyFromModel,
                        { id: 'deposited' }, { ref: StateElements.Assembly }
                    );
                await this.applyState(tree);
                await this.preset()
            }
        }
    }

    constructor(private plugin: PluginContext) {

    }
}

export class StructureControls<P, S extends StructureControlsState> extends CollapsableControls<P, S> {
    structureControlsHelper: StructureControlsHelper

    constructor(props: P, context?: any) {
        super(props, context);
        this.structureControlsHelper = new StructureControlsHelper(this.plugin)
    }

    async setColorTheme(theme: { [k: string]: string }) {
        const { themeCtx } = this.plugin.structureRepresentation
        const state = this.plugin.state.dataState;
        const tree = state.build();

        const assembly = this.getAssembly()
        const dataCtx = { structure: assembly && assembly.data }

        Object.keys(theme).forEach(k => {
            const repr = this.getRepresentation(k)
            if (repr && repr.params) {
                const values = PD.getDefaultValues(themeCtx.colorThemeRegistry.get(name).getParams(dataCtx))
                tree.to(repr.transform.ref).update(
                    StateTransforms.Representation.StructureRepresentation3D,
                    props => ({ ...props, colorTheme: { name: theme[k], params: values }})
                )
            }
        })
        await this.structureControlsHelper.applyState(tree)
    }

    onChange = async (p: { param: PD.Base<any>, name: string, value: any }) => {
        // console.log('onChange', p.name, p.value)
        if (p.name === 'assembly') {
            this.structureControlsHelper.setAssembly(p.value)
        } else if (p.name === 'model') {
            this.structureControlsHelper.setModel(p.value)
        } else if (p.name === 'colorThemes') {
            this.setColorTheme(p.value)
        }
    }

    getRepresentation(type: string) {
        return this.plugin.helpers.structureRepresentation.getRepresentation(StateElements.Assembly, type)
    }

    getParams = () => {
        const { themeCtx, registry } = this.plugin.structureRepresentation
        const trajectory = this.getTrajectory()
        const model = this.getModel()
        const assembly = this.getAssembly()

        const modelOptions: [number, string][] = []
        const assemblyOptions: [string, string][] = [['deposited', 'deposited']]

        if (trajectory) {
            if (trajectory.data.length > 1) modelOptions.push([-1, `All`])
            for (let i = 0, il = trajectory.data.length; i < il; ++i) {
                modelOptions.push([i, `${i + 1}`])
            }
            if (trajectory.data.length === 1 && modelHasSymmetry(trajectory.data[0])) {
                assemblyOptions.push(['unitcell', 'unitcell'], ['supercell', 'supercell'])
            }
        }

        let modelValue = 0
        if (model) {
            if (trajectory) modelValue = trajectory.data.indexOf(model.data)
            const { assemblies } = model.data.symmetry
            for (let i = 0, il = assemblies.length; i < il; ++i) {
                const a = assemblies[i]
                assemblyOptions.push([a.id, `${a.id}: ${a.details}`])
            }
        } else if (assembly) {
            // assembly from trajectory, no model
            modelValue = -1
        }

        let assemblyValue = 'deposited'
        let colorTypes = themeCtx.colorThemeRegistry.types
        let types = registry.types
        if (assembly) {
            assemblyValue = assembly.data.units[0].conformation.operator.assembly.id
            colorTypes = themeCtx.colorThemeRegistry.getApplicableTypes({ structure: assembly.data })
            types = registry.getApplicableTypes(assembly.data)
        }

        const colorThemes: { [k: string]: PD.Any } = {}
        for (let i = 0, il = types.length; i < il; ++i) {
            const type = types[i][0]
            const r = this.getRepresentation(type)
            if (r) {
                const n = r.params ? r.params.values.colorTheme.name : registry.get(type).defaultColorTheme
                const p = themeCtx.colorThemeRegistry.get(n)
                const d = { structure: assembly && assembly.data }
                const ct = p.factory(d, PD.getDefaultValues(p.getParams(d)))
                colorThemes[type] = PD.Select(n, colorTypes, { description: ct.description, legend: ct.legend })
            }
        }

        return {
            assembly: PD.Select(assemblyValue, assemblyOptions, {
                isHidden: assemblyOptions.length === 1
            }),
            model: PD.Select(modelValue, modelOptions, {
                isHidden: modelOptions.length === 1
            }),
            // symmetry: PD.Select('todo', [['todo', 'todo']]), // TODO
            colorThemes: PD.Group(colorThemes, { isExpanded: true }),
        }
    }

    get values () {
        const trajectory = this.getTrajectory()
        const model = this.getModel()
        const assembly = this.getAssembly()

        const { registry } = this.plugin.structureRepresentation
        const types = assembly ? registry.getApplicableTypes(assembly.data) : registry.types

        const colorThemes: { [k: string]: string } = {}
        for (let i = 0, il = types.length; i < il; ++i) {
            const type = types[i][0]
            const r = this.getRepresentation(type)
            colorThemes[type] = r && r.params ? r.params.values.colorTheme.name : registry.get(type).defaultColorTheme
        }

        let modelValue = 0
        if (trajectory) {
            modelValue = model ? trajectory.data.indexOf(model.data) : -1
        }

        let assemblyValue = 'deposited'
        if (assembly) {
            const tags = (assembly as StateObject).tags
            if (tags && tags.includes('unitcell')) {
                assemblyValue = 'unitcell'
            } else if (tags && tags.includes('supercell')) {
                assemblyValue = 'supercell'
            } else {
                assemblyValue = assembly.data.units[0].conformation.operator.assembly.id || 'deposited'
            }
        }

        return {
            assembly: assemblyValue,
            model: modelValue,
            symmetry: 'todo',
            colorThemes,
        }
    }

    private findTrajectoryRef() {
        const trajectories = this.plugin.state.dataState.select(StateSelection.Generators.rootsOfType(PSO.Molecule.Trajectory))
        return trajectories.length > 0 ? trajectories[0].transform.ref : ''
    }

    componentDidMount() {
        this.setState({ trajectoryRef: this.findTrajectoryRef() })

        this.subscribe(this.plugin.events.state.object.updated, ({ ref, state }) => {
            if (!this.getTrajectory()) {
                this.setState({ trajectoryRef: this.findTrajectoryRef() })
            } else if (StateTree.subtreeHasRef(state.tree, this.state.trajectoryRef, ref)) {
                this.forceUpdate()
            }
        })

        this.subscribe(this.plugin.events.state.object.created, ({ ref, state }) => {
            if (!this.getTrajectory()) {
                this.setState({ trajectoryRef: this.findTrajectoryRef() })
            } else if (StateTree.subtreeHasRef(state.tree, this.state.trajectoryRef, ref)) {
                this.forceUpdate()
            }
        })

        this.subscribe(this.plugin.events.state.object.removed, ({ ref, state }) => {
            if (!this.getTrajectory()) {
                this.setState({ trajectoryRef: this.findTrajectoryRef() })
            } else if (StateTree.subtreeHasRef(state.tree, this.state.trajectoryRef, ref)) {
                this.forceUpdate()
            }
        })
    }

    private getObj<T extends StateObject>(ref: string): T | undefined {
        if (!ref) return undefined
        const state = this.plugin.state.dataState
        const cell = state.select(ref)[0]
        if (!cell || !cell.obj) return undefined
        return (cell.obj as T)
    }

    private getTrajectory() {
        return this.getObj<PSO.Molecule.Trajectory>(this.state.trajectoryRef)
    }

    private getModel() {
        if (!this.state.trajectoryRef) return
        const models = this.plugin.state.dataState.select(StateSelection.Generators.rootsOfType(PSO.Molecule.Model, this.state.trajectoryRef))
        return models.length > 0 ? models[0].obj : undefined
    }

    private getAssembly() {
        if (!this.state.trajectoryRef || !this.plugin.state.dataState.transforms.has(this.state.trajectoryRef)) return
        const assemblies = this.plugin.state.dataState.select(StateSelection.Generators.rootsOfType(PSO.Molecule.Structure, this.state.trajectoryRef))
        return assemblies.length > 0 ? assemblies[0].obj : undefined
    }

    defaultState() {
        return {
            isCollapsed: false,
            header: 'Structure Settings',

            trajectoryRef: '',
        } as S
    }

    renderControls() {
        if (!this.plugin.canvas3d) return null
        if (!this.getTrajectory() || !this.getAssembly()) return null

        return <div>
            <ParameterControls params={this.getParams()} values={this.values} onChange={this.onChange} />
        </div>
    }
}

function modelHasSymmetry(model: Model) {
    const mmcif = model.sourceData.data
    return (
        mmcif.symmetry._rowCount === 1 && mmcif.cell._rowCount === 1 && !(
            mmcif.symmetry.Int_Tables_number.value(0) === 1 &&
            mmcif.cell.angle_alpha.value(0) === 90 &&
            mmcif.cell.angle_beta.value(0) === 90 &&
            mmcif.cell.angle_gamma.value(0) === 90 &&
            mmcif.cell.length_a.value(0) === 1 &&
            mmcif.cell.length_b.value(0) === 1 &&
            mmcif.cell.length_c.value(0) === 1
        )
    )
}