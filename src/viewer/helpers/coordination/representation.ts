/**
 * Copyright (c) 2026 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Yana Rose <yana.rose@rcsb.org>
 */

import { Vec3 } from 'molstar/lib/mol-math/linear-algebra';
import { convexHull } from 'molstar/lib/mol-math/geometry/convex-hull';
import { Structure, StructureElement, Unit } from 'molstar/lib/mol-model/structure';
import { BondType } from 'molstar/lib/mol-model/structure/model/types';
import { isMetal } from 'molstar/lib/mol-model/structure/model/properties/atomic/types';
import { Interval, OrderedSet, SortedArray } from 'molstar/lib/mol-data/int';
import { EmptyLoci, Loci } from 'molstar/lib/mol-model/loci';
import { MeshBuilder } from 'molstar/lib/mol-geo/geometry/mesh/mesh-builder';
import { Mesh } from 'molstar/lib/mol-geo/geometry/mesh/mesh';
import { LocationIterator } from 'molstar/lib/mol-geo/util/location-iterator';
import { PickingId } from 'molstar/lib/mol-geo/geometry/picking';
import { BaseGeometry } from 'molstar/lib/mol-geo/geometry/base';
import { ParamDefinition as PD } from 'molstar/lib/mol-util/param-definition';
import { VisualContext } from 'molstar/lib/mol-repr/visual';
import { Theme } from 'molstar/lib/mol-theme/theme';
import { ComplexMeshParams, ComplexMeshVisual } from 'molstar/lib/mol-repr/structure/complex-visual';
import { ComplexRepresentation } from 'molstar/lib/mol-repr/structure/complex-representation';
import { ComplexVisual, StructureRepresentation, StructureRepresentationProvider, StructureRepresentationStateBuilder } from 'molstar/lib/mol-repr/structure/representation';
import { Representation, RepresentationContext, RepresentationParamsGetter } from 'molstar/lib/mol-repr/representation';

/**
 * Coordination geometry of metal atoms, drawn from the metal's heavy-atom ligands (covalent or metal coordination
 * bonds, as in Mol*'s 'polyhedron' representation, which is limited to 4+ bonds and non-planar geometries):
 * - 2 ligands: triangle formed by the metal and both ligands (nothing for linear geometry)
 * - 3 ligands: triangle formed by the ligands (trigonal planar/pyramidal)
 * - 4+ ligands: convex hull of the ligands (polyhedron), or a flat polygon if the ligands are coplanar (square planar)
 */

export type MetalSite = {
    unit: Unit.Atomic
    /** index into `unit.elements` */
    index: StructureElement.UnitIndex
    ligands: StructureElement.Location[]
}

function isCoordinationBond(flag: BondType.Flag) {
    return BondType.isCovalent(flag) || BondType.is(flag, BondType.Flag.MetallicCoordination);
}

function isHydrogen(unit: Unit.Atomic, index: StructureElement.UnitIndex) {
    return unit.model.atomicHierarchy.atoms.type_symbol.value(unit.elements[index]) === 'H';
}

/** Heavy atoms bonded (covalent or metal coordination) to the given atom. */
function getLigands(structure: Structure, unit: Unit.Atomic, index: StructureElement.UnitIndex) {
    const ligands: StructureElement.Location[] = [];
    const { offset, b, edgeProps: { flags } } = unit.bonds;
    for (let i = offset[index], il = offset[index + 1]; i < il; ++i) {
        const j = b[i] as StructureElement.UnitIndex;
        if (isCoordinationBond(flags[i]) && !isHydrogen(unit, j)) ligands.push(StructureElement.Location.create(structure, unit, unit.elements[j]));
    }
    const { interUnitBonds } = structure;
    for (const e of interUnitBonds.getEdgeIndices(index, unit.id)) {
        const bond = interUnitBonds.edges[e];
        const unitB = structure.unitMap.get(bond.unitB);
        if (!Unit.isAtomic(unitB)) continue;
        if (isCoordinationBond(bond.props.flag) && !isHydrogen(unitB, bond.indexB)) ligands.push(StructureElement.Location.create(structure, unitB, unitB.elements[bond.indexB]));
    }
    return ligands;
}

/**
 * Metal atoms of `subset` (a substructure of `structure`, by default `structure.child`) with `min..max` heavy-atom
 * ligands. Ligands are taken from the whole `structure`, so with a parent structure protein atoms are included.
 */
