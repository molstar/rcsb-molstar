/**
 * Copyright (c) 2019 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import { StateElements, AssemblyNames, StructureViewerState } from '../types';
import { PluginCommands } from 'molstar/lib/mol-plugin/command';
import { StateBuilder, State, StateSelection } from 'molstar/lib/mol-state';
import { StateTransforms } from 'molstar/lib/mol-plugin/state/transforms';
import { Vec3 } from 'molstar/lib/mol-math/linear-algebra';
import { PluginContext } from 'molstar/lib/mol-plugin/context';
import { PluginStateObject as PSO } from 'molstar/lib/mol-plugin/state/objects';
import { Structure, StructureElement } from 'molstar/lib/mol-model/structure';

export class StructureView {
    applyState(tree: StateBuilder) {
        return PluginCommands.State.Update.dispatch(this.plugin, { state: this.plugin.state.dataState, tree });
    }

    get experimentalData () {
        return (this.plugin.customState as StructureViewerState).volumeData
    }

    private findTrajectoryRef() {
        const trajectories = this.plugin.state.dataState.select(StateSelection.Generators.rootsOfType(PSO.Molecule.Trajectory))
        return trajectories.length > 0 ? trajectories[0].transform.ref : ''
    }

    private getAssembly() {
        const trajectoryRef = this.findTrajectoryRef()
        if (!trajectoryRef || !this.plugin.state.dataState.transforms.has(trajectoryRef)) return
        const assemblies = this.plugin.state.dataState.select(StateSelection.Generators.rootsOfType(PSO.Molecule.Structure, trajectoryRef))
        return assemblies.length > 0 ? assemblies[0].obj : undefined
    }

    async preset() {
        await this.plugin.helpers.structureRepresentation.preset()

        const assembly = this.getAssembly()
        if (!assembly || assembly.data.isEmpty) return

        const extraRadius = 4, minRadius = 8, durationMs = 250

        const radius = Math.max(assembly.data.lookup3d.boundary.sphere.radius + extraRadius, minRadius);
        const loci = Structure.toStructureElementLoci(assembly.data)
        const principalAxes = StructureElement.Loci.getPrincipalAxes(loci)
        const { center, normVecA, normVecC } = principalAxes

        this.plugin.canvas3d.camera.focus(center, radius, durationMs, normVecA, normVecC);
    }

    private ensureModelUnitcell(tree: StateBuilder.Root, state: State) {
        if (!state.tree.transforms.has(StateElements.ModelUnitcell)) {
            tree.to(StateElements.Model).apply(
                StateTransforms.Representation.ModelUnitcell3D,
                undefined, { ref: StateElements.ModelUnitcell }
            )
        }
    }

    async setAssembly(id: string) {
        const state = this.plugin.state.dataState;
        const tree = state.build();
        if (id === AssemblyNames.Unitcell) {
            const props = { ijkMin: Vec3.create(0, 0, 0), ijkMax: Vec3.create(0, 0, 0) }
            tree.delete(StateElements.Assembly)
                .to(StateElements.Model).apply(
                    StateTransforms.Model.StructureSymmetryFromModel,
                    props, { ref: StateElements.Assembly, tags: [ AssemblyNames.Unitcell ] }
                )
            this.ensureModelUnitcell(tree, state)
        } else if (id === AssemblyNames.Supercell) {
            const props = { ijkMin: Vec3.create(-1, -1, -1), ijkMax: Vec3.create(1, 1, 1) }
            tree.delete(StateElements.Assembly)
                .to(StateElements.Model).apply(
                    StateTransforms.Model.StructureSymmetryFromModel,
                    props, { ref: StateElements.Assembly, tags: [ AssemblyNames.Supercell ] }
                )
            this.ensureModelUnitcell(tree, state)
        } else if (id === AssemblyNames.CrystalContacts) {
            const props = { radius: 5 }
            tree.delete(StateElements.ModelUnitcell)
            tree.delete(StateElements.Assembly)
                .to(StateElements.Model).apply(
                    StateTransforms.Model.StructureSymmetryMatesFromModel,
                    props, { ref: StateElements.Assembly, tags: [ AssemblyNames.CrystalContacts ] }
                )
        } else {
            tree.delete(StateElements.ModelUnitcell)
            tree.delete(StateElements.Assembly)
                .to(StateElements.Model).apply(
                    StateTransforms.Model.StructureAssemblyFromModel,
                    { id }, { ref: StateElements.Assembly }
                )
        }
        await this.applyState(tree)
        await this.preset()
        await this.experimentalData.init()
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
                    .apply(
                        StateTransforms.Model.StructureAssemblyFromModel,
                        { id: AssemblyNames.Deposited }, { ref: StateElements.Assembly }
                    )
            }
        }
        await this.applyState(tree)
        await this.preset()
    }

    constructor(private plugin: PluginContext) {

    }
}