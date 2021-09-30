/**
 * Copyright (c) 2020 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Yana Rose
 */

import { ThemeDataContext } from 'molstar/lib/mol-theme/theme';
import { ColorTheme } from 'molstar/lib/mol-theme/color';
import { ParamDefinition as PD } from 'molstar/lib/mol-util/param-definition';
import { Color } from 'molstar/lib/mol-util/color';
import { StructureElement, StructureProperties, Bond } from 'molstar/lib/mol-model/structure';
import { Location } from 'molstar/lib/mol-model/location';

export function SuperposeColorTheme(ctx: ThemeDataContext, props: {}): ColorTheme<{}> {
    const colorLookup = ctx.structure?.inheritedPropertyData.colors;
    const defaultColorLookup: Map<string, Color> = new Map();
    for (const [asymId, seqIds] of Object.entries(colorLookup)) {
        const colorValue = (seqIds as Map<number, Color>).values().next().value;
        const defaultColor = Color.desaturate(Color.lighten(colorValue, 1.7), 1.2);
        defaultColorLookup.set(asymId, defaultColor);
    }

    let DefaultColor = Color(0xCCCCCC);
    const colorValues: Color[] = Array.from(defaultColorLookup.values());
    if (colorValues.every((val, i, arr) => val === arr[0])) {
        DefaultColor = colorValues[0];
    }

    const l = StructureElement.Location.create();

    const _color = (location: StructureElement.Location) => {
        const asymId = StructureProperties.chain.label_asym_id(location);
        const seqId = StructureProperties.residue.label_seq_id(location);
        if (colorLookup?.[asymId]?.has(seqId)) {
            if (colorLookup[asymId]?.get(seqId) !== undefined) {
                return colorLookup[asymId]?.get(seqId);
            }
        } else if (colorLookup?.[asymId]) {
            return defaultColorLookup.get(asymId)!;
        }
        return DefaultColor;
    };

    const color = (location: Location): Color => {
        if (StructureElement.Location.is(location)) {
            return _color(location);
        } else if (Bond.isLocation(location)) {
            l.structure = location.aStructure;
            l.unit = location.aUnit;
            l.element = location.aUnit.elements[location.aIndex];
            return _color(l);
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
    isApplicable: (ctx: ThemeDataContext) => !!ctx.structure && !!ctx.structure.inheritedPropertyData.colors,
};