/**
 * Copyright (c) 2026 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Sebastian Bittrich <sebastian.bittrich@rcsb.org>
 */

import { ThemeDataContext } from 'molstar/lib/mol-theme/theme';
import { ParamDefinition as PD } from 'molstar/lib/mol-util/param-definition';
import { CustomModelProperty } from 'molstar/lib/mol-model-props/common/custom-model-property';
import { CustomPropertyDescriptor } from 'molstar/lib/mol-model/custom-property';
import { Model, ResidueIndex } from 'molstar/lib/mol-model/structure/model';
import { CustomProperty } from 'molstar/lib/mol-model-props/common/custom-property';
import { PropertyWrapper } from 'molstar/lib/mol-model-props/common/wrapper';
import { IndexedCustomProperty } from 'molstar/lib/mol-model/structure/model/properties/custom/indexed';
import { Structure, StructureElement, Unit } from 'molstar/lib/mol-model/structure/structure';
import { MmcifFormat } from 'molstar/lib/mol-model-formats/structure/mmcif';
import { Asset } from 'molstar/lib/mol-util/assets';
import { QScoreDataApi } from './data-api';
import { QScoreValidationReport } from './validation-report';

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
        const { map, assets } = await obtainResidueMap(ctx, model, props);
        const data = map.size > 0 ? { score: IndexedCustomProperty.fromResidueMap(map) } : undefined;
        return { value: { info: PropertyWrapper.createInfo(), data }, assets };
    }

    function obtainResidueMap(ctx: CustomProperty.Context, model: Model, props: QScoreProps): Promise<{ map: Map<ResidueIndex, number>, assets?: Asset.Wrapper[] }> {
        switch (props.source.name) {
            case 'validation-report': return QScoreValidationReport.obtain(ctx, model, props.source.params.baseUrl);
            case 'data-api': return QScoreDataApi.obtain(ctx, model, props.source.params.serverUrl);
        }
    }
}

export const QScoreParams = {
    source: PD.MappedStatic('validation-report', {
        'validation-report': PD.Group({
            baseUrl: PD.Text(QScoreValidationReport.DefaultBaseUrl, { description: 'Base URL to directory tree' })
        }, { isFlat: true }),
        'data-api': PD.Group({
            serverUrl: PD.Text(QScoreDataApi.DefaultServerUrl, { description: 'RCSB Data API GraphQL endpoint' })
        }, { isFlat: true })
    }, {
        options: [['validation-report', 'Validation Report'], ['data-api', 'RCSB Data API']],
        description: 'Source of Q-scores',
        isHidden: true
    })
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
