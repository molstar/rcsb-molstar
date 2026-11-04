/**
 * Copyright (c) 2026 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Sebastian Bittrich <sebastian.bittrich@rcsb.org>
 */

import { GraphQLClient } from 'molstar/lib/mol-util/graphql-client';
import { ChainIndex, Model, ResidueIndex } from 'molstar/lib/mol-model/structure/model';
import { CustomProperty } from 'molstar/lib/mol-model-props/common/custom-property';
import { qscore_gql } from './qscore.gql';

/**
 * Obtains per-residue Q-scores from the RCSB Data API, covers polymers and ligands.
 */
export namespace QScoreDataApi {
    export const DefaultServerUrl = 'https://data.rcsb.org/graphql';

    export async function obtain(ctx: CustomProperty.Context, model: Model, serverUrl: string) {
        const client = new GraphQLClient(serverUrl, ctx.assetManager);
        const result = await client.request(ctx.runtime, qscore_gql, { entry_id: model.entryId });
        const entry = result.data.entry as Entry | null;
        return { map: entry ? createResidueMap(model, entry) : new Map<ResidueIndex, number>() };
    }

    function createResidueMap(model: Model, entry: Entry): Map<ResidueIndex, number> {
        const ret = new Map<ResidueIndex, number>();
        const { chains, residues, chainAtomSegments, residueAtomSegments } = model.atomicHierarchy;

        const chainsByAsymId = new Map<string, ChainIndex[]>();
        for (let cI = 0 as ChainIndex, cl = chains._rowCount; cI < cl; ++cI) {
            const asymId = chains.label_asym_id.value(cI);
            if (!chainsByAsymId.has(asymId)) chainsByAsymId.set(asymId, []);
            chainsByAsymId.get(asymId)!.push(cI);
        }

        const forEachResidue = (asymId: string, f: (rI: ResidueIndex) => void) => {
            const cIs = chainsByAsymId.get(asymId);
            if (!cIs) return;
            for (const cI of cIs) {
                const rStart = residueAtomSegments.index[chainAtomSegments.offsets[cI]];
                const rEnd = residueAtomSegments.index[chainAtomSegments.offsets[cI + 1] - 1];
                for (let rI = rStart; rI <= rEnd; ++rI) f(rI);
            }
        };

        for (const entity of entry.polymer_entities ?? []) {
            for (const instance of entity?.polymer_entity_instances ?? []) {
                const asymId = instance?.rcsb_polymer_entity_instance_container_identifiers?.asym_id;
                if (!asymId) continue;

                // label_seq_id -> Q-score
                const scores = new Map<number, number>();
                for (const feature of instance.rcsb_polymer_instance_feature ?? []) {
                    if (feature?.type !== 'Q_SCORE') continue;
                    for (const position of feature.feature_positions ?? []) {
                        const { beg_seq_id, values } = position ?? {};
                        if (typeof beg_seq_id !== 'number' || !values) continue;
                        for (let i = 0, il = values.length; i < il; ++i) {
                            const v = values[i];
                            if (typeof v === 'number') scores.set(beg_seq_id + i, v);
                        }
                    }
                }
                if (scores.size === 0) continue;

                forEachResidue(asymId, rI => {
                    const v = scores.get(residues.label_seq_id.value(rI));
                    if (v !== undefined) ret.set(rI, v);
                });
            }
        }

        for (const entity of entry.nonpolymer_entities ?? []) {
            for (const instance of entity?.nonpolymer_entity_instances ?? []) {
                const asymId = instance?.rcsb_nonpolymer_entity_instance_container_identifiers?.asym_id;
                const v = instance?.rcsb_nonpolymer_instance_validation_score?.find(s => typeof s?.Q_score === 'number')?.Q_score;
                if (!asymId || typeof v !== 'number') continue;

                forEachResidue(asymId, rI => ret.set(rI, v));
            }
        }

        return ret;
    }
}

type Entry = {
    polymer_entities?: ({
        polymer_entity_instances?: ({
            rcsb_polymer_entity_instance_container_identifiers?: { asym_id?: string } | null,
            rcsb_polymer_instance_feature?: ({
                type?: string | null,
                feature_positions?: ({ beg_seq_id?: number | null, values?: (number | null)[] | null } | null)[] | null
            } | null)[] | null
        } | null)[] | null
    } | null)[] | null,
    nonpolymer_entities?: ({
        nonpolymer_entity_instances?: ({
            rcsb_nonpolymer_entity_instance_container_identifiers?: { asym_id?: string } | null,
            rcsb_nonpolymer_instance_validation_score?: ({ Q_score?: number | null } | null)[] | null
        } | null)[] | null
    } | null)[] | null
}
