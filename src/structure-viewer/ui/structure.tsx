/**
 * Copyright (c) 2019 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import * as React from 'react';
import { CollapsableControls, CollapsableState } from 'molstar/lib/mol-plugin/ui/base';
import { StateElements, AssemblyNames, StructureViewerState } from '../types';
import { ParameterControls } from 'molstar/lib/mol-plugin/ui/controls/parameters';
import { ParamDefinition as PD } from 'molstar/lib/mol-util/param-definition';
import { StateObject, StateTree, StateSelection } from 'molstar/lib/mol-state';
import { PluginStateObject as PSO } from 'molstar/lib/mol-plugin/state/objects';
import { StateTransforms } from 'molstar/lib/mol-plugin/state/transforms';
import { Model } from 'molstar/lib/mol-model/structure';

interface StructureControlsState extends CollapsableState {
    trajectoryRef: string
    isDisabled: boolean
}

export class StructureControls<P, S extends StructureControlsState> extends CollapsableControls<P, S> {
    constructor(props: P, context?: any) {
        super(props, context);
    }

    get structureView () {
        return (this.plugin.customState as StructureViewerState).structureView
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
        await this.structureView.applyState(tree)
    }

    onChange = async (p: { param: PD.Base<any>, name: string, value: any }) => {
        // console.log('onChange', p.name, p.value)
        if (p.name === 'assembly') {
            this.structureView.setAssembly(p.value)
        } else if (p.name === 'model') {
            this.structureView.setModel(p.value)
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
        const assemblyOptions: [string, string][] = [[AssemblyNames.Deposited, 'deposited']]

        if (trajectory) {
            if (trajectory.data.length > 1) modelOptions.push([-1, `All`])
            for (let i = 0, il = trajectory.data.length; i < il; ++i) {
                modelOptions.push([i, `${i + 1}`])
            }
            if (trajectory.data.length === 1 && modelHasSymmetry(trajectory.data[0])) {
                assemblyOptions.push(
                    [AssemblyNames.Unitcell, 'unitcell'],
                    [AssemblyNames.Supercell, 'supercell'],
                    [AssemblyNames.CrystalContacts, 'crystal contacts']
                )
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

        let assemblyValue: string = AssemblyNames.Deposited
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
                isHidden: assemblyOptions.length === 1,
                description: 'Show a specific biological, crystallographic or artificial assembly'
            }),
            model: PD.Select(modelValue, modelOptions, {
                isHidden: modelOptions.length === 1,
                description: 'Show a specific model or the full ensamble of models'
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

        let assemblyValue: string = AssemblyNames.Deposited
        if (assembly) {
            const tags = (assembly as StateObject).tags
            if (tags && tags.includes('unitcell')) {
                assemblyValue = AssemblyNames.Unitcell
            } else if (tags && tags.includes('supercell')) {
                assemblyValue = AssemblyNames.Supercell
            } else if (tags && tags.includes('crystal-contacts')) {
                assemblyValue = AssemblyNames.CrystalContacts
            } else {
                assemblyValue = assembly.data.units[0].conformation.operator.assembly.id || AssemblyNames.Deposited
            }
        }

        return {
            assembly: assemblyValue,
            model: modelValue,
            // symmetry: 'todo', // TODO
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

        this.subscribe(this.plugin.state.dataState.events.isUpdating, v => this.setState({ isDisabled: v }))
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
            isDisabled: false
        } as S
    }

    renderControls() {
        if (!this.plugin.canvas3d) return null
        if (!this.getTrajectory() || !this.getAssembly()) return null

        return <div>
            <ParameterControls params={this.getParams()} values={this.values} onChange={this.onChange} isDisabled={this.state.isDisabled} />
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