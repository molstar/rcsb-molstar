/**
 * Copyright (c) 2020 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import { PluginContext } from 'molstar/lib/mol-plugin/context';
import { MolScriptBuilder as MS } from 'molstar/lib/mol-script/language/builder';
import Expression from 'molstar/lib/mol-script/language/expression';
import { ParamDefinition as PD } from 'molstar/lib/mol-util/param-definition';
import { TrajectoryHierarchyPresetProvider } from 'molstar/lib/mol-plugin-state/builder/structure/hierarchy-preset';
import { ValidationReportGeometryQualityPreset } from 'molstar/lib/extensions/rcsb/validation-report/behavior';
import { AssemblySymmetryPreset } from 'molstar/lib/extensions/rcsb/assembly-symmetry/behavior';
import { PluginStateObject } from 'molstar/lib/mol-plugin-state/objects';
import { RootStructureDefinition } from 'molstar/lib/mol-plugin-state/helpers/root-structure';
import { StructureRepresentationPresetProvider } from 'molstar/lib/mol-plugin-state/builder/structure/representation-preset';
import { Structure, StructureSelection, QueryContext, StructureElement } from 'molstar/lib/mol-model/structure';
import { compile } from 'molstar/lib/mol-script/runtime/query/compiler';
import { InitVolumeStreaming } from 'molstar/lib/mol-plugin/behavior/dynamic/volume-streaming/transformers';
import { ViewerState } from '../types';
import { StateSelection, StateObjectSelector, StateObject, StateTransformer, StateObjectRef } from 'molstar/lib/mol-state';
import { VolumeStreaming } from 'molstar/lib/mol-plugin/behavior/dynamic/volume-streaming/behavior';
import { Mat4 } from 'molstar/lib/mol-math/linear-algebra';
import { CustomStructureProperties } from 'molstar/lib/mol-plugin-state/transforms/model';
import { FlexibleStructureFromModel as FlexibleStructureFromModel } from './superpose/flexible-structure';
import { StructureRepresentationRegistry } from 'molstar/lib/mol-repr/structure/registry';
import { StructureSelectionQueries as Q } from 'molstar/lib/mol-plugin-state/helpers/structure-selection-query';
import { PluginCommands } from 'molstar/lib/mol-plugin/commands';
import { InteractivityManager } from 'molstar/lib/mol-plugin-state/manager/interactivity';

type Target = {
    readonly auth_seq_id?: number
    readonly label_seq_id?: number
    readonly label_comp_id?: string
    readonly label_asym_id?: string
}

function targetToExpression(target: Target): Expression {
    const residueTests: Expression[] = [];
    const tests = Object.create(null);

    if (target.auth_seq_id) {
        residueTests.push(MS.core.rel.eq([target.auth_seq_id, MS.ammp('auth_seq_id')]));
    } else if (target.label_seq_id) {
        residueTests.push(MS.core.rel.eq([target.label_seq_id, MS.ammp('label_seq_id')]));
    }
    if (target.label_comp_id) {
        residueTests.push(MS.core.rel.eq([target.label_comp_id, MS.ammp('label_comp_id')]));
    }
    if (residueTests.length === 1) {
        tests['residue-test'] = residueTests[0];
    } else if (residueTests.length > 1) {
        tests['residue-test'] = MS.core.logic.and(residueTests);
    }

    if (target.label_asym_id) {
        tests['chain-test'] = MS.core.rel.eq([target.label_asym_id, MS.ammp('label_asym_id')]);
    }

    if (Object.keys(tests).length > 0) {
        return MS.struct.modifier.union([
            MS.struct.generator.atomGroups(tests)
        ]);
    } else {
        return MS.struct.generator.empty;
    }
}

function targetToLoci(target: Target, structure: Structure): StructureElement.Loci {
    const expression = targetToExpression(target);
    const query = compile<StructureSelection>(expression);
    const selection = query(new QueryContext(structure));
    return StructureSelection.toLociWithSourceUnits(selection);
}

type Range = {
    label_asym_id: string
    label_seq_id?: { beg: number, end?: number }
}

type BaseProps = {
    assemblyId?: string
    modelIndex?: number
}

type ColorProp = {
    name: 'color',
    value: number,
    positions: Range[]
};

export type PropsetProps = {
    kind: 'prop-set',
    selection?: (Range & {
        matrix?: Mat4
    })[],
    representation: ColorProp[]
} & BaseProps

type ValidationProps = {
    kind: 'validation'
    colorTheme?: string
    showClashes?: boolean
} & BaseProps

type StandardProps = {
    kind: 'standard'
} & BaseProps

type SymmetryProps = {
    kind: 'symmetry'
    symmetryIndex?: number
} & BaseProps

type FeatureProps = {
    kind: 'feature'
    target: Target
} & BaseProps

type DensityProps = {
    kind: 'density'
} & BaseProps

export type PresetProps = ValidationProps | StandardProps | SymmetryProps | FeatureProps | DensityProps | PropsetProps

const RcsbParams = (a: PluginStateObject.Molecule.Trajectory | undefined, plugin: PluginContext) => ({
    preset: PD.Value<PresetProps>({ kind: 'standard', assemblyId: '' }, { isHidden: true })
});

type StructureObject = StateObjectSelector<PluginStateObject.Molecule.Structure, StateTransformer<StateObject<any, StateObject.Type<any>>, StateObject<any, StateObject.Type<any>>, any>>

const CommonParams = StructureRepresentationPresetProvider.CommonParams;

const reprBuilder = StructureRepresentationPresetProvider.reprBuilder;
const updateFocusRepr = StructureRepresentationPresetProvider.updateFocusRepr;

type SelectionExpression = {
    tag: string
    type: StructureRepresentationRegistry.BuiltIn
    label: string
    expression: Expression
};

export const RcsbSuperpositionRepresentationPreset = StructureRepresentationPresetProvider({
    id: 'preset-superposition-representation-rcsb',
    display: {
        group: 'Superposition',
        name: 'Alignment',
        description: 'Show representations based on the structural alignment data.'
    },
    params: () => ({
        ...CommonParams,
        selectionExpressions: PD.Value<SelectionExpression[]>([])
    }),
    async apply(ref, params, plugin) {

        const structureCell = StateObjectRef.resolveAndCheck(plugin.state.data, ref);
        if (!structureCell) return Object.create(null);

        const structure = structureCell.obj!.data;
        const cartoonProps = {sizeFactor: structure.isCoarseGrained ? 0.8 : 0.2};

        let components = Object.create(null);
        let representations = Object.create(null);
        for (const expr of params.selectionExpressions) {

            const comp = await plugin.builders.structure.tryCreateComponentFromExpression(structureCell, expr.expression, expr.label, { label: expr.label });
            Object.assign(components, {[expr.label]: comp});

            const { update, builder, typeParams, color } = reprBuilder(plugin, params);

            let typeProps = {...typeParams};
            if (expr.type === 'cartoon') {
                Object.assign(typeProps, {...cartoonProps});
            }

            Object.assign(representations, {
                [expr.label]: builder.buildRepresentation(update, comp, {type: expr.type,
                    typeParams: typeProps, color: color as any}, { tag: expr.tag }),
            });

            await update.commit({ revertOnError: false });

        }
        // needed to apply same coloring scheme to focus representation
        await updateFocusRepr(plugin, structure, params.theme?.focus?.name, params.theme?.focus?.params);

        return representations;
    }
});

export const RcsbPreset = TrajectoryHierarchyPresetProvider({
    id: 'preset-trajectory-rcsb',
    display: { name: 'RCSB' },
    isApplicable: o => {
        return true;
    },
    params: RcsbParams,
    async apply(trajectory, params, plugin) {
        const builder = plugin.builders.structure;
        const p = params.preset;

        const modelParams = { modelIndex: p.modelIndex || 0 };

        const structureParams: RootStructureDefinition.Params = { name: 'model', params: {} };
        if (p.assemblyId && p.assemblyId !== '' && p.assemblyId !== '0') {
            Object.assign(structureParams, {
                name: 'assembly',
                params: { id: p.assemblyId }
            } as RootStructureDefinition.Params);
        }

        const model = await builder.createModel(trajectory, modelParams);
        const modelProperties = await builder.insertModelProperties(model);

        let structure: StructureObject | undefined = undefined;
        let structureProperties: StructureObject | undefined = undefined;

        // If flexible transformation is allowed, we may need to create a single structure component
        // from transformed substructures
        const allowsFlexTransform = p.kind === 'prop-set';
        if (!allowsFlexTransform) {
            structure = await builder.createStructure(modelProperties || model, structureParams);
            structureProperties = await builder.insertStructureProperties(structure);
        }

        const unitcell = await builder.tryCreateUnitcell(modelProperties, undefined, { isHidden: true });

        let representation: StructureRepresentationPresetProvider.Result | undefined = undefined;

        if (p.kind === 'prop-set') {

            // This creates a single structure from selections/transformations as specified
            const _structure = plugin.state.data.build().to(modelProperties)
                .apply(FlexibleStructureFromModel, { selection: p.selection });
            structure = await _structure.commit();

            const _structureProperties = plugin.state.data.build().to(structure)
                .apply(CustomStructureProperties);
            structureProperties = await _structureProperties.commit();

            // adding coloring lookup scheme
            structure.data!.inheritedPropertyData.colors = Object.create(null);
            for (const repr of p.representation) {
                if (repr.name === 'color') {
                    const colorValue = repr.value;
                    const positions = repr.positions;
                    for (const range of positions) {
                        if (!structure.data!.inheritedPropertyData.colors[range.label_asym_id])
                            structure.data!.inheritedPropertyData.colors[range.label_asym_id] = new Map();
                        const residues: number[] = (range.label_seq_id) ? toRange(range.label_seq_id.beg, range.label_seq_id.end) : [];
                        for (const num of residues) {
                            structure.data!.inheritedPropertyData.colors[range.label_asym_id].set(num, colorValue);
                        }
                    }
                }
            }

            // At this we have a structure that contains only the transformed substructres,
            // creating structure selections to have multiple components per each flexible part
            const entryId = model.data!.entryId;
            let selectionExpressions: SelectionExpression[] = [];
            if (p.selection) {
                for (const range of p.selection) {
                    selectionExpressions = selectionExpressions.concat(createSelectionExpression(entryId, range));
                }
            } else {
                selectionExpressions = selectionExpressions.concat(createSelectionExpression(entryId));
            }

            const params = {
                ignoreHydrogens: CommonParams.ignoreHydrogens.defaultValue,
                quality: CommonParams.quality.defaultValue,
                theme: { globalName: 'superpose' as any, focus: { name: 'superpose' } },
                selectionExpressions: selectionExpressions
            };
            representation = await RcsbSuperpositionRepresentationPreset.apply(structure, params, plugin);

        } else if (p.kind === 'validation') {
            representation = await plugin.builders.structure.representation.applyPreset(structureProperties!, ValidationReportGeometryQualityPreset);

        } else if (p.kind === 'symmetry') {
            representation = await plugin.builders.structure.representation.applyPreset<any>(structureProperties!, AssemblySymmetryPreset, { symmetryIndex: p.symmetryIndex });

            ViewerState(plugin).collapsed.next({
                ...ViewerState(plugin).collapsed.value,
                custom: false
            });
        } else {
            representation = await plugin.builders.structure.representation.applyPreset(structureProperties!, 'auto');
        }

        if (p.kind === 'feature' && structure?.obj) {
            let loci = targetToLoci(p.target, structure.obj.data);
            // if target is only defined by chain: then don't force first residue
            const chainMode = p.target.label_asym_id && !p.target.auth_seq_id && !p.target.label_seq_id && !p.target.label_comp_id;
            // HELP-16678: check for rare case where ligand is not present in requested assembly
            if (loci.elements.length === 0 && !!p.assemblyId) {
                // switch to Model (a.k.a. show coordinate independent of assembly )
                const { selection } = plugin.managers.structure.hierarchy;
                const s = selection.structures[0];
                await plugin.managers.structure.hierarchy.updateStructure(s, { ...params, preset: { ...params.preset, assemblyId: void 0 } });
                // update loci
                loci = targetToLoci(p.target, structure.obj.data);
            }
            const target = chainMode ? loci : StructureElement.Loci.firstResidue(loci);
            plugin.managers.structure.focus.setFromLoci(target);
            plugin.managers.camera.focusLoci(target);
        }

        if (p.kind === 'density' && structure?.cell?.parent) {
            const volumeRoot = StateSelection.findTagInSubtree(structure.cell.parent.tree, structure.cell.transform.ref, VolumeStreaming.RootTag);
            if (!volumeRoot) {
                const params = PD.getDefaultValues(InitVolumeStreaming.definition.params!(structure.obj!, plugin));
                await plugin.runTask(plugin.state.data.applyAction(InitVolumeStreaming, params, structure.ref));
            }

            await PluginCommands.Toast.Show(plugin, {
                title: 'Electron Density',
                message: 'Click on a residue to display electron density, click background to reset.',
                key: 'toast-density',
                timeoutMs: 60000
            });

            plugin.behaviors.interaction.click.subscribe(async (e: InteractivityManager.ClickEvent) => {
                if (e.current && e.current.loci && e.current.loci.kind !== 'empty-loci') {
                    await PluginCommands.Toast.Hide(plugin, { key: 'toast-density' });
                }
            });

            ViewerState(plugin).collapsed.next({
                ...ViewerState(plugin).collapsed.value,
                volume: false
            });
        }

        return {
            model,
            modelProperties,
            unitcell,
            structure,
            structureProperties,
            representation
        };
    }
});

export function createSelectionExpression(entryId: string, range?: Range): SelectionExpression[] {
    if (range) {
        const residues: number[] = (range.label_seq_id) ? toRange(range.label_seq_id.beg, range.label_seq_id.end) : [];
        const test = selectionTest(range.label_asym_id, residues);
        const label = labelFromProps(entryId, range);
        return [{
            expression: MS.struct.generator.atomGroups(test),
            label: `${label}`,
            type: 'cartoon',
            tag: 'polymer'
        }];
    } else {
        return [
            {
                expression: Q.polymer.expression,
                label: `${entryId} - Polymers`,
                type: 'cartoon',
                tag: 'polymer'
            },
            {
                expression: Q.ligand.expression,
                label: `${entryId} - Ligands`,
                type: 'ball-and-stick',
                tag: 'ligand'
            },
            {
                expression: Q.ion.expression,
                label: `${entryId} - Ions`,
                type: 'ball-and-stick',
                tag: 'ion'
            },
            {
                expression: Q.branched.expression,
                label: `${entryId} - Carbohydrates`,
                type: 'carbohydrate',
                tag: 'branched-snfg-3d'
            },
            {
                expression: Q.lipid.expression,
                label: `${entryId} - Lipids`,
                type: 'ball-and-stick',
                tag: 'lipid'
            },
            {
                expression: Q.water.expression,
                label: `${entryId} - Waters`,
                type: 'ball-and-stick',
                tag: 'water'
            }
        ];
    }
}

export const selectionTest = (asymId: string, residues: number[]) => {
    if (residues.length > 0) {
        return {
            'chain-test': MS.core.rel.eq([MS.ammp('label_asym_id'), asymId]),
            'residue-test': MS.core.set.has([MS.set(...residues), MS.ammp('label_seq_id')])
        };
    } else {
        return { 'chain-test': MS.core.rel.eq([MS.ammp('label_asym_id'), asymId]) };
    }
};

export const toRange = (start: number, end?: number) => {
    if (!end) return [start];
    const b = start < end ? start : end;
    const e = start < end ? end : start;
    return [...Array(e - b + 1)].map((_, i) => b + i);
};

const labelFromProps = (entryId: string, range: Range) => {

    const residues: number[] = (range.label_seq_id) ? toRange(range.label_seq_id.beg, range.label_seq_id.end) : [];
    const label = entryId + (range.label_asym_id ? `.${range.label_asym_id}` : '') +
        (residues && residues.length > 0 ? `:${residues[0]}` : '') +
        (residues && residues.length > 1 ? `-${residues[residues.length - 1]}` : '');
    return label;
};
