/**
 * Copyright (c) 2020-2022 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Sebastian Bittrich <sebastian.bittrich@rcsb.org>
 */

import { ThemeDataContext } from 'molstar/lib/mol-theme/theme';
import { ColorTheme, LocationColor } from 'molstar/lib/mol-theme/color';
import { ParamDefinition as PD } from 'molstar/lib/mol-util/param-definition';
import { Color } from 'molstar/lib/mol-util/color';
import { StructureElement, Model, Bond } from 'molstar/lib/mol-model/structure';
import { Location } from 'molstar/lib/mol-model/location';
import { CustomProperty } from 'molstar/lib/mol-model-props/common/custom-property';
import { ValidationReport } from 'molstar/lib/extensions/rcsb/validation-report/prop';
import { TableLegend } from 'molstar/lib/mol-util/legend';
import { RSCC, RSCCProvider } from './prop';

const DefaultColor = Color(0xaaaaaa);
const Colors = [DefaultColor, Color(0xff7d45), Color(0xffdb13), Color(0x65cbf3), Color(0x0053d6)];
const ConfidenceColors: { [k: string]: Color } = {
    'No Score': Colors[0],
    'Very low confidence': Colors[1],
    'Low confidence': Colors[2],
    'Well resolved': Colors[3],
    'Very well resolved': Colors[4]
};

const ConfidenceColorLegend = TableLegend(Object.entries(ConfidenceColors));

export function getRSCCColorThemeParams(ctx: ThemeDataContext) {
    const categories = RSCC.getCategories(ctx.structure);
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
export type RSCCColorThemeParams = ReturnType<typeof getRSCCColorThemeParams>

export function RSCCColorTheme(ctx: ThemeDataContext, props: PD.Values<RSCCColorThemeParams>): ColorTheme<RSCCColorThemeParams> {
    let color: LocationColor = () => DefaultColor;

    if (ctx.structure && ctx.structure.models.length > 0 && ctx.structure.models[0].customProperties.has(RSCCProvider.descriptor)) {
        const l = StructureElement.Location.create(ctx.structure.root);

        const getColor = (location: StructureElement.Location): Color => {
            const score: string = RSCC.getScore(location)[1];

            if (props.type.name !== 'score') {
                const categoryProp = props.type.params.kind;
                if (score === categoryProp) return ConfidenceColors[score];
            }

            return ConfidenceColors[score];
        };

        color = (location: Location) => {
            if (StructureElement.Location.is(location)) {
                return getColor(location);
            } else if (Bond.isLocation(location)) {
                l.unit = location.aUnit;
                l.element = location.aUnit.elements[location.aIndex];
                return getColor(l);
            }
            return DefaultColor;
        };
    }

    return {
        factory: RSCCColorTheme,
        granularity: 'group',
        preferSmoothing: true,
        color,
        props,
        description: 'Assigns residue colors according to the real-space correlation coefficient (RSCC) for polymer residues. Colors range from orange (very low confidence) and yellow (low confidence) to cyan (well resolved) and blue (very well resolved). Categories were obtained by archive-wide statistical analysis. Data from wwPDB Validation Report, obtained via RCSB PDB.',
        legend: ConfidenceColorLegend
    };
}

export const RSCCColorThemeProvider: ColorTheme.Provider<RSCCColorThemeParams, 'rscc'> = {
    name: 'rscc',
    label: 'Experimental Support Confidence',
    category: ColorTheme.Category.Validation,
    factory: RSCCColorTheme,
    getParams: getRSCCColorThemeParams,
    defaultValues: PD.getDefaultValues(getRSCCColorThemeParams({})),
    isApplicable: (ctx: ThemeDataContext) => !!ctx.structure && ValidationReport.isApplicable(ctx.structure.models[0]) && Model.isFromXray(ctx.structure.models[0]) && Model.probablyHasDensityMap(ctx.structure.models[0]),
    ensureCustomProperties: {
        attach: (ctx: CustomProperty.Context, data: ThemeDataContext) => data.structure ? RSCCProvider.attach(ctx, data.structure.models[0], void 0, true) : Promise.resolve(),
        detach: (data) => data.structure && RSCCProvider.ref(data.structure.models[0], false)
    }
};