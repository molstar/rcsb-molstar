import { ThemeDataContext } from 'molstar/lib/mol-theme/theme';
import { GraphQLClient } from 'molstar/lib/mol-util/graphql-client';
import { SyncRuntimeContext } from 'molstar/lib/mol-task/execution/synchronous';
import { resolution_gql } from './resolution.gql';
import { ParamDefinition as PD } from 'molstar/lib/mol-util/param-definition';
import lookup from './rscc-thresholds.json';
import { CustomModelProperty } from 'molstar/lib/mol-model-props/common/custom-model-property';
import { CustomPropertyDescriptor } from 'molstar/lib/mol-model/custom-property';
import { Model, ResidueIndex } from 'molstar/lib/mol-model/structure/model';
import { CustomProperty } from 'molstar/lib/mol-model-props/common/custom-property';
import { PropertyWrapper } from 'molstar/lib/mol-model-props/common/wrapper';
import { IndexedCustomProperty } from 'molstar/lib/commonjs/mol-model/structure/model/properties/custom/indexed';
import { Structure, StructureElement } from 'molstar/lib/mol-model/structure/structure';
import { Unit } from 'molstar/lib/mol-model/structure/structure';
import { ValidationReport, ValidationReportProvider } from 'molstar/lib/extensions/rcsb/validation-report/prop';
import { arraySetAdd } from 'molstar/lib/mol-util/array';

export type RSCC = PropertyWrapper<{
    score: IndexedCustomProperty.Residue<[number, string]>,
    category: string[]
}>

export namespace RSCC {
    export function getScore(e: StructureElement.Location): [number, string] {
        if (!Unit.isAtomic(e.unit)) return [-1, 'No Score'];
        const prop = RSCCProvider.get(e.unit.model).value;
        if (!prop || !prop.data) return [-1, 'No Score'];
        const rI = e.unit.residueIndex[e.element];
        return prop.data.score.has(rI) ? prop.data.score.get(rI)! : [-1, 'No Score'];
    }

    const _emptyArray: string[] = [];
    export function getCategories(structure?: Structure) {
        if (!structure || structure.isEmpty) return _emptyArray;
        const prop = RSCCProvider.get(structure.models[0]).value;
        if (!prop || !prop.data) return _emptyArray;
        return prop.data.category;
    }

    export function isApplicable(ctx: ThemeDataContext) {
        return !!ctx.structure && ValidationReport.isApplicable(ctx.structure.models[0]) && Model.isFromXray(ctx.structure.models[0]) && Model.probablyHasDensityMap(ctx.structure.models[0]);
    }

    export async function obtain(ctx: CustomProperty.Context, model: Model, props: RSCCProps): Promise<CustomProperty.Data<any>> {
        return { value: { info: PropertyWrapper.createInfo(), data: await _obtain(ctx, model, props) } };
    }

    async function _obtain(ctx: CustomProperty.Context, model: Model, _props: RSCCProps): Promise<RSCC['data'] | undefined> {
        const rscc = ValidationReportProvider.get(model)?.value?.rscc;
        if (!rscc) return;

        const resolution = await fetchResolution(ctx, model, DefaultBaseUrl);
        if (!resolution) return;

        return createSourceMap(model, rscc, resolution);
    }

    function createSourceMap(model: Model, rscc: Map<ResidueIndex, number>, resolution: number): RSCC['data'] {
        const ret = new Map<ResidueIndex, [number, string]>();
        const categories: string[] = [];
        const resolutionBin = Math.floor(resolution * 10);

        const toCategory = (value: number, thresholds: [number, number, number]): 'Very low confidence' | 'Low confidence' | 'Well resolved' | 'Very well resolved' => {
            if (value > thresholds[0]) return 'Very well resolved';
            if (value > thresholds[1]) return 'Well resolved';
            if (value > thresholds[2]) return 'Low confidence';
            return 'Very low confidence';
        };

        const offsets = model.atomicHierarchy.residueAtomSegments.offsets;
        rscc.forEach((v, k) => {
            const label_comp_id = model.atomicHierarchy.atoms.label_comp_id.value(offsets[k]);
            const residue: any = lookup[label_comp_id as keyof typeof lookup];
            if (!residue) return;

            const bin = residue[resolutionBin];
            let category = 'No score';
            if (!bin) {
                // handle 'out-of-range' case
                const keys = Object.keys(residue);
                const [min, max] = [+keys[0], +keys[keys.length - 1]];
                if (resolutionBin < min) category = toCategory(v, residue[keys[0]]);
                if (resolutionBin > max) category = toCategory(v, residue[keys[keys.length - 1]]);
            } else {
                category = toCategory(v, bin);
            }
            ret.set(k, [v, category]);
            arraySetAdd(categories, category);
        });

        return {
            score: IndexedCustomProperty.fromResidueMap(ret),
            category: categories
        };
    }
}

export const RSCCParams = {};
export type RSCCParams = typeof RSCCParams
export type RSCCProps = PD.Values<RSCCParams>

export const RSCCProvider: CustomModelProperty.Provider<RSCCParams, RSCC> = CustomModelProperty.createProvider({
    label: 'RSCC Score',
    descriptor: CustomPropertyDescriptor({
        name: 'rscc_score'
    }),
    type: 'static',
    defaultParams: RSCCParams,
    getParams: () => RSCCParams,
    isApplicable: (data: Model) => RSCC.isApplicable(data),
    obtain: async (ctx: CustomProperty.Context, data: Model, props: Partial<RSCCProps>) => {
        await ValidationReportProvider.attach(ctx, data);
        if (!ValidationReportProvider.get(data).value?.rscc || ValidationReportProvider.get(data).value?.rscc.size === 0) throw Error('No RSCC available');

        const p = { ...PD.getDefaultValues(RSCCParams), ...props };
        return await RSCC.obtain(ctx, data, p);
    }
});

const DefaultBaseUrl = 'https://data.rcsb.org/graphql';
async function fetchResolution(ctx: ThemeDataContext, model: Model, serverUrl: string): Promise<number> {
    const client = new GraphQLClient(serverUrl, ctx.assetManager);
    const result = await client.request(SyncRuntimeContext, resolution_gql, { entry_id: model.entryId });
    return result.data.entry.rcsb_entry_info.resolution_combined;
}
