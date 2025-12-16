/**
 * Copyright (c) 2020 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Joan Segura <joan.segura@rcsb.org>
 */

import { StructureRef } from 'molstar/lib/mol-plugin-state/manager/structure/hierarchy-state';
import { Structure, StructureElement } from 'molstar/lib/mol-model/structure/structure';
import { PluginContext } from 'molstar/lib/mol-plugin/context';
import { MolScriptBuilder as MS } from 'molstar/lib/mol-script/language/builder';
import { StructureRepresentationRegistry } from 'molstar/lib/mol-repr/structure/registry';
import { StructureSelectionQuery } from 'molstar/lib/mol-plugin-state/helpers/structure-selection-query';
import {
    normalizeTarget,
    rangeToTest,
    SelectBase,
    SelectRange,
    SelectTarget,
    Target,
    targetToLoci,
    toRange
} from './selection';
import { ModelSymmetry } from 'molstar/lib/mol-model-formats/structure/property/symmetry';
import { Model } from 'molstar/lib/mol-model/structure';
import { EntitySubtype } from 'molstar/lib/mol-model/structure/model/properties/common';
import { CifCategory } from 'molstar/lib/mol-io/reader/cif';

export function setFocusFromRange(plugin: PluginContext, target: SelectRange) {
    let data: Structure | undefined;
    if (target.modelId) {
        data = getStructureWithModelId(plugin.managers.structure.hierarchy.current.structures, target.modelId);
    } else {
        data = plugin.managers.structure.hierarchy.current.structures[0]?.cell.obj?.data;
    }
    if (!data) return;

    const loci = targetToLoci(target, data);
    if (!loci) return;

    plugin.managers.structure.focus.setFromLoci(loci);
}

function getStructureWithModelId(structures: StructureRef[], modelId: string): Structure | undefined {
    const structureRef = getStructureRefWithModelId(structures, modelId);
    if (structureRef) return structureRef.cell?.obj?.data;
}

export function getStructureRefWithModelId(structures: StructureRef[], modelId: string): StructureRef | undefined {
    for (const structure of structures) {
        if (!structure.cell?.obj?.data?.units) continue;

        const unit = structure.cell.obj.data.units[0];
        if (unit.model.id === modelId) return structure;
    }
}

export function select(plugin: PluginContext, targets: SelectTarget | SelectTarget[], mode: 'select' | 'hover', modifier: 'add' | 'set') {

    if (modifier === 'set')
        clearSelection(plugin, mode);

    // Group targets by their parent structure and create a union `Loci` representing all
    // targets associated with that structure
    const lociMap = new Map<Structure, StructureElement.Loci>();
    (Array.isArray(targets) ? targets : [targets]).forEach((target, n)=>{
        const structure = (target.modelId) ?
            getStructureWithModelId(plugin.managers.structure.hierarchy.current.structures, target.modelId) :
            getDefaultStructure(plugin);
        if (!structure) return;

        // This serves as adapter between the strucmotif-/BioJava-approach to identify transformed chains and the Mol* way
        // Only convert structOperId to operatorName, if operatorName is not defined
        if (target.structOperId && !target.operatorName) {
            target = normalizeTarget(target, structure) as SelectTarget;
        }
        const loci = targetToLoci(target, structure);
        if (!loci) return;

        const structureLoci = lociMap.get(structure) ?? StructureElement.Loci(structure, []);
        const unionLoci = StructureElement.Loci.union(loci, structureLoci);
        lociMap.set(structure, unionLoci);
    });

    // Emits a single event for all targets that belong to the same structure
    lociMap.forEach(loci => {
        if (mode === 'hover') {
            plugin.managers.interactivity.lociHighlights.highlight({ loci });
        } else if (mode === 'select') {
            plugin.managers.structure.selection.fromLoci('add', loci);
        }
    });
}

export function clearSelection(plugin: PluginContext, mode: 'select' | 'hover', target?: Target) {
    if (mode === 'hover') {
        plugin.managers.interactivity.lociHighlights.clearHighlights();
        return;
    }

    if (!target) {
        plugin.managers.interactivity.lociSelects.deselectAll();
        return;
    }

    const structure = (target.modelId) ?
        getStructureWithModelId(plugin.managers.structure.hierarchy.current.structures, target.modelId) :
        plugin.managers.structure.hierarchy.current.structures[0]?.cell.obj?.data;
    if (!structure) return;

    // This serves as adapter between the strucmotif-/BioJava-approach to identify transformed chains and the Mol* way
    // Only convert structOperId to operatorName, if operatorName is not defined
    if (target.structOperId && !target.operatorName) {
        target = normalizeTarget(target, structure) as SelectTarget;
    }
    const loci = targetToLoci(target, structure);
    plugin.managers.interactivity.lociSelects.deselect({ loci });
}

export async function createComponent(plugin: PluginContext, componentLabel: string, targets: SelectBase | SelectTarget | SelectTarget[], representationType: StructureRepresentationRegistry.BuiltIn) {
    for (const target of (Array.isArray(targets) ? targets : [targets])) {
        if (!target.modelId)
            throw Error('createComponent error: model id MUST be provided');
        const structureRef = getStructureRefWithModelId(plugin.managers.structure.hierarchy.current.structures, target.modelId);
        if (!structureRef) throw Error('createComponent error: model not found');

        const residues = toResidues(target);
        const sel = StructureSelectionQuery('innerQuery_' + Math.random().toString(36).substring(2),
            MS.struct.generator.atomGroups(rangeToTest(target.labelAsymId, residues, target.operatorName)));
        await plugin.managers.structure.component.add({
            selection: sel,
            options: { checkExisting: false, label: componentLabel },
            representation: representationType,
        }, [structureRef]);
    }
}

