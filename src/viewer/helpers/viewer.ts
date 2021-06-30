/**
 * Copyright (c) 2020 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Joan Segura <joan.segura@rcsb.org>
 */

import { StructureRef } from 'molstar/lib/mol-plugin-state/manager/structure/hierarchy-state';
import { Structure } from 'molstar/lib/mol-model/structure/structure';
import { PluginContext } from 'molstar/lib/mol-plugin/context';
import { Loci } from 'molstar/lib/mol-model/loci';
import { StructureSelection } from 'molstar/lib/mol-model/structure/query';
import { Script } from 'molstar/lib/mol-script/script';
import { MolScriptBuilder as MS, MolScriptBuilder } from 'molstar/lib/mol-script/language/builder';
import { SetUtils } from 'molstar/lib/mol-util/set';
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

    return targetToLoci(target, data);
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
        const structureRef = getStructureRefWithModelId(plugin.managers.structure.hierarchy.current.structures, target);
        if (!structureRef) throw 'createComponent error: model not found';

        const test = 'label_seq_range' in target ?
            rangeToTest(target.label_asym_id, toRange(target.label_seq_range.beg, target.label_seq_range.end)) :
            void 0; // TODO
        const sel = StructureSelectionQuery('innerQuery_' + Math.random().toString(36).substr(2),
            MS.struct.generator.atomGroups(test));
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

    export async function createComponentFromChain(plugin: PluginContext, componentLabel: string, structureRef: StructureRef, asymId: string, representationType: StructureRepresentationRegistry.BuiltIn): Promise<void>{
        const selection: StructureSelectionQuery = StructureSelectionQuery(
            'innerQuery_' + Math.random().toString(36).substr(2),
            MolScriptBuilder.struct.generator.atomGroups({
                'chain-test': MolScriptBuilder.core.rel.eq([asymId, MolScriptBuilder.ammp('label_asym_id')])
            }));
        await plugin.managers.structure.component.add({
            selection: selection,
            options: {checkExisting: false, label: componentLabel},
            representation: representationType,
        }, [structureRef]);

    }

    export async function createComponentFromSet(plugin: PluginContext, componentLabel: string, structureRef: StructureRef, residues: Array<{asymId: string, position: number}>, representationType: StructureRepresentationRegistry.BuiltIn): Promise<void>{
        await plugin.managers.structure.component.add({
            selection: StructureSelectionQuery(
                'innerQuery_' + Math.random().toString(36).substr(2),
                MolScriptBuilder.struct.combinator.merge(
                    residues.map(r=>MolScriptBuilder.struct.generator.atomGroups({
                        'chain-test': MolScriptBuilder.core.rel.eq([r.asymId, MolScriptBuilder.ammp('label_asym_id')]),
                        'residue-test': MolScriptBuilder.core.rel.eq([r.position, MolScriptBuilder.ammp('label_seq_id')])
                    }))
                )
            ),
            options: { checkExisting: false, label: componentLabel },
            representation: representationType,
        }, [structureRef]);
    }

    export async function createComponentFromRange(plugin: PluginContext, componentLabel: string, structureRef: StructureRef, asymId: string, begin: number, end: number, representationType: StructureRepresentationRegistry.BuiltIn): Promise<void>{
        const seq_id: Array<number> = new Array<number>();
        for(let n = begin; n <= end; n++){
            seq_id.push(n);
        }
        await plugin.managers.structure.component.add({
            selection: StructureSelectionQuery(
                'innerQuery_' + Math.random().toString(36).substr(2),
                MolScriptBuilder.struct.generator.atomGroups({
                    'chain-test': MolScriptBuilder.core.rel.eq([asymId, MolScriptBuilder.ammp('label_asym_id')]),
                    'residue-test': MolScriptBuilder.core.set.has([MolScriptBuilder.set(...SetUtils.toArray(new Set(seq_id))), MolScriptBuilder.ammp('label_seq_id')])
                })
            ),
            options: { checkExisting: false, label: componentLabel },
            representation: representationType,
        }, [structureRef]);
    }

    export async function createComponentFromMultipleRange(plugin: PluginContext, componentLabel: string, structureRef: StructureRef, residues: Array<{asymId: string; begin: number; end: number;}>, representationType: StructureRepresentationRegistry.BuiltIn): Promise<void>{
        const seqIdMap: Map<string, Array<number>> = new Map<string, Array<number>>();
        residues.forEach(res=>{
            if(!seqIdMap.has(res.asymId)){
                seqIdMap.set(res.asymId, new Array<number>());
            }
            for(let n = res.begin; n <= res.end; n++){
                seqIdMap.get(res.asymId)!.push(n);
            }
        });
        await plugin.managers.structure.component.add({
            selection: StructureSelectionQuery(
                'innerQuery_' + Math.random().toString(36).substr(2),
                MolScriptBuilder.struct.combinator.merge(
                    Array.from(seqIdMap).map(([asymId, seqIds])=>MolScriptBuilder.struct.generator.atomGroups({
                        'chain-test': MolScriptBuilder.core.rel.eq([asymId, MolScriptBuilder.ammp('label_asym_id')]),
                        'residue-test': MolScriptBuilder.core.set.has([MolScriptBuilder.set(...SetUtils.toArray(new Set(seqIds))), MolScriptBuilder.ammp('label_seq_id')])
                    }))
                )
            ),
            options: { checkExisting: false, label: componentLabel },
            representation: representationType,
        }, [structureRef]);
    }

    export function setFocusFromRange(plugin: PluginContext, modelId: string, asymId: string, begin: number, end: number): void{
        const loci: Loci | undefined = getLociFromRange(plugin, modelId, asymId, begin, end);
        if(loci == null)
            return;
        plugin.managers.structure.focus.setFromLoci(loci);
    }

    export function setFocusFromSet(plugin: PluginContext, modelId: string, residues: Array<{asymId: string, position: number}>): void{
        const loci: Loci | undefined = getLociFromSet(plugin, modelId, residues);
        if(loci == null)
            return;
        plugin.managers.structure.focus.setFromLoci(loci);
    }

    export function getLociFromRange(plugin: PluginContext, modelId: string, asymId: string, begin: number, end: number): Loci | undefined {
        const data: Structure | undefined = getStructureWithModelId(plugin.managers.structure.hierarchy.current.structures, modelId);
        if (data == null) return;
        const seq_id: Array<number> = new Array<number>();
        for (let n = begin; n <= end; n++) {
            seq_id.push(n);
        }
        const sel: StructureSelection = Script.getStructureSelection(Q => Q.struct.generator.atomGroups({
            'chain-test': Q.core.rel.eq([asymId, MolScriptBuilder.ammp('label_asym_id')]),
            'residue-test': Q.core.set.has([MolScriptBuilder.set(...SetUtils.toArray(new Set(seq_id))), MolScriptBuilder.ammp('label_seq_id')])
        }), data);
        return StructureSelection.toLociWithSourceUnits(sel);
    }

    export function getLociFromSet(plugin: PluginContext, modelId: string, residues: Array<{asymId: string, position: number}>): Loci | undefined {
        const data: Structure | undefined = getStructureWithModelId(plugin.managers.structure.hierarchy.current.structures, modelId);
        if (data == null) return;
        const sel: StructureSelection = Script.getStructureSelection(Q=>Q.struct.combinator.merge(
            residues.map(r=>MolScriptBuilder.struct.generator.atomGroups({
                'chain-test': MolScriptBuilder.core.rel.eq([r.asymId, MolScriptBuilder.ammp('label_asym_id')]),
                'residue-test': MolScriptBuilder.core.rel.eq([r.position, MolScriptBuilder.ammp('label_seq_id')])
            }))
        ), data);
        return StructureSelection.toLociWithSourceUnits(sel);
    }
}

