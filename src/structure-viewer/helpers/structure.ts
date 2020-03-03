/**
 * Copyright (c) 2019-2020 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import { StateElements, AssemblyNames, StructureViewerState, ModelNames } from '../types';
import { PluginCommands } from 'molstar/lib/mol-plugin/command';
import { StateBuilder, State, StateSelection } from 'molstar/lib/mol-state';
import { StateTransforms } from 'molstar/lib/mol-plugin/state/transforms';
import { Vec3 } from 'molstar/lib/mol-math/linear-algebra';
import { PluginContext } from 'molstar/lib/mol-plugin/context';
import { PluginStateObject as PSO } from 'molstar/lib/mol-plugin/state/objects';
import { AssemblySymmetryProvider } from 'molstar/lib/mol-model-props/rcsb/assembly-symmetry';
import { Task } from 'molstar/lib/mol-task';
import { AssemblySymmetry3D } from 'molstar/lib/mol-plugin/behavior/dynamic/custom-props/rcsb/assembly-symmetry';
import { ValidationReportProvider } from 'molstar/lib/mol-model-props/rcsb/validation-report';
import { getStructureSize } from './util';

export class StructureView {
    get customState() {
        return this.plugin.customState as StructureViewerState
    }

    async applyState(tree: StateBuilder) {
        await PluginCommands.State.Update.dispatch(this.plugin, { state: this.plugin.state.dataState, tree });
    }

    get experimentalData () {
        return this.customState.volumeData
    }

    findTrajectoryRef() {
        const trajectories = this.plugin.state.dataState.select(StateSelection.Generators.rootsOfType(PSO.Molecule.Trajectory))
        return trajectories.length > 0 ? trajectories[0].transform.ref : ''
    }

    getAssembly() {
        const trajectoryRef = this.findTrajectoryRef()
        if (!trajectoryRef || !this.plugin.state.dataState.transforms.has(trajectoryRef)) return
        const assemblies = this.plugin.state.dataState.select(StateSelection.Generators.rootsOfType(PSO.Molecule.Structure, trajectoryRef))
        return assemblies.length > 0 ? assemblies[0] : undefined
    }

    getModel() {
        const trajectoryRef = this.findTrajectoryRef()
        const models = this.plugin.state.dataState.select(StateSelection.Generators.rootsOfType(PSO.Molecule.Model, trajectoryRef))
        return models.length > 0 ? models[0].obj : undefined
    }

    getSize() {
        const assembly = this.getAssembly()
        return assembly?.obj && getStructureSize(assembly.obj.data)
    }

    private ensureModelUnitcell(tree: StateBuilder.Root, state: State) {
        if (!state.tree.transforms.has(StateElements.ModelUnitcell)) {
            tree.to(StateElements.Model).apply(
                StateTransforms.Representation.ModelUnitcell3D,
                undefined, { ref: StateElements.ModelUnitcell }
            )
        }
    }

    async attachAssemblySymmetry() {
        const assembly = this.getAssembly()?.obj
        if (!assembly || assembly.data.isEmpty) return

        await this.plugin.runTask(Task.create('Assembly symmetry', async runtime => {
            await AssemblySymmetryProvider.attach({ fetch: this.plugin.fetch, runtime }, assembly.data)
        }))
    }

    async attachValidationReport() {
        const model = this.getModel()
        if (!model) return

        await this.plugin.runTask(Task.create('Validation Report', async runtime => {
            await ValidationReportProvider.attach({ fetch: this.plugin.fetch, runtime }, model.data)
        }))
    }

    async setAssembly(id: string) {
        const state = this.plugin.state.dataState;
        const tree = state.build();

        if (state.tree.transforms.has(StateElements.Assembly)) {
            tree.to(StateElements.Assembly).update(
                StateTransforms.Model.StructureFromModel,
                props => ({ ...props, ...getAssemblyProps(id) })
            )
        } else {
            tree.to(StateElements.Model).apply(
                StateTransforms.Model.StructureFromModel,
                getAssemblyProps(id), { ref: StateElements.Assembly, tags: getAssemblyTag(id) }
            )
        }
        if (id === AssemblyNames.Unitcell || id === AssemblyNames.Supercell) {
            this.ensureModelUnitcell(tree, state)
        }
        await this.applyState(tree)
        await this.attachAssemblySymmetry()
        await this.experimentalData.init()
    }

    async setModel(modelIndex: number) {
        const state = this.plugin.state.dataState;
        const tree = state.build();
        if (modelIndex === ModelNames.All) {
            tree.delete(StateElements.Model)
                .to(StateElements.Trajectory).apply(
                    StateTransforms.Model.StructureFromTrajectory,
                    {}, { ref: StateElements.Assembly }
                )
        } else {
            if (state.tree.transforms.has(StateElements.Model)) {
                tree.to(StateElements.Model).update(
                    StateTransforms.Model.ModelFromTrajectory,
                    props => ({ ...props, modelIndex })
                )
            } else {
                tree.delete(StateElements.Assembly)
                    .to(StateElements.Trajectory).apply(
                        StateTransforms.Model.ModelFromTrajectory,
                        { modelIndex }, { ref: StateElements.Model }
                    )
            }
        }
        await this.applyState(tree)
    }

    async setSymmetry(symmetryIndex: number) {
        const state = this.plugin.state.dataState;
        const tree = state.build();
        if (symmetryIndex === -1) {
            tree.delete(StateElements.AssemblySymmetry)
        } else {
            if (state.tree.transforms.has(StateElements.AssemblySymmetry)) {
                tree.to(StateElements.AssemblySymmetry).update(
                    AssemblySymmetry3D,
                    props => ({ ...props, symmetryIndex })
                )
            } else {
                const assembly = this.getAssembly()?.obj
                if (!assembly || assembly.data.isEmpty) return

                const props = AssemblySymmetry3D.createDefaultParams(assembly, this.plugin)
                tree.to(StateElements.Assembly).apply(
                    AssemblySymmetry3D,
                    { ...props, symmetryIndex }, { ref: StateElements.AssemblySymmetry }
                )
            }
        }
        await this.applyState(tree)
    }

    constructor(private plugin: PluginContext) {

    }
}

function getAssemblyProps(id: string) {
    if (id === AssemblyNames.Unitcell) {
        return {
            type: {
                name: 'symmetry' as const,
                params: { ijkMin: Vec3.create(0, 0, 0), ijkMax: Vec3.create(0, 0, 0) }
            }
        }
    } else if (id === AssemblyNames.Supercell) {
        return {
            type: {
                name: 'symmetry' as const,
                params: { ijkMin: Vec3.create(-1, -1, -1), ijkMax: Vec3.create(1, 1, 1) }
            }
        }
    } else if (id === AssemblyNames.CrystalContacts) {
        return {
            type: {
                name: 'symmetry-mates' as const,
                params: { radius: 5 }
            }
        }
    } else {
        return {
            type: {
                name: 'assembly' as const,
                params: { id }
            }
        }
    }
}

function getAssemblyTag(id: string) {
    switch (id) {
        case AssemblyNames.Unitcell:
        case AssemblyNames.Supercell:
        case AssemblyNames.CrystalContacts:
            return id
        default:
            return undefined
    }
}