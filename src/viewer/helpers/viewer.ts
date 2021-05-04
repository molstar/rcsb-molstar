/**
 * Copyright (c) 2020 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Joan Segura <joan.segura@rcsb.org>
 */

import {StructureRef} from 'molstar/lib/mol-plugin-state/manager/structure/hierarchy-state';
import {Structure} from 'molstar/lib/mol-model/structure/structure';
import {PluginContext} from 'molstar/lib/mol-plugin/context';
import {Loci} from 'molstar/lib/mol-model/loci';
import {StructureSelection} from 'molstar/lib/mol-model/structure/query';
import {Script} from 'molstar/lib/mol-script/script';
import {MolScriptBuilder} from 'molstar/lib/mol-script/language/builder';
import {SetUtils} from 'molstar/lib/mol-util/set';
import {StructureRepresentationRegistry} from 'molstar/lib/mol-repr/structure/registry';
import {StructureSelectionQuery} from 'molstar/lib/mol-plugin-state/helpers/structure-selection-query';

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

    export function clearSelection(plugin: PluginContext, mode: 'select'|'hover', options?: {modelId: string; labelAsymId: string;}): void {
        if(mode == null || mode === 'select') {
            if(options == null){
                plugin.managers.interactivity.lociSelects.deselectAll();
            }else{
                const data: Structure | undefined = ViewerMethods.getStructureWithModelId(plugin.managers.structure.hierarchy.current.structures, options.modelId);
                if (data == null) return;
                const sel: StructureSelection = Script.getStructureSelection(Q => Q.struct.generator.atomGroups({
                    'chain-test': Q.core.rel.eq([options.labelAsymId, MolScriptBuilder.ammp('label_asym_id')])
                }), data);
                const loci: Loci = StructureSelection.toLociWithSourceUnits(sel);
                plugin.managers.interactivity.lociSelects.deselect({loci});
            }
        }else if(mode === 'hover') {
            plugin.managers.interactivity.lociHighlights.clearHighlights();
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

    export function getStructureRefWithModelId(structures: StructureRef[], modelId: string): StructureRef|undefined{
        for(const structure of structures){
            if(!structure.cell?.obj?.data?.units)
                continue;
            const unit =  structure.cell.obj.data.units[0];
            const id: string = unit.model.id;
            if(id === modelId)
                return structure;
        }
    }

    export function getStructureWithModelId(structures: StructureRef[], modelId: string): Structure|undefined{
        const structureRef: StructureRef | undefined = getStructureRefWithModelId(structures, modelId);
        if(structureRef != null)
            return structureRef.cell?.obj?.data;
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

    export function removeComponent(plugin: PluginContext, componentLabel: string): void{
        plugin.managers.structure.hierarchy.currentComponentGroups.forEach(c=>{
            for(const comp of c){
                if(comp.cell.obj?.label === componentLabel) {
                    plugin.managers.structure.hierarchy.remove(c);
                    break;
                }
            }
        });
    }
}