function toResidues(target: SelectBase | SelectTarget): number[] {
    if ('labelSeqRange' in target) {
        return toRange(target.labelSeqRange!.beg, target.labelSeqRange!.end);
    }

    if ('labelSeqId' in target) {
        return [target.labelSeqId];
    }

    return [];
}

export async function removeComponent(plugin: PluginContext, componentLabel: string) {
    const out: Promise<void>[] = [];
    plugin.managers.structure.hierarchy.currentComponentGroups.forEach(c => {
        for (const comp of c) {
            if (comp.cell.obj?.label === componentLabel) {
                const o = plugin.managers.structure.hierarchy.remove(c);
                if (o) out.push(o);
                break;
            }
        }
    });
    await Promise.all(out);
}

export function getAssemblyIdsFromModel(model: Model | undefined) {
    if (!model) return [];
    const symmetry = model && ModelSymmetry.Provider.get(model);
    return symmetry ? symmetry.assemblies.map(a => a.id) : [];
}

export function getAsymIdsFromModel(model: Model | undefined, types?: EntitySubtype[]) {
    if (!model) return [];
    model.properties.structAsymMap;
    return Array.from(model.properties.structAsymMap.values())
        .filter(v => {
            if (!types) return true;
            const idx = model.entities.getEntityIndex(v.entity_id);
            const subtype = model.entities.subtype.value(idx);
            if (!subtype) return true;
            return types.includes(subtype);
        })
        .map(v => [v.id, v.auth_id]);
}

export function getDefaultModel(plugin: PluginContext) {
    const refs = plugin.managers.structure.hierarchy.current.models;
    if (refs.length === 0) return;
    const ref = refs[0];
    if (!ref) return;
    return ref.cell.obj?.data;
}

export function getDefaultStructure(plugin: PluginContext) {
    const refs = plugin.managers.structure.hierarchy.current.structures;
    if (refs.length === 0) return;
    const ref = refs[0];
    if (!ref) return;
    return ref.cell.obj?.data;
}

function parseOperatorList(value: string): string[][] {
    // '(X0)(1-5)' becomes [['X0'], ['1', '2', '3', '4', '5']]
    // kudos to Glen van Ginkel.

    const oeRegex = /\(?([^()]+)\)?]*/g,
        groups: string[] = [],
        ret: string[][] = [];

    let g: any;
    while ((g = oeRegex.exec(value))) groups[groups.length] = g[1];

    groups.forEach((g) => {
        const group: string[] = [];
        g.split(',').forEach((e) => {
            const dashIndex = e.indexOf('-');
            if (dashIndex > 0) {
                const from = parseInt(e.substring(0, dashIndex)),
                    to = parseInt(e.substring(dashIndex + 1));
                for (let i = from; i <= to; i++) group[group.length] = i.toString();
            } else {
                group[group.length] = e.trim();
            }
        });
        ret[ret.length] = group;
    });

    return ret;
}

function operatorEquals(expr: string, val: string): boolean {
    const list = parseOperatorList(expr);
    const split = val.split('x');
    let matches = 0;
    for (let i = 0, il = Math.min(list.length, split.length); i < il; i++) {
        if (list[i].indexOf(split[i]) !== -1) matches++;
    }
    return matches === split.length;
}

/**
 * Returns the first assembly ID whose generated assembly definition matches
 * all provided (structOperId, labelAsymId) combinations.
 *
 * The function iterates over rows in the `pdbx_struct_assembly_gen` category
 * and checks whether, for a given assembly:
 *  - the operator expression matches the provided structOperId, and
 *  - the asym_id_list contains the provided labelAsymId
 *
 * A row is considered a match only if **all** provided combinations satisfy
 * these conditions for that row. The first matching `assembly_id` is returned.
 *
 * @param pdbx_struct_assembly_gen
 *   CIF category describing how biological assemblies are generated.
 *   Expected to contain `assembly_id`, `oper_expression`, and `asym_id_list` fields.
 *
 * @param ids
 *   A list of [structOperId, labelAsymId] pairs to match against an assembly.
 *   These typically come from selected targets and represent the required
 *   operator and chain combinations that must be present in the assembly.
 *
 * @returns
 *   The first matching assembly ID, or `undefined` if no match is found
 *   or if the `pdbx_struct_assembly_gen` category is missing.
 *
 * @remarks
 * - `structOperId` defaults to `'1'` when not explicitly provided.
 * - Matching uses `operatorEquals` for operator expressions and a substring
 *   check for `labelAsymId` membership in `asym_id_list`.
 * - If the CIF file does not contain `pdbx_struct_assembly_gen`,
 *   a warning is logged and no value is returned.
 */
export function firstMatchingAssemblyId(pdbx_struct_assembly_gen: CifCategory, ids: string[][]) {
    if (pdbx_struct_assembly_gen) {
        const assembly_id = pdbx_struct_assembly_gen.getField('assembly_id');
        const oper_expression = pdbx_struct_assembly_gen.getField('oper_expression');
        const asym_id_list = pdbx_struct_assembly_gen.getField('asym_id_list');
        for (let i = 0, il = pdbx_struct_assembly_gen.rowCount; i < il; i++) {
            if (ids.some(val => !operatorEquals(oper_expression!.str(i), val[0]) || asym_id_list!.str(i).indexOf(val[1]) === -1)) continue;
            return assembly_id!.str(i);
        }
    } else {
        console.warn(`Source file is missing 'pdbx_struct_assembly_gen' category`);
    }
}