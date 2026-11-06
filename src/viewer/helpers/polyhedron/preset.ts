/**
 * Copyright (c) 2026 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Yana Rose <yana.rose@rcsb.org>
 */

import {
    PresetStructureRepresentations,
    StructureRepresentationPresetProvider
} from 'molstar/lib/mol-plugin-state/builder/structure/representation-preset';
import { StateObjectRef } from 'molstar/lib/mol-state';
import { MolScriptBuilder as MS } from 'molstar/lib/mol-script/language/builder';
import { ElementNames, isMetal } from 'molstar/lib/mol-model/structure/model/properties/atomic/types';
import { ElementSymbol } from 'molstar/lib/mol-model/structure/model/types';
import { ObjectKeys } from 'molstar/lib/mol-util/type-helpers';
import { ParamDefinition as PD } from 'molstar/lib/mol-util/param-definition';
import { Expression } from 'molstar/lib/mol-script/language/expression';
import { Target } from '../selection';

const MetalSymbols = ObjectKeys(ElementNames).filter(e => isMetal(e as ElementSymbol));

/**
 * Metal atoms of non-polymer entities, i.e. ligands (SF4, FES, HEM, ...) and ions (ZN, MG, ...).
 * If `chain.labelAsymId` is set, only metals with exactly that label_asym_id are included (auth_asym_id is
 * deliberately not used: it is shared by all ligands bound to an author chain). `operatorName` additionally
 * restricts to a single symmetry copy.
 */
function ligandMetalsExpression(chain?: Target): Expression {
    const chainTests: Expression[] = [];
    if (chain?.labelAsymId) {
        chainTests.push(MS.core.rel.eq([MS.ammp('label_asym_id'), chain.labelAsymId]));
        if (chain.operatorName) chainTests.push(MS.core.rel.eq([MS.acp('operatorName'), chain.operatorName]));
    }

    return MS.struct.generator.atomGroups({
        'entity-test': MS.core.rel.eq([MS.ammp('entityType'), 'non-polymer']),
        ...(chainTests.length > 0 ? { 'chain-test': chainTests.length === 1 ? chainTests[0] : MS.core.logic.and(chainTests) } : {}),
        'atom-test': MS.core.set.has([MS.set(...MetalSymbols), MS.acp('elementSymbol')]),
    });
}

/**
 * Same as 'Polymer & Ligand', plus Mol*'s 'polyhedron' representation for the coordination sites of
 * ligand/ion metal atoms. `includeParent` makes the coordination sites to be computed on the whole
 * structure, so protein atoms coordinating the metal (e.g. Cys SG for SF4) are polyhedron vertices.
 */
export const CoordinationPolyhedronPreset = StructureRepresentationPresetProvider({
    id: 'preset-structure-representation-rcsb-coordination-polyhedron',
    display: {
        name: 'Ligand Coordination Polyhedra', group: 'Miscellaneous',
        description: 'Shows polymers as Cartoon, ligands as Ball & Stick and coordination polyhedra around metal atoms of ligands and ions.'
    },
    params: () => ({
        ...StructureRepresentationPresetProvider.CommonParams,
        /** Only create polyhedra for metal atoms in this chain; all ligand/ion metals if not set. */
        chain: PD.Value<Target | undefined>(undefined, { isHidden: true }),
    }),
    async apply(ref, params, plugin) {
        const structureCell = StateObjectRef.resolveAndCheck(plugin.state.data, ref);
        if (!structureCell?.obj) return {};

        const base = await PresetStructureRepresentations['polymer-and-ligand'].apply(ref, params, plugin);

        const metals = await plugin.builders.structure.tryCreateComponentFromExpression(structureCell, ligandMetalsExpression(params.chain), 'ligand-metals', { label: 'Metal Coordination' });
        const { update, builder, typeParams } = StructureRepresentationPresetProvider.reprBuilder(plugin, params, structureCell.obj.data);
        const polyhedron = builder.buildRepresentation(update, metals, {
            type: 'polyhedron',
            typeParams: { ...typeParams, includeParent: true },
            color: 'element-symbol'
        }, { tag: 'ligand-metals-polyhedron' });
        await update.commit({ revertOnError: false });

        return {
            components: { ...base.components, metals },
            representations: { ...base.representations, polyhedron }
        };
    }
});
