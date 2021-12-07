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

export function setFocusFromRange(plugin: PluginContext, target: SelectRange) {
    const data = getStructureWithModelId(plugin.managers.structure.hierarchy.current.structures, target);
    if (!data) return;

    const loci = targetToLoci(target, data);
    if (!loci) return;

    plugin.managers.structure.focus.setFromLoci(loci);
}

function getStructureWithModelId(structures: StructureRef[], target: { modelId: string }): Structure | undefined {
    const structureRef = getStructureRefWithModelId(structures, target);
    if (structureRef) return structureRef.cell?.obj?.data;
}

export function getStructureRefWithModelId(structures: StructureRef[], target: { modelId: string }): StructureRef | undefined {
    for (const structure of structures) {
        if (!structure.cell?.obj?.data?.units) continue;

        const unit = structure.cell.obj.data.units[0];
        if (unit.model.id === target.modelId) return structure;
    }
}

export function select(plugin: PluginContext, targets: SelectTarget | SelectTarget[], mode: 'select' | 'hover', modifier: 'add' | 'set') {
    if (modifier === 'set')
        clearSelection(plugin, mode);
    (Array.isArray(targets) ? targets : [targets]).forEach((target, n)=>{
        const structure = getStructureWithModelId(plugin.managers.structure.hierarchy.current.structures, target);
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

export function clearSelection(plugin: PluginContext, mode: 'select' | 'hover', target?: { modelId: string; } & Target) {
    if (mode === 'hover') {
        plugin.managers.interactivity.lociHighlights.clearHighlights();
        return;
    }

    if (!target) {
        plugin.managers.interactivity.lociSelects.deselectAll();
        return;
    }

    const data = getStructureWithModelId(plugin.managers.structure.hierarchy.current.structures, target);
    if (!data) return;

    const loci = targetToLoci(target, data);
    plugin.managers.interactivity.lociSelects.deselect({ loci });
}

export async function createComponent(plugin: PluginContext, componentLabel: string, targets: SelectBase | SelectTarget | SelectTarget[], representationType: StructureRepresentationRegistry.BuiltIn) {
    for (const target of (Array.isArray(targets) ? targets : [targets])) {
        const structureRef = getStructureRefWithModelId(plugin.managers.structure.hierarchy.current.structures, target);
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
