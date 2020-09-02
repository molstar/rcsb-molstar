/**
 * Copyright (c) 2020 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Yana Rose
 */

import { ThemeDataContext } from 'molstar/lib/mol-theme/theme';
import { ColorTheme } from 'molstar/lib/mol-theme/color';
import { ParamDefinition as PD } from 'molstar/lib/mol-util/param-definition';
import { Color } from 'molstar/lib/mol-util/color';
import { StructureElement, StructureProperties, Structure } from 'molstar/lib/mol-model/structure';
import { Location } from 'molstar/lib/mol-model/location';
import { ColorLists } from 'molstar/lib/mol-util/color/lists';

const DefaultColor = Color(0xCCCCCC);

export function SuperposeColorTheme(ctx: ThemeDataContext, props: {}): ColorTheme<{}> {

    console.log(ctx.structure?.inheritedPropertyData.subset);

    let colorCode = ctx.structure?.inheritedPropertyData.subset.color
    if (colorCode === undefined) {
        const index = Structure.Index.get(ctx.structure!).value || 0;
        const { list } = ColorLists['many-distinct']
        colorCode = list[index % list.length];
    }

    const beg = ctx.structure?.inheritedPropertyData.subset.beg;
    const end = ctx.structure?.inheritedPropertyData.subset.end;
    const color = (location: Location): Color => {
        if (StructureElement.Location.is(location)) {
            const seqId = StructureProperties.residue.label_seq_id(location);
            if ( beg<=seqId && seqId<=end ) {
                return colorCode;
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