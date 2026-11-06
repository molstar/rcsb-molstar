/**
 * Copyright (c) 2026 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Yana Rose <yana.rose@rcsb.org>
 */

import {
    PresetStructureRepresentations,
    StructureRepresentationPresetProvider
} from 'molstar/lib/mol-plugin-state/builder/structure/representation-preset';
import { StateObjectCell, StateObjectRef } from 'molstar/lib/mol-state';
import { PluginContext } from 'molstar/lib/mol-plugin/context';
import { PluginStateObject } from 'molstar/lib/mol-plugin-state/objects';
import { PolyhedronParams } from 'molstar/lib/mol-repr/structure/representation/polyhedron';
import { MolScriptBuilder as MS } from 'molstar/lib/mol-script/language/builder';
import { ElementNames, isMetal } from 'molstar/lib/mol-model/structure/model/properties/atomic/types';
import { ElementSymbol } from 'molstar/lib/mol-model/structure/model/types';
import { ObjectKeys } from 'molstar/lib/mol-util/type-helpers';
import { ParamDefinition as PD } from 'molstar/lib/mol-util/param-definition';
import { Expression } from 'molstar/lib/mol-script/language/expression';
import { Target } from '../selection';
import { Structure, StructureElement } from 'molstar/lib/mol-model/structure';
import { OrderedSet, SortedArray } from 'molstar/lib/mol-data/int';
import { ColorNames } from 'molstar/lib/mol-util/color/names';
import { CoordinationIndex } from 'molstar/lib/mol-model/structure/structure/coordination/data';

const MetalSymbols = ObjectKeys(ElementNames).filter(e => isMetal(e as ElementSymbol));

/**
 * Metal atoms of non-polymer entities, i.e. ligands (SF4, FES, HEM, ...) and ions (ZN, MG, ...).
 * If `chain.labelAsymId` is set, only metals with exactly that label_asym_id are included (auth_asym_id is
 * deliberately not used: it is shared by all ligands bound to an author chain). `operatorName` additionally
 * restricts to a single symmetry copy.
 */
function ligandMetalsExpression(chain?: Target): Expression {
    const chainTests: Expression[] = [];
    if (chain?.labelAsymId) {
        chainTests.push(MS.core.rel.eq([MS.ammp('label_asym_id'), chain.labelAsymId]));
        if (chain.operatorName) chainTests.push(MS.core.rel.eq([MS.acp('operatorName'), chain.operatorName]));
    }

    return MS.struct.generator.atomGroups({
        'entity-test': MS.core.rel.eq([MS.ammp('entityType'), 'non-polymer']),
        ...(chainTests.length > 0 ? { 'chain-test': chainTests.length === 1 ? chainTests[0] : MS.core.logic.and(chainTests) } : {}),
        'atom-test': MS.core.set.has([MS.set(...MetalSymbols), MS.acp('elementSymbol')]),
    });
}

type UnitIndexMap = Map<number, Set<StructureElement.UnitIndex>>

function addToMap(map: UnitIndexMap, unitId: number, index: StructureElement.UnitIndex) {
    if (!map.has(unitId)) map.set(unitId, new Set());
    map.get(unitId)!.add(index);
}

function toLoci(structure: Structure, map: UnitIndexMap): StructureElement.Loci {
    const elements: StructureElement.Loci['elements'][0][] = [];
    map.forEach((indices, unitId) => {
        elements.push({ unit: structure.unitMap.get(unitId), indices: OrderedSet.ofSortedArray(SortedArray.ofUnsortedArray(Array.from(indices))) });
    });
    return StructureElement.Loci(structure, elements);
}

/** Metal atoms in `metals` (a substructure of `structure`) and their coordinating atoms, i.e. the polyhedron vertices. */
function getCoordinationLoci(structure: Structure, metals: Structure, minCoordination: number, maxCoordination: number) {
    const atoms: UnitIndexMap = new Map();
    const { sites, eachLigand } = structure.coordination;

    for (let i = 0; i < sites.count; i++) {
        if (sites.numbers[i] < minCoordination || sites.numbers[i] > maxCoordination) continue;
        const unit = structure.unitMap.get(sites.unitIds[i]);
        const element = unit.elements[sites.indices[i]];
        const metalUnit = metals.unitMap.get(unit.id);
        if (!metalUnit || !SortedArray.has(metalUnit.elements, element)) continue;

        addToMap(atoms, unit.id, sites.indices[i]);
        eachLigand(i as CoordinationIndex, l => {
            addToMap(atoms, l.unit.id, SortedArray.indexOf(l.unit.elements, l.element) as StructureElement.UnitIndex);
        });
    }
    return toLoci(structure, atoms);
}

