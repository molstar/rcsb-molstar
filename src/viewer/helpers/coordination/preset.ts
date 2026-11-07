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
import { MolScriptBuilder as MS } from 'molstar/lib/mol-script/language/builder';
import { ElementNames, isMetal } from 'molstar/lib/mol-model/structure/model/properties/atomic/types';
import { ElementSymbol } from 'molstar/lib/mol-model/structure/model/types';
import { ObjectKeys } from 'molstar/lib/mol-util/type-helpers';
import { ParamDefinition as PD } from 'molstar/lib/mol-util/param-definition';
import { Expression } from 'molstar/lib/mol-script/language/expression';
import { ElementIndex, Structure, StructureElement, Unit } from 'molstar/lib/mol-model/structure';
import { OrderedSet, SortedArray } from 'molstar/lib/mol-data/int';
import { ColorNames } from 'molstar/lib/mol-util/color/names';
import { Target } from '../selection';
import { CoordinationGeometryParams, getMetalSites } from './representation';

/**
 * Metals to show the coordination geometry for:
 * - `labelAsymId`: all metal atoms with exactly that label_asym_id
 * - `labelAsymId` + `labelAtomId`: only the metal atom with that label_atom_id (e.g. 'FE1' of an SF4 cluster)
 * `operatorName` additionally restricts to a single symmetry copy.
 */
export type CoordinationTarget = Target & {
    readonly labelAtomId?: string
}

const MetalSymbols = ObjectKeys(ElementNames).filter(e => isMetal(e as ElementSymbol));

/**
 * Metal atoms in the given chain (and atom). Without a chain, metal atoms of all non-polymer entities, i.e. ligands
 * (SF4, FES, HEM, ...) and ions (ZN, MG, ...). auth_asym_id is deliberately not used: it is shared by all ligands
 * bound to an author chain.
 */
function metalsExpression(target?: CoordinationTarget): Expression {
    const chainTests: Expression[] = [];
    if (target?.labelAsymId) chainTests.push(MS.core.rel.eq([MS.ammp('label_asym_id'), target.labelAsymId]));
    if (target?.operatorName) chainTests.push(MS.core.rel.eq([MS.acp('operatorName'), target.operatorName]));

    const atomTests: Expression[] = [MS.core.set.has([MS.set(...MetalSymbols), MS.acp('elementSymbol')])];
    if (target?.labelAtomId) atomTests.push(MS.core.rel.eq([MS.ammp('label_atom_id'), target.labelAtomId]));

    const and = (tests: Expression[]) => tests.length === 1 ? tests[0] : MS.core.logic.and(tests);
    return MS.struct.generator.atomGroups({
        ...(target?.labelAsymId ? {} : { 'entity-test': MS.core.rel.eq([MS.ammp('entityType'), 'non-polymer']) }),
        ...(chainTests.length > 0 ? { 'chain-test': and(chainTests) } : {}),
        'atom-test': and(atomTests),
    });
}

type UnitIndexMap = Map<number, Set<StructureElement.UnitIndex>>

function addToMap(map: UnitIndexMap, unit: Unit, element: ElementIndex) {
    if (!map.has(unit.id)) map.set(unit.id, new Set());
    map.get(unit.id)!.add(SortedArray.indexOf(unit.elements, element) as StructureElement.UnitIndex);
}

function toLoci(structure: Structure, map: UnitIndexMap): StructureElement.Loci {
    const elements: StructureElement.Loci['elements'][0][] = [];
    map.forEach((indices, unitId) => {
        elements.push({ unit: structure.unitMap.get(unitId), indices: OrderedSet.ofSortedArray(SortedArray.ofUnsortedArray(Array.from(indices))) });
    });
    return StructureElement.Loci(structure, elements);
}

/**
 * For the metal atoms in `metals` (a substructure of `structure`), with the same params as the drawn geometry:
 * - `atoms`: metal atoms and their coordinating atoms
 * - `residues`: whole residues donating coordinating atoms, except the metal's own residue (e.g. Cys for SF4)
 */
function getCoordinationLoci(structure: Structure, metals: Structure) {
    const { minCoordination, maxCoordination } = CoordinationGeometryParams;
    const atoms: UnitIndexMap = new Map();
    const donors: UnitIndexMap = new Map();
    for (const site of getMetalSites(structure, minCoordination.defaultValue, maxCoordination.defaultValue, metals)) {
        const metal = site.unit.elements[site.index];
        addToMap(atoms, site.unit, metal);
        for (const l of site.ligands) {
            addToMap(atoms, l.unit, l.element);
            const sameResidue = l.unit.id === site.unit.id && site.unit.residueIndex[l.element] === site.unit.residueIndex[metal];
            if (!sameResidue) addToMap(donors, l.unit, l.element);
        }
    }
    return {
        atoms: toLoci(structure, atoms),
        residues: StructureElement.Loci.extendToWholeResidues(toLoci(structure, donors)) as StructureElement.Loci
    };
}

