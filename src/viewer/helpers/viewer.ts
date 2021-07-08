/**
 * Copyright (c) 2020 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Joan Segura <joan.segura@rcsb.org>
 */

import { StructureRef } from 'molstar/lib/mol-plugin-state/manager/structure/hierarchy-state';
import { Structure } from 'molstar/lib/mol-model/structure/structure';
import { PluginContext } from 'molstar/lib/mol-plugin/context';
import { Loci } from 'molstar/lib/mol-model/loci';
import { MolScriptBuilder as MS } from 'molstar/lib/mol-script/language/builder';
import { StructureRepresentationRegistry } from 'molstar/lib/mol-repr/structure/registry';
import { StructureSelectionQuery } from 'molstar/lib/mol-plugin-state/helpers/structure-selection-query';
import {
    rangeToTest,
    SelectRange,
    SelectTarget,
    Target,
    targetToLoci, toRange
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

        const unit =  structure.cell.obj.data.units[0];
        if (unit.model.id === target.modelId) return structure;
    }
}

export function select(plugin: PluginContext, targets: SelectTarget | SelectTarget[], mode: 'select' | 'hover', modifier: 'add' | 'set') {
    // TODO impl
}

export function clearSelection(plugin: PluginContext, mode: 'select' | 'hover', target?: { modelId: string; } & Target) {
    if (mode == null || mode === 'select') {
        if (!target) {
            plugin.managers.interactivity.lociSelects.deselectAll();
        } else {
            const data = getStructureWithModelId(plugin.managers.structure.hierarchy.current.structures, target);
            if (!data) return;

            const loci = targetToLoci(target, data);
            plugin.managers.interactivity.lociSelects.deselect({ loci });
        }
    } else if (mode === 'hover') {
        plugin.managers.interactivity.lociHighlights.clearHighlights();
    }
}

export async function createComponent(plugin: PluginContext, componentLabel: string, targets: SelectTarget | SelectTarget[], representationType: StructureRepresentationRegistry.BuiltIn) {
    for (const target of (Array.isArray(targets) ? targets : [targets])) {
        // TODO are there performance implications when a large collection of residues is selected? - could move modelId out of 'target'
        const structureRef = getStructureRefWithModelId(plugin.managers.structure.hierarchy.current.structures, target);
        if (!structureRef) throw 'createComponent error: model not found';

        const range = 'label_seq_range' in target ?
            toRange(target.label_seq_range.beg, target.label_seq_range.end) :
            target.label_seq_id ? [target.label_seq_id] : [];
        const sel = StructureSelectionQuery('innerQuery_' + Math.random().toString(36).substr(2),
            MS.struct.generator.atomGroups(rangeToTest(target.label_asym_id, range)));
        await plugin.managers.structure.component.add({
            selection: sel,
            options: { checkExisting: false, label: componentLabel },
            representation: representationType,
        }, [structureRef]);
    }
}

export function removeComponent(plugin: PluginContext, componentLabel: string) {
    plugin.managers.structure.hierarchy.currentComponentGroups.forEach(c => {
        for (const comp of c) {
            if (comp.cell.obj?.label === componentLabel) {
                plugin.managers.structure.hierarchy.remove(c);
                break;
            }
        }
    });
}

export namespace ViewerMethods {
    export function selectMultipleSegments(plugin: PluginContext, selection: Array<{modelId: string; asymId: string; begin: number; end: number;}>, mode: 'select'|'hover', modifier: 'add'|'set' ): void {
        if(modifier === 'set'){
            selection.forEach(sel=>{
                clearSelection(plugin, mode, {modelId: sel.modelId, labelAsymId: sel.asymId});
            });
        }
        selection.forEach(sel=>{
            selectSegment(plugin, sel.modelId, sel.asymId, sel.begin, sel.end, mode, 'add');
        });
    }

    export function selectSegment(plugin: PluginContext, modelId: string, asymId: string, begin: number, end: number, mode: 'select'|'hover', modifier: 'add'|'set'): void {
        const loci: Loci | undefined = getLociFromRange(plugin, modelId, asymId, begin, end);
        if(loci == null)
            return;
        if(mode == null || mode === 'select') {
            plugin.managers.structure.selection.fromLoci(modifier, loci);
        }else if(mode === 'hover') {
            plugin.managers.interactivity.lociHighlights.highlight({loci});
        }
    }
}