const LabelTypeParams = { fontQuality: 4, borderWidth: 0.1, borderColor: ColorNames.lightgray, attachment: 'bottom-left' as const };

/**
 * Same as 'Polymer & Ligand', plus Mol*'s 'polyhedron' representation for the coordination sites of
 * ligand/ion metal atoms. `includeParent` makes the coordination sites to be computed on the whole
 * structure, so protein atoms coordinating the metal (e.g. Cys SG for SF4) are polyhedron vertices.
 */
export const CoordinationPolyhedronPreset = StructureRepresentationPresetProvider({
    id: 'preset-structure-representation-rcsb-coordination-polyhedron',
    display: {
        name: 'Ligand Coordination Polyhedra', group: 'Miscellaneous',
        description: 'Shows polymers as Cartoon, ligands as Ball & Stick and coordination polyhedra around metal atoms of ligands and ions.'
    },
    params: () => ({
        ...StructureRepresentationPresetProvider.CommonParams,
        /** Only create polyhedra for metal atoms in this chain; all ligand/ion metals if not set. */
        chain: PD.Value<Target | undefined>(undefined, { isHidden: true }),
        /** Label metal atoms and their coordinating atoms. */
        showLabels: PD.Boolean(true),
    }),
    async apply(ref, params, plugin) {
        const structureCell = StateObjectRef.resolveAndCheck(plugin.state.data, ref);
        if (!structureCell?.obj) return {};

        const base = await PresetStructureRepresentations['polymer-and-ligand'].apply(ref, params, plugin);

        const metals = await plugin.builders.structure.tryCreateComponentFromExpression(structureCell, ligandMetalsExpression(params.chain), 'ligand-metals', { label: 'Metal Coordination' });
        const { update, builder, typeParams } = StructureRepresentationPresetProvider.reprBuilder(plugin, params, structureCell.obj.data);
        const polyhedron = builder.buildRepresentation(update, metals, {
            type: 'polyhedron',
            typeParams: { ...typeParams, includeParent: true },
            color: 'element-symbol'
        }, { tag: 'ligand-metals-polyhedron' });
        await update.commit({ revertOnError: false });

        const labels = params.showLabels && metals?.data
            ? await addCoordinationLabels(plugin, structureCell, metals.data, params)
            : { components: {}, representations: {} };

        return {
            components: { ...base.components, metals, ...labels.components },
            representations: { ...base.representations, polyhedron, ...labels.representations }
        };
    }
});

async function addCoordinationLabels(plugin: PluginContext, structureCell: StateObjectCell<PluginStateObject.Molecule.Structure>, metals: Structure, params: StructureRepresentationPresetProvider.CommonParams) {
    const structure = structureCell.obj!.data;
    // keep in sync with the 'polyhedron' representation defaults, so that labels match the drawn polyhedra
    const { minCoordination, maxCoordination } = PolyhedronParams;
    const atoms = getCoordinationLoci(structure, metals, minCoordination.defaultValue, maxCoordination.defaultValue);

    if (StructureElement.Loci.isEmpty(atoms)) return { components: {}, representations: {} };
    const expression = StructureElement.Bundle.toExpression(StructureElement.Bundle.fromLoci(atoms));
    const coordinationAtoms = await plugin.builders.structure.tryCreateComponentFromExpression(structureCell, expression, 'ligand-metals-coordination-atoms', { label: 'Coordination Atoms' });

    const { update, builder } = StructureRepresentationPresetProvider.reprBuilder(plugin, params, structure);
    const atomLabels = builder.buildRepresentation(update, coordinationAtoms, {
        type: 'label', color: 'uniform', colorParams: { value: ColorNames.black }, typeParams: { ...LabelTypeParams, level: 'element' }
    }, { tag: 'ligand-metals-atom-labels' });
    await update.commit({ revertOnError: false });

    return {
        components: { coordinationAtoms },
        representations: { atomLabels }
    };
}
