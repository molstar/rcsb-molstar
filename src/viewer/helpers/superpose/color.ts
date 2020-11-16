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

    let colorLookup = ctx.structure?.inheritedPropertyData.colors;

    const index = Structure.Index.get(ctx.structure!).value || 0;
    const { list } = ColorLists['many-distinct']
    let colorCode = list[index % list.length];

    const color = (location: Location): Color => {
        if (StructureElement.Location.is(location)) {
            const asymId = StructureProperties.chain.label_asym_id(location);
            const seqId = StructureProperties.residue.label_seq_id(location);
            if (colorLookup?.[asymId]?.has(seqId)) {
                if (colorLookup[asymId]?.get(seqId) !== undefined) {
                    colorCode = colorLookup[asymId]?.get(seqId);
                }
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