/**
 * Copyright (c) 2018-2021 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Mandar Deshpande <mandar@ebi.ac.uk>
 * @author David Sehnal <david.sehnal@gmail.com>
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 * @author Sebastian Bittrich <sebastian.bittrich@rcsb.org>
 */

import { Column, Table } from 'molstar/lib/mol-data/db';
import { toTable } from 'molstar/lib/mol-io/reader/cif/schema';
import { IndexedCustomProperty, Model, ResidueIndex, Unit } from 'molstar/lib/mol-model/structure';
import { Structure, StructureElement } from 'molstar/lib/mol-model/structure/structure';
import { ParamDefinition as PD } from 'molstar/lib/mol-util/param-definition';
import { MmcifFormat } from 'molstar/lib/mol-model-formats/structure/mmcif';
import { PropertyWrapper } from 'molstar/lib/mol-model-props/common/wrapper';
import { CustomProperty } from 'molstar/lib/mol-model-props/common/custom-property';
import { CustomModelProperty } from 'molstar/lib/mol-model-props/common/custom-model-property';
import { CustomPropertyDescriptor } from 'molstar/lib/mol-model/custom-property';
import { arraySetAdd } from 'molstar/lib/mol-util/array';
import { dateToUtcString } from 'molstar/lib/mol-util/date';

export type AlphaFoldConfidence = PropertyWrapper<{
    score: IndexedCustomProperty.Residue<[number, string]>,
    category: string[]
}>

export namespace AlphaFoldConfidence {
    export function isApplicable(model?: Model): boolean {
        if (!model || !MmcifFormat.is(model.sourceData)) return false;
        return model.sourceData.data.frame.categoryNames.includes('ma_qa_metric_local');
    }

    export interface Info {
        timestamp_utc: string
    }

    export const Schema = {
        local_metric_values: {
            label_asym_id: Column.Schema.str,
            label_comp_id: Column.Schema.str,
            label_seq_id: Column.Schema.int,
            metric_id: Column.Schema.int,
            metric_value: Column.Schema.float,
            model_id: Column.Schema.int,
            ordinal_id: Column.Schema.int
        }
    };
    export type Schema = typeof Schema;

    function tryGetInfoFromCif(categoryName: string, model: Model): undefined | Info {
        if (!MmcifFormat.is(model.sourceData) || !model.sourceData.data.frame.categoryNames.includes(categoryName)) {
            return;
        }

        const timestampField = model.sourceData.data.frame.categories[categoryName].getField('metric_value');
        if (!timestampField || timestampField.rowCount === 0) return;

        return { timestamp_utc: timestampField.str(0) || dateToUtcString(new Date()) };
    }


    export function fromCif(ctx: CustomProperty.Context, model: Model): AlphaFoldConfidence | undefined {
        const info = tryGetInfoFromCif('ma_qa_metric_local', model);
        if (!info) return;
        const data = getCifData(model);
        const metricMap = createScoreMapFromCif(model, data.residues);
        return { info, data: metricMap };
    }

    export async function obtain(ctx: CustomProperty.Context, model: Model, _props: AlphaFoldConfidenceProps): Promise<CustomProperty.Data<any>> {
        const cif = fromCif(ctx, model);
        return { value: cif };
    }

    export function getConfidenceScore(e: StructureElement.Location): [number, string] {
        if (!Unit.isAtomic(e.unit)) return [-1, 'No Score'];
        const prop = AlphaFoldConfidenceProvider.get(e.unit.model).value;
        if (!prop || !prop.data) return [-1, 'No Score'];
        const rI = e.unit.residueIndex[e.element];
        return prop.data.score.has(rI) ? prop.data.score.get(rI)! : [-1, 'No Score'];
    }

    const _emptyArray: string[] = [];
    export function getCategories(structure?: Structure) {
        if (!structure) return _emptyArray;
        const prop = AlphaFoldConfidenceProvider.get(structure.models[0]).value;
        if (!prop || !prop.data) return _emptyArray;
        return prop.data.category;
    }

    function getCifData(model: Model) {
        if (!MmcifFormat.is(model.sourceData)) throw new Error('Data format must be mmCIF.');
        return {
            residues: toTable(Schema.local_metric_values, model.sourceData.data.frame.categories.ma_qa_metric_local),
        };
    }
}

export const AlphaFoldConfidenceParams = {};
export type AlphaFoldConfidenceParams = typeof AlphaFoldConfidenceParams
export type AlphaFoldConfidenceProps = PD.Values<AlphaFoldConfidenceParams>

export const AlphaFoldConfidenceProvider: CustomModelProperty.Provider<AlphaFoldConfidenceParams, AlphaFoldConfidence> = CustomModelProperty.createProvider({
    label: 'AlphaFold Confidence Score',
    descriptor: CustomPropertyDescriptor({
        name: 'af_confidence_score'
    }),
    type: 'static',
    defaultParams: AlphaFoldConfidenceParams,
    getParams: () => AlphaFoldConfidenceParams,
    isApplicable: (data: Model) => AlphaFoldConfidence.isApplicable(data),
    obtain: async (ctx: CustomProperty.Context, data: Model, props: Partial<AlphaFoldConfidenceProps>) => {
        const p = { ...PD.getDefaultValues(AlphaFoldConfidenceParams), ...props };
        return await AlphaFoldConfidence.obtain(ctx, data, p);
    }
});

function createScoreMapFromCif(modelData: Model, residueData: Table<typeof AlphaFoldConfidence.Schema.local_metric_values>): AlphaFoldConfidence['data'] {
    const { label_asym_id, label_seq_id, metric_value, _rowCount } = residueData;

    const ret = new Map<ResidueIndex, [number, string]>();
    const categories: string[] = [];

    const toCategory = (v: number): 'Very low' | 'Low' | 'Confident' | 'Very high' => {
        if (v > 50 && v <= 70)  return 'Low';
        if (v > 70 && v <= 90) return 'Confident';
        if (v > 90) return 'Very high';
        return 'Very low';
    };

    for (let i = 0; i < _rowCount; i++) {
        const confidenceScore = metric_value.value(i);
        const idx = modelData.atomicHierarchy.index.findResidue('1', label_asym_id.value(i), label_seq_id.value(i));
        const confidenceCategory = toCategory(confidenceScore);

        ret.set(idx, [confidenceScore, confidenceCategory]);
        arraySetAdd(categories, confidenceCategory);
    }

    return {
        score: IndexedCustomProperty.fromResidueMap(ret),
        category: categories
    };
}