export function getMetalSites(structure: Structure, minCoordination: number, maxCoordination: number, subset: Structure = structure.child ?? structure): MetalSite[] {
    const sites: MetalSite[] = [];
    for (const u of subset.units) {
        const unit = structure.unitMap.get(u.id);
        if (!unit || !Unit.isAtomic(unit)) continue;
        const { type_symbol } = unit.model.atomicHierarchy.atoms;
        for (let i = 0, il = u.elements.length; i < il; ++i) {
            const element = u.elements[i];
            if (!isMetal(type_symbol.value(element))) continue;
            const index = SortedArray.indexOf(unit.elements, element) as StructureElement.UnitIndex;
            if (index < 0) continue;
            const ligands = getLigands(structure, unit, index);
            if (ligands.length < minCoordination || ligands.length > maxCoordination) continue;
            sites.push({ unit, index, ligands });
        }
    }
    return sites;
}

function position(l: { unit: Unit, element: StructureElement.Location['element'] }) {
    return l.unit.conformation.position(l.element, Vec3());
}

const _centroid = Vec3(), _normal = Vec3(), _u = Vec3(), _v = Vec3(), _d = Vec3(), _a = Vec3(), _b = Vec3();

/** Adds the triangle with both windings, so that a flat geometry is rendered from both sides. */
function addTwoSidedTriangle(state: MeshBuilder.State, a: Vec3, b: Vec3, c: Vec3) {
    MeshBuilder.addTriangle(state, a, b, c);
    MeshBuilder.addTriangle(state, a, c, b);
}

/** Adds the convex polygon through (nearly) coplanar `positions` as a triangle fan around their centroid. */
function addPolygon(state: MeshBuilder.State, positions: Vec3[]) {
    const n = positions.length;
    Vec3.set(_centroid, 0, 0, 0);
    for (const p of positions) Vec3.add(_centroid, _centroid, p);
    Vec3.scale(_centroid, _centroid, 1 / n);

    // plane normal: largest cross product of centroid-relative vectors
    let best = 0;
    for (let i = 0; i < n; ++i) {
        for (let j = i + 1; j < n; ++j) {
            Vec3.cross(_d, Vec3.sub(_a, positions[i], _centroid), Vec3.sub(_b, positions[j], _centroid));
            const l = Vec3.squaredMagnitude(_d);
            if (l > best) { best = l; Vec3.copy(_normal, _d); }
        }
    }
    if (best < 1e-6) return; // collinear, e.g. linear coordination
    Vec3.normalize(_normal, _normal);

    if (n === 3) {
        addTwoSidedTriangle(state, positions[0], positions[1], positions[2]);
        return;
    }

    // order vertices by angle in the plane
    Vec3.normalize(_u, Vec3.sub(_u, positions[0], _centroid));
    Vec3.cross(_v, _normal, _u);
    const order = positions.map((p, i) => {
        Vec3.sub(_d, p, _centroid);
        return { i, angle: Math.atan2(Vec3.dot(_d, _v), Vec3.dot(_d, _u)) };
    }).sort((x, y) => x.angle - y.angle).map(x => x.i);
    for (let k = 0; k < n; ++k) {
        addTwoSidedTriangle(state, _centroid, positions[order[k]], positions[order[(k + 1) % n]]);
    }
}

function addSite(state: MeshBuilder.State, site: MetalSite) {
    const ligands = site.ligands.map(position);
    if (ligands.length === 2) {
        // metal and its two ligands
        addPolygon(state, [position({ unit: site.unit, element: site.unit.elements[site.index] }), ...ligands]);
        return;
    }
    const hull = ligands.length >= 4 ? convexHull(ligands) : undefined;
    if (hull && hull.indices.length > 0) {
        for (let i = 0; i < hull.indices.length; i += 3) {
            MeshBuilder.addTriangle(state, ligands[hull.indices[i]], ligands[hull.indices[i + 1]], ligands[hull.indices[i + 2]]);
        }
    } else {
        addPolygon(state, ligands);
    }
}

export const CoordinationGeometryMeshParams = {
    ...ComplexMeshParams,
    // planar geometries have no inside: show both faces in the normal color
    doubleSided: PD.Boolean(true, BaseGeometry.CustomQualityParamInfo),
    interior: { ...ComplexMeshParams.interior, defaultValue: { ...ComplexMeshParams.interior.defaultValue, colorStrength: 0 } },
    minCoordination: PD.Numeric(2, { min: 2, max: 12, step: 1 }, { description: 'Minimum number of coordinating atoms' }),
    maxCoordination: PD.Numeric(12, { min: 2, max: 24, step: 1 }, { description: 'Maximum number of coordinating atoms' }),
};
export type CoordinationGeometryMeshParams = typeof CoordinationGeometryMeshParams

const sitesCache = new WeakMap<Structure, { key: string, sites: MetalSite[] }>();
function getSites(structure: Structure, props: PD.Values<CoordinationGeometryMeshParams>) {
    const key = `${props.minCoordination}-${props.maxCoordination}`;
    const cached = sitesCache.get(structure);
    if (cached?.key === key) return cached.sites;
    const sites = getMetalSites(structure, props.minCoordination, props.maxCoordination);
    sitesCache.set(structure, { key, sites });
    return sites;
}

