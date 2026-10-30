/**
 * Copyright (c) 2026 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Sebastian Bittrich <sebastian.bittrich@rcsb.org>
 */

import { ThemeDataContext } from 'molstar/lib/mol-theme/theme';
import { GraphQLClient } from 'molstar/lib/mol-util/graphql-client';
import { qscore_gql } from './qscore.gql';
import { ParamDefinition as PD } from 'molstar/lib/mol-util/param-definition';
import { CustomModelProperty } from 'molstar/lib/mol-model-props/common/custom-model-property';
import { CustomPropertyDescriptor } from 'molstar/lib/mol-model/custom-property';
import { ChainIndex, Model, ResidueIndex } from 'molstar/lib/mol-model/structure/model';
import { CustomProperty } from 'molstar/lib/mol-model-props/common/custom-property';
import { PropertyWrapper } from 'molstar/lib/mol-model-props/common/wrapper';
import { IndexedCustomProperty } from 'molstar/lib/mol-model/structure/model/properties/custom/indexed';
import { Structure, StructureElement, Unit } from 'molstar/lib/mol-model/structure/structure';
import { MmcifFormat } from 'molstar/lib/mol-model-formats/structure/mmcif';

/** `data` is `undefined` if no Q-scores are available for the entry */
export type QScore = PropertyWrapper<{
    score: IndexedCustomProperty.Residue<number>
} | undefined>

export namespace QScore {
    /** @returns the Q-score of the residue or `undefined` if there is none */
    export function getScore(e: StructureElement.Location): number | undefined {
        if (!Unit.isAtomic(e.unit)) return;
        const prop = QScoreProvider.get(e.unit.model).value;
        if (!prop || !prop.data) return;
        const rI = e.unit.residueIndex[e.element];
        return prop.data.score.get(rI);
    }

    export function isApplicable(ctx: ThemeDataContext) {
        return !!ctx.structure && !ctx.structure.isEmpty && isApplicableModel(ctx.structure.models[0]);
    }

    export function isApplicableModel(model: Model) {
        return MmcifFormat.is(model.sourceData) && Model.isFromPdbArchive(model) && Model.isFromEm(model);
    }

    /** Q-scores were requested but none are available (e.g., no Q-scores computed for this entry) */
    export function isUnavailable(model: Model) {
        const prop = QScoreProvider.get(model).value;
        return !!prop && !prop.data;
    }

    /** Like `isApplicable` but also `false` if Q-scores are known to be unavailable */
    export function isApplicableAndAvailable(ctx: ThemeDataContext) {
        return isApplicable(ctx) && !isUnavailable(ctx.structure!.models[0]);
    }

    export function hasData(structure?: Structure) {
        if (!structure || structure.isEmpty) return false;
        return !!QScoreProvider.get(structure.models[0]).value?.data;
    }

    export async function obtain(ctx: CustomProperty.Context, model: Model, props: QScoreProps): Promise<CustomProperty.Data<QScore>> {
        return { value: { info: PropertyWrapper.createInfo(), data: await _obtain(ctx, model, props) } };
    }

    async function _obtain(ctx: CustomProperty.Context, model: Model, props: QScoreProps): Promise<QScore['data'] | undefined> {
        const client = new GraphQLClient(props.serverUrl, ctx.assetManager);
        const result = await client.request(ctx.runtime, qscore_gql, { entry_id: model.entryId });
        const entry = result.data.entry as QScoreEntry | null;
        if (!entry) return;

        const map = createResidueMap(model, entry);
        if (map.size === 0) return;

        return { score: IndexedCustomProperty.fromResidueMap(map) };
    }

    function createResidueMap(model: Model, entry: QScoreEntry): Map<ResidueIndex, number> {
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

type QScoreEntry = {
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

export const QScoreParams = {
    serverUrl: PD.Text('https://data.rcsb.org/graphql', { description: 'RCSB Data API GraphQL endpoint' })
};
export type QScoreParams = typeof QScoreParams
export type QScoreProps = PD.Values<QScoreParams>

export const QScoreProvider: CustomModelProperty.Provider<QScoreParams, QScore> = CustomModelProperty.createProvider({
    label: 'Q-score',
    descriptor: CustomPropertyDescriptor({
        name: 'rcsb_q_score'
    }),
    type: 'static',
    defaultParams: QScoreParams,
    getParams: () => QScoreParams,
    isApplicable: (data: Model) => QScore.isApplicableModel(data),
    obtain: async (ctx: CustomProperty.Context, data: Model, props: Partial<QScoreProps>) => {
        const p = { ...PD.getDefaultValues(QScoreParams), ...props };
        try {
            return await QScore.obtain(ctx, data, p);
        } catch (e) {
            console.warn(`Failed to obtain Q-scores for ${data.entryId}`, e);
            return { value: { info: PropertyWrapper.createInfo(), data: undefined } };
        }
    }
});
