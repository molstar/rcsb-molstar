/**
 * Copyright (c) 2026 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Sebastian Bittrich <sebastian.bittrich@rcsb.org>
 */

import { ThemeDataContext } from 'molstar/lib/mol-theme/theme';
import { ColorTheme, LocationColor } from 'molstar/lib/mol-theme/color';
import { ParamDefinition as PD } from 'molstar/lib/mol-util/param-definition';
import { Color } from 'molstar/lib/mol-util/color';
import { ColorScale } from 'molstar/lib/mol-util/color/scale';
import { StructureElement, Bond } from 'molstar/lib/mol-model/structure';
import { Location } from 'molstar/lib/mol-model/location';
import { CustomProperty } from 'molstar/lib/mol-model-props/common/custom-property';
import { QScore, QScoreProvider } from './prop';

// colors adopted from 'Q-score mapped to coordinate model' of the wwPDB EM validation report
const DefaultColor = Color(0xaaaaaa);
const NegativeColor = Color(0xff00ff);
const Scale = ColorScale.create({ listOrName: [Color(0x800000), Color(0x80ffff)], domain: [0, 1], minLabel: '0.0', maxLabel: '1.0' });

export const QScoreColorThemeParams = {};
export type QScoreColorThemeParams = typeof QScoreColorThemeParams
export function getQScoreColorThemeParams(_ctx: ThemeDataContext) {
    return QScoreColorThemeParams;
}

export function QScoreColorTheme(ctx: ThemeDataContext, props: PD.Values<QScoreColorThemeParams>): ColorTheme<QScoreColorThemeParams> {
    let color: LocationColor = () => DefaultColor;

    if (QScore.hasData(ctx.structure)) {
        const l = StructureElement.Location.create(ctx.structure!.root);

        const getColor = (location: StructureElement.Location): Color => {
            const score = QScore.getScore(location);
            if (score === undefined) return DefaultColor;
            if (score < 0) return NegativeColor;
            return Scale.color(score);
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
        factory: QScoreColorTheme,
        granularity: 'group',
        preferSmoothing: true,
        color,
        props,
        description: 'Assigns residue colors according to their Q-score, a measure of atom resolvability in the cryo-EM map. Colors range from dark red (Q-score of 0, poorly resolved) to cyan (Q-score of 1, well resolved). Negative Q-scores are shown in magenta, residues without Q-score in gray. Q-scores correlate strongly with map resolution, so low values are expected at resolutions where atoms are not resolved (Pintilie et al., 2020). Data from wwPDB Validation Report, obtained via RCSB PDB.',
        legend: Scale.legend
    };
}

export const QScoreColorThemeProvider: ColorTheme.Provider<QScoreColorThemeParams, 'qscore'> = {
    name: 'qscore',
    label: 'Q-score',
    category: ColorTheme.Category.Validation,
    factory: QScoreColorTheme,
    getParams: getQScoreColorThemeParams,
    defaultValues: PD.getDefaultValues(QScoreColorThemeParams),
    isApplicable: (ctx: ThemeDataContext) => QScore.isApplicableAndAvailable(ctx),
    ensureCustomProperties: {
        attach: (ctx: CustomProperty.Context, data: ThemeDataContext) => data.structure ? QScoreProvider.attach(ctx, data.structure.models[0], void 0, true) : Promise.resolve(),
        detach: (data) => data.structure && QScoreProvider.ref(data.structure.models[0], false)
    }
};