function createCoordinationGeometryMesh(ctx: VisualContext, structure: Structure, theme: Theme, props: PD.Values<CoordinationGeometryMeshParams>, mesh?: Mesh) {
    const sites = getSites(structure, props);
    const count = sites.length * 8;
    const state = MeshBuilder.createState(count, count / 2, mesh);
    for (let i = 0; i < sites.length; ++i) {
        state.currentGroup = i;
        addSite(state, sites[i]);
    }
    return MeshBuilder.getMesh(state);
}

function CoordinationGeometryMeshVisual(materialId: number): ComplexVisual<CoordinationGeometryMeshParams> {
    // getLoci/eachLocation don't receive props, keep the ones used to create the geometry
    let props = PD.getDefaultValues(CoordinationGeometryMeshParams);

    return ComplexMeshVisual<CoordinationGeometryMeshParams>({
        defaultProps: props,
        createGeometry: (ctx, structure, theme, p, mesh) => {
            props = p;
            return createCoordinationGeometryMesh(ctx, structure, theme, p, mesh);
        },
        createLocationIterator: (structure, p) => {
            const sites = getSites(structure, p);
            const location = StructureElement.Location.create(structure);
            return LocationIterator(sites.length, 1, 1, (groupIndex: number) => {
                const site = sites[groupIndex];
                if (site) {
                    location.unit = site.unit;
                    location.element = site.unit.elements[site.index];
                }
                return location;
            }, true);
        },
        getLoci: (pickingId: PickingId, structure: Structure, id: number): Loci => {
            const { objectId, groupId } = pickingId;
            if (id !== objectId) return EmptyLoci;
            const site = getSites(structure, props)[groupId];
            if (!site) return Structure.Loci(structure);
            return StructureElement.Loci(structure, [{ unit: site.unit, indices: OrderedSet.ofSingleton(site.index) }]);
        },
        eachLocation: (loci: Loci, structure: Structure, apply: (interval: Interval) => boolean) => {
            if (!StructureElement.Loci.is(loci) || !Structure.areEquivalent(loci.structure, structure)) return false;
            const sites = getSites(structure, props);
            let changed = false;
            for (const { unit, indices } of loci.elements) {
                for (let i = 0; i < sites.length; ++i) {
                    if (sites[i].unit.id === unit.id && OrderedSet.has(indices, sites[i].index)) {
                        if (apply(Interval.ofSingleton(i))) changed = true;
                    }
                }
            }
            return changed;
        },
        setUpdateState: (state, newProps, currentProps) => {
            state.createGeometry = newProps.minCoordination !== currentProps.minCoordination
                || newProps.maxCoordination !== currentProps.maxCoordination;
        }
    }, materialId);
}

const CoordinationGeometryVisuals = {
    'coordination-geometry-mesh': (ctx: RepresentationContext, getParams: RepresentationParamsGetter<Structure, CoordinationGeometryMeshParams>) => ComplexRepresentation('Coordination Geometry mesh', ctx, getParams, CoordinationGeometryMeshVisual),
};

export const CoordinationGeometryParams = {
    ...CoordinationGeometryMeshParams,
    visuals: PD.MultiSelect(['coordination-geometry-mesh'], PD.objectToOptions(CoordinationGeometryVisuals)),
};
export type CoordinationGeometryParams = typeof CoordinationGeometryParams

export function CoordinationGeometryRepresentation(ctx: RepresentationContext, getParams: RepresentationParamsGetter<Structure, CoordinationGeometryParams>): StructureRepresentation<CoordinationGeometryParams> {
    return Representation.createMulti('Coordination Geometry', ctx, getParams, StructureRepresentationStateBuilder, CoordinationGeometryVisuals as unknown as Representation.Def<Structure, CoordinationGeometryParams>);
}

export const CoordinationGeometryRepresentationProvider = StructureRepresentationProvider({
    name: 'coordination-geometry',
    label: 'Coordination Geometry',
    description: 'Displays the coordination geometry of metal atoms (2+ ligands): triangles, planar polygons and polyhedra.',
    factory: CoordinationGeometryRepresentation,
    getParams: () => CoordinationGeometryParams,
    defaultValues: PD.getDefaultValues(CoordinationGeometryParams),
    defaultColorTheme: { name: 'element-symbol' },
    defaultSizeTheme: { name: 'uniform' },
    isApplicable: (structure: Structure) => structure.elementCount > 0,
    getData: (structure: Structure, props: PD.Values<CoordinationGeometryParams>) => props.includeParent ? structure.asParent() : structure,
    mustRecreate: (oldProps: PD.Values<CoordinationGeometryParams>, newProps: PD.Values<CoordinationGeometryParams>) => oldProps.includeParent !== newProps.includeParent,
});
