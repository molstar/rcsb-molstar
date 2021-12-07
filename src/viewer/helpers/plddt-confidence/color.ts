/**
 * Copyright (c) 2021 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Mandar Deshpande <mandar@ebi.ac.uk>
 * @author Sebastian Bittrich <sebastian.bittrich@rcsb.org>
 */

import { PLDDTConfidence, PLDDTConfidenceProvider } from './prop';
import { Location } from 'molstar/lib/mol-model/location';
import { StructureElement } from 'molstar/lib/mol-model/structure';
import { ColorTheme, LocationColor } from 'molstar/lib/mol-theme/color';
import { ThemeDataContext } from 'molstar/lib/mol-theme/theme';
import { Color } from 'molstar/lib/mol-util/color';
import { ParamDefinition as PD } from 'molstar/lib/mol-util/param-definition';
import { CustomProperty } from 'molstar/lib/mol-model-props/common/custom-property';
import { TableLegend } from 'molstar/lib/mol-util/legend';

const DefaultColor = Color(0xaaaaaa);
const ConfidenceColors: { [k: string]: Color } = {
    'No Score': DefaultColor,
    'Very low': Color(0xff7d45),
    'Low': Color(0xffdb13),
    'Confident': Color(0x65cbf3),
    'Very high': Color(0x0053d6)
};

const ConfidenceColorLegend = TableLegend(Object.entries(ConfidenceColors));

export function getPLDDTConfidenceColorThemeParams(ctx: ThemeDataContext) {
    const categories = PLDDTConfidence.getCategories(ctx.structure);
    if (categories.length === 0) {
        return {
            type: PD.MappedStatic('score', {
                'score': PD.Group({})
            })
        };
    }

    return {
        type: PD.MappedStatic('score', {
            'score': PD.Group({}),
            'category': PD.Group({
                kind: PD.Select(categories[0], PD.arrayToOptions(categories))
            }, { isFlat: true })
        })
    };
}
export type PLDDTConfidenceColorThemeParams = ReturnType<typeof getPLDDTConfidenceColorThemeParams>

export function PLDDTConfidenceColorTheme(ctx: ThemeDataContext, props: PD.Values<PLDDTConfidenceColorThemeParams>): ColorTheme<PLDDTConfidenceColorThemeParams> {
    let color: LocationColor = () => DefaultColor;

    if (ctx.structure && ctx.structure.models.length > 0 && ctx.structure.models[0].customProperties.has(PLDDTConfidenceProvider.descriptor)) {
        const getColor = (location: StructureElement.Location): Color => {
            const score: string = PLDDTConfidence.getConfidenceScore(location)[1];

            if (props.type.name !== 'score') {
                const categoryProp = props.type.params.kind;
                if (score === categoryProp) return ConfidenceColors[score];
            }

            return ConfidenceColors[score];
        };

        color = (location: Location) => {
            if (StructureElement.Location.is(location)) {
                return getColor(location);
            }
            return DefaultColor;
        };
    }

    return {
        factory: PLDDTConfidenceColorTheme,
        granularity: 'group',
        color,
        props,
        description: 'Assigns residue colors according to the pLDDT Confidence score.',
        legend: ConfidenceColorLegend
    };
}

export const PLDDTConfidenceColorThemeProvider: ColorTheme.Provider<PLDDTConfidenceColorThemeParams, 'plddt-confidence'> = {
    name: 'plddt-confidence',
    label: 'pLDDT Confidence',
    category: ColorTheme.Category.Validation,
    factory: PLDDTConfidenceColorTheme,
    getParams: getPLDDTConfidenceColorThemeParams,
    defaultValues: PD.getDefaultValues(getPLDDTConfidenceColorThemeParams({})),
    isApplicable: (ctx: ThemeDataContext) => PLDDTConfidence.isApplicable(ctx.structure?.models[0]),
    ensureCustomProperties: {
        attach: (ctx: CustomProperty.Context, data: ThemeDataContext) => data.structure ? PLDDTConfidenceProvider.attach(ctx, data.structure.models[0], void 0, true) : Promise.resolve(),
        detach: (data) => data.structure && PLDDTConfidenceProvider.ref(data.structure.models[0], false)
    }
};