/**
 * Copyright (c) 2023 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Sebastian Bittrich <sebastian.bittrich@rcsb.org>
 */

import { Structure } from 'molstar/lib/mol-model/structure/structure/structure';
import { Unit } from 'molstar/lib/mol-model/structure/structure/unit';
import { OrderedSet } from 'molstar/lib/mol-data/int';
import { UnitIndex } from 'molstar/lib/mol-model/structure/structure/element/element';
import { StructureElement, StructureProperties } from 'molstar/lib/mol-model/structure/structure';
import { Vec3 } from 'molstar/lib/mol-math/linear-algebra/3d/vec3';
import { StrucmotifCtx } from './helpers';

export const MIN_MOTIF_SIZE = 2;
export const MAX_MOTIF_SIZE = 10;
export const MAX_EXCHANGES = 4;
const MAX_MOTIF_EXTENT = 15;
const MAX_MOTIF_EXTENT_SQUARED = MAX_MOTIF_EXTENT * MAX_MOTIF_EXTENT;

export function determineBackboneAtom(structure: Structure, location: StructureElement.Location, element: { unit: Unit; indices: OrderedSet<UnitIndex> }) {
    const { label_atom_id } = StructureProperties.atom;
    const { indices } = element;
    for (let i = 0, il = OrderedSet.size(indices); i < il; i++) {
        StructureElement.Location.set(location, structure, element.unit, element.unit.elements[OrderedSet.getAt(indices, i)]);
        if (!Unit.isAtomic(location.unit)) return false;

        const atomLabelId = label_atom_id(location);
        if ('CA' === atomLabelId || `C4'` === atomLabelId) {
            return true;
        }
    }
    return false;
}

export function validate(ctx: StrucmotifCtx) {
    if (ctx.residueIds.length < MIN_MOTIF_SIZE) return false;

    if (ctx.pdbId.size > 1) {
        alert('Motifs can only be extracted from a single model!');
        return false;
    }
    if (ctx.sg.size > 1) {
        alert('Motifs can only appear in a single space-group!');
        return false;
    }
    if (ctx.hkl.size > 1) {
        alert('All motif residues must have matching hkl operators!');
        return false;
    }
    if (ctx.ncs.size > 1) {
        alert('All motif residues must have matching NCS operators!');
        return false;
    }
    if (ctx.residueIds.length > MAX_MOTIF_SIZE) {
        alert(`Maximum motif size is ${MAX_MOTIF_SIZE} residues!`);
        return false;
    }
    if (ctx.residueIds.filter(v => v.label_seq_id === 0).length > 0) {
        alert('Selections may only contain polymeric entities!');
        return false;
    }
    return validateAtomDistances(ctx);
}

function validateAtomDistances(ctx: StrucmotifCtx) {
    const { coordinates } = ctx;
    // warn if >15 A
    const a = Vec3();
    const b = Vec3();

    // this is not efficient but is good enough for up to 10 residues
    for (let i = 0, il = coordinates.length; i < il; i++) {
        Vec3.set(a, coordinates[i].coords[0], coordinates[i].coords[1], coordinates[i].coords[2]);
        let contact = false;
        for (let j = 0, jl = coordinates.length; j < jl; j++) {
            if (i === j) continue;
            Vec3.set(b, coordinates[j].coords[0], coordinates[j].coords[1], coordinates[j].coords[2]);
            const d = Vec3.squaredDistance(a, b);
            if (d < MAX_MOTIF_EXTENT_SQUARED) {
                contact = true;
            }
        }

        if (!contact) {
            const { residueId } = coordinates[i];
            alert(`Residue ${residueId.label_seq_id} | ${residueId.label_asym_id} | ${residueId.struct_oper_id} needs to be less than ${MAX_MOTIF_EXTENT} \u212B from another residue - Consider adding more residues to connect far-apart residues.`);
            return false;
        }
    }
    return true;
}