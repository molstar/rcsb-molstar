/**
 * Copyright (c) 2020 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Joan Segura <joan.segura@rcsb.org>
 */

import { StructureRef } from 'molstar/lib/mol-plugin-state/manager/structure/hierarchy-state';
import { Structure } from 'molstar/lib/mol-model/structure/structure';
import { PluginContext } from 'molstar/lib/mol-plugin/context';
import { MolScriptBuilder as MS } from 'molstar/lib/mol-script/language/builder';
import { StructureRepresentationRegistry } from 'molstar/lib/mol-repr/structure/registry';
import { StructureSelectionQuery } from 'molstar/lib/mol-plugin-state/helpers/structure-selection-query';
import {
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
    (Array.isArray(targets) ? targets : [targets]).forEach((target, n)=>{
        const structure = (target.modelId) ?
            getStructureWithModelId(plugin.managers.structure.hierarchy.current.structures, target.modelId) :
            plugin.managers.structure.hierarchy.current.structures[0]?.cell.obj?.data;
        if (!structure) return;

        const loci = targetToLoci(target, structure);
        if (!loci) return;

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

    const data = (target.modelId) ?
        getStructureWithModelId(plugin.managers.structure.hierarchy.current.structures, target.modelId) :
        plugin.managers.structure.hierarchy.current.structures[0]?.cell.obj?.data;
    if (!data) return;

    const loci = targetToLoci(target, data);
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
        return toRange(target.labelSeqRange.beg, target.labelSeqRange.end);
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

export function getAsymIdsFromModel(model: Model | undefined) {
    if (!model) return [];
    const asymIds: [string, string][] = [];
    if (model) {
        model.properties.structAsymMap.forEach(v => {
            asymIds.push([v.id, v.auth_id]);
        });
    }
    return asymIds;
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