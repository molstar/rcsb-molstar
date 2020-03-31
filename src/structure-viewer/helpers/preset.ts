/**
 * Copyright (c) 2020 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import { PluginContext } from 'molstar/lib/mol-plugin/context';
import { MolScriptBuilder as MS } from 'molstar/lib/mol-script/language/builder';
import Expression from 'molstar/lib/mol-script/language/expression';
import { ParamDefinition as PD } from 'molstar/lib/mol-util/param-definition';
import { TrajectoryHierarchyPresetProvider } from 'molstar/lib/mol-plugin-state/builder/structure/hierarchy-preset';
import { ValidationReportPreset } from 'molstar/lib/mol-plugin/behavior/dynamic/custom-props/rcsb/validation-report';
import { AssemblySymmetryPreset } from 'molstar/lib/mol-plugin/behavior/dynamic/custom-props/rcsb/assembly-symmetry';
import { PluginStateObject } from 'molstar/lib/mol-plugin-state/objects';
import { RootStructureDefinition } from 'molstar/lib/mol-plugin-state/helpers/root-structure';
import { StructureRepresentationPresetProvider } from 'molstar/lib/mol-plugin-state/builder/structure/representation-preset';
import { Structure, StructureSelection, QueryContext, StructureElement } from 'molstar/lib/mol-model/structure';
import { compile } from 'molstar/lib/mol-script/runtime/query/compiler';
import { InitVolumeStreaming } from 'molstar/lib/mol-plugin/behavior/dynamic/volume-streaming/transformers';

type Target = {
    readonly auth_seq_id?: number
    readonly label_seq_id?: number
    readonly label_comp_id?: string
    readonly label_asym_id?: string
}

function targetToExpression(target: Target): Expression {
    const residueTests: Expression[] = []
    const tests = Object.create(null)

    if (target.auth_seq_id) {
        residueTests.push(MS.core.rel.eq([target.auth_seq_id, MS.ammp('auth_seq_id')]))
    } else if (target.label_seq_id) {
        residueTests.push(MS.core.rel.eq([target.label_seq_id, MS.ammp('label_seq_id')]))
    }
    if (target.label_comp_id) {
        residueTests.push(MS.core.rel.eq([target.label_comp_id, MS.ammp('label_comp_id')]))
    }
    if (residueTests.length === 1) {
        tests['residue-test'] = residueTests[0]
    } else if (residueTests.length > 1) {
        tests['residue-test'] = MS.core.logic.and(residueTests)
    }

    if (target.label_asym_id) {
        tests['chain-test'] = MS.core.rel.eq([target.label_asym_id, MS.ammp('label_asym_id')])
    }

    if (Object.keys(tests).length > 0) {
        return MS.struct.modifier.union([
            MS.struct.generator.atomGroups(tests)
        ])
    } else {
        return MS.struct.generator.empty
    }
}

function targetToLoci(target: Target, structure: Structure): StructureElement.Loci {
    const expression = targetToExpression(target)
    const query = compile<StructureSelection>(expression)
    const selection = query(new QueryContext(structure));
    return StructureSelection.toLociWithSourceUnits(selection)
}

type BaseProps = {
    assemblyId?: string
    modelIndex?: number
}

type ValidationProps = {
    kind: 'validation'
    colorTheme?: string
    showClashes?: boolean
} & BaseProps

type StandardProps = {
    kind: 'standard'
} & BaseProps

type SymmetryProps = {
    kind: 'symmetry'
    symmetryIndex?: number
} & BaseProps

type FeatureProps = {
    kind: 'feature'
    target: Target
} & BaseProps

type DensityProps = {
    kind: 'density'
} & BaseProps

export type PresetProps = ValidationProps | StandardProps | SymmetryProps | FeatureProps | DensityProps

const RcsbParams = (a: PluginStateObject.Molecule.Trajectory | undefined, plugin: PluginContext) => ({
    preset: PD.Value<PresetProps>({ kind: 'standard', assemblyId: 'deposited' }, { isHidden: true })
});

export const RcsbPreset = TrajectoryHierarchyPresetProvider({
    id: 'preset-trajectory-rcsb',
    display: { name: 'RCSB' },
    isApplicable: o => {
        return true
    },
    params: RcsbParams,
    async apply(trajectory, params, plugin) {
        const builder = plugin.builders.structure;
        const p = params.preset

        const modelParams = { modelIndex: p.modelIndex || 0 }

        const structureParams: RootStructureDefinition.Params = { name: 'deposited', params: {} }
        if (p.assemblyId && p.assemblyId !== 'deposited' && p.assemblyId !== '0') {
            Object.assign(structureParams, {
                name: 'assembly',
                params: { id: p.assemblyId }
            } as RootStructureDefinition.Params)
        }

        const model = await builder.createModel(trajectory, modelParams);
        const modelProperties = await builder.insertModelProperties(model);

        const structure = await builder.createStructure(modelProperties || model, structureParams);
        const structureProperties = await builder.insertStructureProperties(structure);

        const unitcell = await builder.tryCreateUnitcell(modelProperties, undefined, { isHidden: true });

        let representation: StructureRepresentationPresetProvider.Result | undefined = undefined

        if (p.kind === 'validation') {
            representation = await plugin.builders.structure.representation.applyPreset(structureProperties, ValidationReportPreset);
        } else if (p.kind === 'symmetry') {
            representation = await plugin.builders.structure.representation.applyPreset<any>(structureProperties, AssemblySymmetryPreset, { symmetryIndex: p.symmetryIndex });
        } else {
            representation = await plugin.builders.structure.representation.applyPreset(structureProperties, 'auto');
        }

        if (p.kind === 'feature') {
            const loci = targetToLoci(p.target, structure.obj!.data)
            const firstResidue = StructureElement.Loci.firstResidue(loci)
            plugin.managers.structure.focus.setFromLoci(firstResidue)
        }

        if (p.kind === 'density') {
            const structureRef = plugin.managers.structure.hierarchy.selection.structures.filter(s => s.cell.obj === structure.obj)[0]
            if (structureRef && !structureRef.volumeStreaming) {
                const params = PD.getDefaultValues(InitVolumeStreaming.definition.params!(structure.obj!, plugin))
                await plugin.runTask(plugin.state.data.applyAction(InitVolumeStreaming, params, structure.ref))
            }
        }

        return {
            model,
            modelProperties,
            unitcell,
            structure,
            structureProperties,
            representation
        };
    }
});