function lociToComponent(plugin: PluginContext, structureCell: StateObjectCell<PluginStateObject.Molecule.Structure>, loci: StructureElement.Loci, key: string, label: string) {
    if (StructureElement.Loci.isEmpty(loci)) return undefined;
    const expression = StructureElement.Bundle.toExpression(StructureElement.Bundle.fromLoci(loci));
    return plugin.builders.structure.tryCreateComponentFromExpression(structureCell, expression, key, { label });
}

const LabelTypeParams = { fontQuality: 4, borderWidth: 0.1, borderColor: ColorNames.lightgray, attachment: 'bottom-left' as const };

/**
 * Same as 'Polymer & Ligand', plus the 'coordination-geometry' representation for the selected metal atoms.
 * `includeParent` makes the ligands to be taken from the whole structure, so protein atoms coordinating the
 * metal (e.g. Cys SG for SF4) are vertices of the geometry.
 */
export const CoordinationGeometryPreset = StructureRepresentationPresetProvider({
    id: 'preset-structure-representation-rcsb-coordination-geometry',
    display: {
        name: 'Coordination Geometry', group: 'Miscellaneous',
        description: 'Shows polymers as Cartoon, ligands as Ball & Stick and the coordination geometry of metal atoms of ligands and ions.'
    },
    params: () => ({
        ...StructureRepresentationPresetProvider.CommonParams,
        /** Metal atoms to show the geometry for; all ligand/ion metals if not set. */
        target: PD.Value<CoordinationTarget | undefined>(undefined, { isHidden: true }),
        /** Label metal atoms and their coordinating atoms. */
        showLabels: PD.Boolean(true),
    }),
    async apply(ref, params, plugin) {
        const structureCell = StateObjectRef.resolveAndCheck(plugin.state.data, ref);
        if (!structureCell?.obj) return {};

        const base = await PresetStructureRepresentations['polymer-and-ligand'].apply(ref, params, plugin);

        const metals = await plugin.builders.structure.tryCreateComponentFromExpression(structureCell, metalsExpression(params.target), 'coordination-metals', { label: 'Coordination Geometry' });
        const { update, builder, typeParams } = StructureRepresentationPresetProvider.reprBuilder(plugin, params, structureCell.obj.data);
        const geometry = builder.buildRepresentation(update, metals, {
            type: 'coordination-geometry' as any,
            typeParams: { ...typeParams, includeParent: true },
            color: 'element-symbol'
        }, { tag: 'coordination-geometry' });
        await update.commit({ revertOnError: false });

        const coordination = metals?.data
            ? await addCoordinationComponents(plugin, structureCell, metals.data, params, params.showLabels)
            : { components: {}, representations: {} };

        return {
            components: { ...base.components, metals, ...coordination.components },
            representations: { ...base.representations, geometry, ...coordination.representations }
        };
    }
});

/** Coordinating residues as Ball & Stick and, if `showLabels`, labels of metal and coordinating atoms. */
async function addCoordinationComponents(plugin: PluginContext, structureCell: StateObjectCell<PluginStateObject.Molecule.Structure>, metals: Structure, params: StructureRepresentationPresetProvider.CommonParams, showLabels: boolean) {
    const structure = structureCell.obj!.data;
    const { atoms, residues } = getCoordinationLoci(structure, metals);

    const coordinatingResidues = await lociToComponent(plugin, structureCell, residues, 'coordinating-residues', 'Coordinating Residues');
    const coordinationAtoms = showLabels ? await lociToComponent(plugin, structureCell, atoms, 'coordination-atoms', 'Coordination Atoms') : undefined;

    const { update, builder, typeParams, color, ballAndStickColor } = StructureRepresentationPresetProvider.reprBuilder(plugin, params, structure);
    const residuesBallAndStick = builder.buildRepresentation(update, coordinatingResidues, {
        type: 'ball-and-stick', typeParams, color, colorParams: ballAndStickColor
    }, { tag: 'coordinating-residues' });
    const atomLabels = builder.buildRepresentation(update, coordinationAtoms, {
        type: 'label', color: 'uniform', colorParams: { value: ColorNames.black }, typeParams: { ...LabelTypeParams, level: 'element' }
    }, { tag: 'coordination-atom-labels' });
    await update.commit({ revertOnError: false });

    return {
        components: { coordinatingResidues, coordinationAtoms },
        representations: { residuesBallAndStick, atomLabels }
    };
}
