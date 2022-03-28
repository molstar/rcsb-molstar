/**
 * Copyright (c) 2022 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Sebastian Bittrich
 */

import {
    Bond,
    ElementIndex,
    Structure,
    StructureElement,
    StructureProperties,
    Unit
} from 'molstar/lib/mol-model/structure';
import { Color } from 'molstar/lib/mol-util/color';
import { Location } from 'molstar/lib/mol-model/location';
import { ColorTheme, LocationColor } from 'molstar/lib/mol-theme/color';
import { ParamDefinition as PD } from 'molstar/lib/mol-util/param-definition';
import { ThemeDataContext } from 'molstar/lib/mol-theme/theme';
import { getPalette } from 'molstar/lib/mol-util/color/palette';
import { DistinctColorsParams } from 'molstar/lib/mol-util/color/distinct';
import { MoleculeType } from 'molstar/lib/mol-model/structure/model/types';
import { getElementMoleculeType } from 'molstar/lib/mol-model/structure/util';
import { residueNameColor, ResidueNameColors } from 'molstar/lib/mol-theme/color/residue-name';
import { getAdjustedColorMap } from 'molstar/lib/mol-util/color/color';

const DefaultColor = Color(0xCCCCCC);
const Description = 'Color nucleic residues by their name, color everything else by its `label_entity_id` value.';

export const NakbColorThemeParams = {};

export type NakbColorThemeParams = typeof NakbColorThemeParams
export function getNakbColorThemeParams(_ctx: ThemeDataContext) {
    return PD.clone(NakbColorThemeParams);
}

const residueColorMap = getAdjustedColorMap(ResidueNameColors, 0, 1);

const paletteProps = PD.getDefaultValues({
    palette: PD.MappedStatic('colors', {
        colors: PD.Group({
            list: PD.ColorList('many-distinct'),
        }, { isFlat: true }),
        generate: PD.Group({
            ...DistinctColorsParams,
            maxCount: PD.Numeric(75, { min: 1, max: 250, step: 1 }),
        }, { isFlat: true })
    }, {
        options: [
            ['colors', 'Color List'],
            ['generate', 'Generate Distinct']
        ]
    })
});

function getAtomicCompId(unit: Unit.Atomic, element: ElementIndex) {
    return unit.model.atomicHierarchy.atoms.label_comp_id.value(element);
}

function getCoarseCompId(unit: Unit.Spheres | Unit.Gaussians, element: ElementIndex) {
    const seqIdBegin = unit.coarseElements.seq_id_begin.value(element);
    const seqIdEnd = unit.coarseElements.seq_id_end.value(element);
    if (seqIdBegin === seqIdEnd) {
        const entityKey = unit.coarseElements.entityKey[element];
        const seq = unit.model.sequence.byEntityKey[entityKey].sequence;
        return seq.compId.value(seqIdBegin - 1); // 1-indexed
    }
}

function isNucleic(location: StructureElement.Location): boolean {
    const moleculeType = getElementMoleculeType(location.unit, location.element);
    return moleculeType === MoleculeType.RNA || moleculeType === MoleculeType.DNA || moleculeType === MoleculeType.PNA;
}

function residueColor(location: StructureElement.Location): Color {
    if (Unit.isAtomic(location.unit)) {
        const compId = getAtomicCompId(location.unit, location.element);
        return residueNameColor(residueColorMap, compId);
    } else {
        const compId = getCoarseCompId(location.unit, location.element);
        if (compId) return residueNameColor(residueColorMap, compId);
    }
    return DefaultColor;
}

function key(entityId: string, modelIndex: number) {
    return `${entityId}|${modelIndex}`;
}

function getEntityIdSerialMap(structure: Structure) {
    const map = new Map<string, number>();
    for (let i = 0, il = structure.models.length; i < il; ++i) {
        const { label_entity_id } = structure.models[i].atomicHierarchy.chains;
        for (let j = 0, jl = label_entity_id.rowCount; j < jl; ++j) {
            const k = key(label_entity_id.value(j), i);
            if (!map.has(k)) map.set(k, map.size);
        }
        const { coarseHierarchy } = structure.models[i];
        if (coarseHierarchy.isDefined) {
            const { entity_id: spheres_entity_id } = coarseHierarchy.spheres;
            for (let j = 0, jl = spheres_entity_id.rowCount; j < jl; ++j) {
                const k = key(spheres_entity_id.value(j), i);
                if (!map.has(k)) map.set(k, map.size);
            }
            const { entity_id: gaussians_entity_id } = coarseHierarchy.gaussians;
            for (let j = 0, jl = gaussians_entity_id.rowCount; j < jl; ++j) {
                const k = key(gaussians_entity_id.value(j), i);
                if (!map.has(k)) map.set(k, map.size);
            }
        }
    }
    return map;
}

function getEntityId(location: StructureElement.Location): string {
    switch (location.unit.kind) {
        case Unit.Kind.Atomic:
            return StructureProperties.chain.label_entity_id(location);
        case Unit.Kind.Spheres:
        case Unit.Kind.Gaussians:
            return StructureProperties.coarse.entity_id(location);
    }
}

export function NakbColorTheme(ctx: ThemeDataContext, props: PD.Values<NakbColorThemeParams>): ColorTheme<NakbColorThemeParams> {
    let color: LocationColor;

    if (ctx.structure) {
        const l = StructureElement.Location.create(ctx.structure.root);
        const entityIdSerialMap = getEntityIdSerialMap(ctx.structure.root);
        const palette = getPalette(entityIdSerialMap.size, paletteProps);

        color = (location: Location): Color => {
            let serial: number | undefined = undefined;
            if (StructureElement.Location.is(location)) {
                if (isNucleic(location)) return residueColor(location);

                const entityId = getEntityId(location);
                const modelIndex = location.structure.models.indexOf(location.unit.model);
                const k = key(entityId, modelIndex);
                serial = entityIdSerialMap.get(k);
            } else if (Bond.isLocation(location)) {
                l.unit = location.aUnit;
                l.element = location.aUnit.elements[location.aIndex];
                if (isNucleic(l)) return residueColor(l);

                const entityId = getEntityId(l);
                const modelIndex = l.structure.models.indexOf(l.unit.model);
                const k = key(entityId, modelIndex);
                serial = entityIdSerialMap.get(k);
            }
            return serial === undefined ? DefaultColor : palette.color(serial);
        };
    } else {
        color = () => DefaultColor;
    }

    return {
        factory: NakbColorTheme,
        granularity: 'group',
        color,
        props,
        description: Description
    };
}

export const NakbColorThemeProvider: ColorTheme.Provider<NakbColorThemeParams, 'nakb'> = {
    name: 'nakb',
    label: 'NAKB',
    category: ColorTheme.Category.Misc,
    factory: NakbColorTheme,
    getParams: getNakbColorThemeParams,
    defaultValues: PD.getDefaultValues(NakbColorThemeParams),
    isApplicable: (ctx: ThemeDataContext) => !!ctx.structure
};