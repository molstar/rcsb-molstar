/**
 * Copyright (c) 2019-2020 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import { Model, Structure } from 'molstar/lib/mol-model/structure';
import { MmcifFormat } from 'molstar/lib/mol-model-formats/structure/mmcif';

export function modelHasSymmetry(model: Model) {
    if (!MmcifFormat.is(model.sourceData)) return false
    const { db } = model.sourceData.data
    return (
        db.symmetry._rowCount === 1 && db.cell._rowCount === 1 && !(
            db.symmetry.Int_Tables_number.value(0) === 1 &&
            db.cell.angle_alpha.value(0) === 90 &&
            db.cell.angle_beta.value(0) === 90 &&
            db.cell.angle_gamma.value(0) === 90 &&
            db.cell.length_a.value(0) === 1 &&
            db.cell.length_b.value(0) === 1 &&
            db.cell.length_c.value(0) === 1
        )
    )
}

export function modelFromCrystallography(model: Model) {
    if (!MmcifFormat.is(model.sourceData)) return false
    const { db } = model.sourceData.data
    for (let i = 0; i < db.exptl.method.rowCount; i++) {
        const v = db.exptl.method.value(i).toUpperCase()
        if (v.indexOf('DIFFRACTION') >= 0) return true
    }
    return false
}

export function modelFromNmr(model: Model) {
    if (!MmcifFormat.is(model.sourceData)) return false
    const { db } = model.sourceData.data
    for (let i = 0; i < db.exptl.method.rowCount; i++) {
        const v = db.exptl.method.value(i).toUpperCase()
        if (v.indexOf('NMR') >= 0) return true
    }
    return false
}

export function modelHasXrayMap(model: Model) {
    if (!MmcifFormat.is(model.sourceData)) return
    const { db } = model.sourceData.data
    return db.pdbx_database_status.status_code_sf.value(0) === 'REL'
}

export function modelHasEmMap(model: Model) {
    if (!MmcifFormat.is(model.sourceData)) return
    const { db } = model.sourceData.data
    let hasEmMap = false
    for (let i = 0, il = db.pdbx_database_related._rowCount; i < il; ++i) {
        if (db.pdbx_database_related.db_name.value(i).toUpperCase() === 'EMDB') {
            hasEmMap = true
            break
        }
    }
    return hasEmMap
}

export function modelHasMap(model: Model) {
    return modelHasXrayMap(model) || modelHasEmMap(model)
}

//

function getPolymerSymmetryGroups(structure: Structure) {
    return structure.unitSymmetryGroups.filter(ug => ug.units[0].polymerElements.length > 0)
}

/**
 * Try to match fiber-like structures like 6nk4
 */
function isFiberLike(structure: Structure) {
    const polymerSymmetryGroups = getPolymerSymmetryGroups(structure)
    return (
        polymerSymmetryGroups.length === 1 &&
        polymerSymmetryGroups[0].units.length > 2 &&
        polymerSymmetryGroups[0].units[0].polymerElements.length < 15
    )
}

function hasHighSymmetry(structure: Structure) {
    const polymerSymmetryGroups = getPolymerSymmetryGroups(structure)
    return (
        polymerSymmetryGroups.length > 1 &&
        polymerSymmetryGroups[0].units.length > 10
    )
}

export enum StructureSize { Small, Medium, Large, Huge, Gigantic }

export function getStructureSize(structure: Structure): StructureSize {
    if (structure.polymerResidueCount >= 12000) {
        if (hasHighSymmetry(structure)) {
            return StructureSize.Huge
        } else {
            return StructureSize.Gigantic
        }
    } else if (isFiberLike(structure)) {
        return StructureSize.Small
    } else if (structure.polymerResidueCount < 10) {
        return StructureSize.Small
    } else if (structure.polymerResidueCount < 1500) {
        return StructureSize.Medium
    } else {
        return StructureSize.Large
    }
}