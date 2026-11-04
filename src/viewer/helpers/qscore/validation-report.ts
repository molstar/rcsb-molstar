/**
 * Copyright (c) 2026 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Sebastian Bittrich <sebastian.bittrich@rcsb.org>
 */

import { Model, ResidueIndex } from 'molstar/lib/mol-model/structure/model';
import { CustomProperty } from 'molstar/lib/mol-model-props/common/custom-property';
import { ValidationReport } from 'molstar/lib/extensions/rcsb/validation-report/prop';
import { Asset } from 'molstar/lib/mol-util/assets';

/** Obtains per-residue Q-scores from the wwPDB validation report (XML), covers polymers, ligands, and oligosaccharides */
export namespace QScoreValidationReport {
    export const DefaultBaseUrl = ValidationReport.DefaultBaseUrl;

    export async function obtain(ctx: CustomProperty.Context, model: Model, baseUrl: string) {
        // same URL as Mol*'s validation report, so an already downloaded report is reused
        const url = Asset.getUrlAsset(ctx.assetManager, ValidationReport.getEntryUrl(model.entryId, baseUrl));
        const xml = await ctx.assetManager.resolve(url, 'xml').runInContext(ctx.runtime);
        return { map: fromXml(xml.data, model), assets: [xml] };
    }

    export function fromXml(xml: XMLDocument, model: Model): Map<ResidueIndex, number> {
        const ret = new Map<ResidueIndex, number>();
        const { index } = model.atomicHierarchy;

        const groups = xml.getElementsByTagName('ModelledSubgroup');
        for (let i = 0, il = groups.length; i < il; ++i) {
            const ga = groups[i].attributes;
            const qScore = ga.getNamedItem('Q_score');
            if (!qScore) continue;
            if (parseInt(getItem(ga, 'model')) !== model.modelNum) continue;

            const value = parseFloat(qScore.value);
            if (isNaN(value)) continue;

            const rI = index.findResidueAuth({
                auth_asym_id: getItem(ga, 'chain'),
                auth_comp_id: getItem(ga, 'resname'),
                auth_seq_id: parseInt(getItem(ga, 'resnum')),
                pdbx_PDB_ins_code: getItem(ga, 'icode').trim() || undefined
            });
            if (rI !== -1) ret.set(rI, value);
        }

        return ret;
    }
}

function getItem(a: NamedNodeMap, name: string) {
    return a.getNamedItem(name)!.value;
}
