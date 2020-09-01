/**
 * Copyright (c) 2020 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Yana Rose
 */

import { ThemeDataContext } from 'molstar/lib/mol-theme/theme';
import { ColorTheme } from 'molstar/lib/mol-theme/color';
import { ParamDefinition as PD } from 'molstar/lib/mol-util/param-definition';
import { Color } from 'molstar/lib/mol-util/color';
import { StructureElement, StructureProperties } from 'molstar/lib/mol-model/structure';
import { Location } from 'molstar/lib/mol-model/location';
import { ColorNames } from 'molstar/lib/mol-util/color/names';

const DefaultColor = Color(0xCCCCCC);

const colorMap = new Map();
colorMap.set(0, ColorNames.green);
colorMap.set(1, ColorNames.blue);

export function SuperposeColorTheme(ctx: ThemeDataContext, props: {}): ColorTheme<{}> {

    console.log(ctx.structure?.inheritedPropertyData.subset);

    const index = ctx.structure?.inheritedPropertyData.subset.index;
    const beg = ctx.structure?.inheritedPropertyData.subset.beg;
    const end = ctx.structure?.inheritedPropertyData.subset.end;
    const color = (location: Location): Color => {
        if (StructureElement.Location.is(location)) {
            const seqId = StructureProperties.residue.label_seq_id(location);
            if ( beg>=seqId && seqId<=end ) {
                return colorMap.get(index);
            }
        }
        return DefaultColor;
    };

    return {
        factory: SuperposeColorTheme,
        granularity: 'group',
        color,
        props,
        description: 'Superpose coloring',
    };
}

export const SuperposeColorThemeProvider: ColorTheme.Provider<{}, 'superpose'> = {
    name: 'superpose',
    label: 'Superpose',
    category: ColorTheme.Category.Misc,
    factory: SuperposeColorTheme,
    getParams: () => ({}),
    defaultValues: PD.getDefaultValues({}),
    isApplicable: (ctx: ThemeDataContext) => !!ctx.structure && !!ctx.structure.inheritedPropertyData.subset,
};