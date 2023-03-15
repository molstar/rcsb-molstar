/**
 * Copyright (c) 2023 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Sebastian Bittrich <sebastian.bittrich@rcsb.org>
 */

import { Vec3 } from 'molstar/lib/mol-math/linear-algebra/3d/vec3';
import { Structure } from 'molstar/lib/mol-model/structure/structure/structure';
import { PluginStateObject } from 'molstar/lib/mol-plugin-state/objects';
import { determineBackboneAtom, MAX_EXCHANGES, MAX_MOTIF_SIZE } from './validation';
import { StructureElement, StructureProperties, to_mmCIF } from 'molstar/lib/mol-model/structure/structure';
import { StructureSelectionHistoryEntry } from 'molstar/lib/mol-plugin-state/manager/structure/selection';
import { Residue } from '../strucmotif';
import { PluginContext } from 'molstar/lib/mol-plugin/context';

export type ExchangeState = number;
export type ResidueSelection = { label_asym_id: string, struct_oper_id: string, label_seq_id: number }
export type Exchange = { residue_id: ResidueSelection, allowed: string[] }
const STATIC_URL_REGEX = /^https?:\/\/(models|files).rcsb.org\//;
const FILE_STORAGE_URL = 'https://user-upload.rcsb.org/v1/';
const FILE_STORAGE_PUT_URL = FILE_STORAGE_URL + 'putMultipart';
const FILE_STORAGE_GET_URL = FILE_STORAGE_URL + 'download/';
const location = StructureElement.Location.create(void 0);

export function createCtx(plugin: PluginContext, structure: Structure, residueMap: Map<StructureSelectionHistoryEntry, Residue>) {
    return {
        plugin,
        structure,
        entryId: structure.model.entryId,

        pdbId: new Set<string>(),
        sg: new Set<number>(),
        hkl: new Set<string>(),
        ncs: new Set<number>(),

        residueIds: new Array<ResidueSelection>(),
        residueMap,
        exchanges: new Array<Exchange>(),
        coordinates: new Array<{ coords: Vec3, residueId: ResidueSelection }>(),

        dataSource: void 0,
        format: void 0,
        url: void 0
    };
}
export type StrucmotifCtx = ReturnType<typeof createCtx>;

export function detectDataSource(ctx: StrucmotifCtx) {
    const { plugin, structure } = ctx;
    const parent = plugin.helpers.substructureParent.get(structure)!;
    const dataCell = plugin.state.data.selectQ(q => q.byValue(parent).rootOfType([PluginStateObject.Data.Binary, PluginStateObject.Data.Blob, PluginStateObject.Data.String]))[0];
    const url = dataCell.params?.values.url?.url || dataCell.params?.values.url; // nested is the Import UI component, flat is via method call
    const format = PluginStateObject.Data.Binary.is(dataCell.obj) ? 'bcif' :
        !!plugin.state.data.selectQ(q => q.byValue(parent).rootOfType(PluginStateObject.Format.Cif))[0] ? 'cif' : 'pdb';

    if (!url) {
        Object.assign(ctx, { dataSource: 'file', url, format });
    } else {
        Object.assign(ctx, { dataSource: STATIC_URL_REGEX.test(url) ? 'identifier' : 'url', url, format });
    }
}

export function extractResidues(ctx: StrucmotifCtx, loci: StructureSelectionHistoryEntry[]) {
    const { x, y, z } = StructureProperties.atom;
    for (let i = 0; i < Math.min(MAX_MOTIF_SIZE, loci.length); i++) {
        const l = loci[i];
        const { structure, elements } = l.loci;

        // only first element and only first index will be considered (ignoring multiple residues)
        if (!determineBackboneAtom(structure, location, elements[0])) {
            alert(`No CA or C4' atom for selected residue`);
            return;
        }

        ctx.pdbId.add(structure.model.entryId);
        ctx.sg.add(StructureProperties.unit.spgrOp(location));
        ctx.hkl.add(StructureProperties.unit.hkl(location).join('-'));
        ctx.ncs.add(StructureProperties.unit.struct_ncs_oper_id(location));

        const struct_oper_list_ids = StructureProperties.unit.pdbx_struct_oper_list_ids(location);
        const struct_oper_id = join(struct_oper_list_ids);

        // handle pure residue-info
        const residueId = {
            label_asym_id: StructureProperties.chain.label_asym_id(location),
            // can be empty array if model is selected
            struct_oper_id,
            label_seq_id: StructureProperties.residue.label_seq_id(location)
        };
        ctx.residueIds.push(residueId);

        // retrieve CA/C4', used to compute residue distance
        const coords = [x(location), y(location), z(location)] as Vec3;
        ctx.coordinates.push({ coords, residueId });

        // handle potential exchanges - can be empty if deselected by users
        const residueMapEntry = ctx.residueMap.get(l)!;
        if (residueMapEntry.exchanges?.size > 0) {
            if (residueMapEntry.exchanges.size > MAX_EXCHANGES) {
                alert(`Maximum number of exchanges per position is ${MAX_EXCHANGES} - Please remove some exchanges from residue ${residueId.label_seq_id} | ${residueId.label_asym_id} | ${residueId.struct_oper_id}.`);
                return;
            }
            ctx.exchanges.push({ residue_id: residueId, allowed: Array.from(residueMapEntry.exchanges.values()) });
        }
    }
}

function join(opers: any[]) {
    // this makes the assumptions that '1' is the identity operator
    if (!opers || !opers.length) return '1';
    if (opers.length > 1) {
        // Mol* operators are right-to-left
        return opers[1] + 'x' + opers[0];
    }
    return opers[0];
}

export async function uploadStructure(ctx: StrucmotifCtx) {
    const { entryId, plugin, structure } = ctx;
    const name = entryId.replace(/\W/g, '') || 'unknown';
    plugin.log.info(`Uploading BinaryCIF Representation of ${name} to RCSB Cloud`);

    const formData = new FormData();
    formData.append('format', 'bcif');
    formData.append('name', name);
    const file = new File([to_mmCIF(name, structure, true, { copyAllCategories: true })], name + '.bcif');
    formData.append('file', file);

    try {
        const res = await fetch(FILE_STORAGE_PUT_URL, { method: 'POST', body: formData });
        if (!res.ok || res.status !== 200) {
            plugin.log.warn('File Upload Failed!');
            return void 0;
        }

        const { key } = await res.json();
        const url = FILE_STORAGE_GET_URL + key;
        plugin.log.info(`Uploaded File is at: ${url}`);
        return url;
    } catch (e) {
        plugin.log.warn('File Upload Failed!');
        return void 0;
    }
}