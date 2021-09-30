/**
 * Copyright (c) 2021 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Yana Rose
 */

import { StructureRepresentationPresetProvider } from 'molstar/lib/mol-plugin-state/builder/structure/representation-preset';
import { ParamDefinition as PD } from 'molstar/lib/mol-util/param-definition';
import { SelectionExpression } from '../selection';
import { StateObjectRef } from 'molstar/lib/mol-state';
import reprBuilder = StructureRepresentationPresetProvider.reprBuilder;
import updateFocusRepr = StructureRepresentationPresetProvider.updateFocusRepr;
import { StateTransform } from 'molstar/lib/mol-state/transform';

export const RcsbSuperpositionRepresentationPreset = StructureRepresentationPresetProvider({
    id: 'preset-superposition-representation-rcsb',
    display: {
        group: 'Superposition',
        name: 'Alignment',
        description: 'Show representations based on the structural alignment data.'
    },
    params: () => ({
        ...StructureRepresentationPresetProvider.CommonParams,
        selectionExpressions: PD.Value<SelectionExpression[]>([])
    }),
    async apply(ref, params, plugin) {
        const structureCell = StateObjectRef.resolveAndCheck(plugin.state.data, ref);
        if (!structureCell) return {};

        const structure = structureCell.obj!.data;
        const cartoonProps = { sizeFactor: structure.isCoarseGrained ? 0.8 : 0.2 };

        const components = Object.create(null);
        const representations = Object.create(null);

        for (const expr of params.selectionExpressions) {
            const comp = await plugin.builders.structure.tryCreateComponentFromExpression(structureCell, expr.expression, expr.label, { label: expr.label });
            Object.assign(components, { [expr.label]: comp });

            const { update, builder, typeParams, color } = reprBuilder(plugin, params);

            const typeProps = { ...typeParams };
            if (expr.type === 'cartoon') {
                Object.assign(typeProps, { ...cartoonProps });
            }

            const reprProps = {
                type: expr.type,
                typeParams: typeProps,
                color: color as any
            };
            if (expr.color) {
                Object.assign(reprProps, {
                    color: 'uniform',
                    colorParams: { value: expr.color }
                });
            }

            Object.assign(representations, {
                [expr.label]: builder.buildRepresentation(update, comp, reprProps, {
                    tag: expr.tag,
                    // this only hides the visuals but the state UI will still indicate them as visible
                    initialState: { isHidden: expr.isHidden || false }
                })
            });
            // make sure UI state is consistent
            if (comp?.cell?.state && expr.isHidden) {
                StateTransform.assignState(comp?.cell?.state, { isHidden: true });
            }

            await update.commit({ revertOnError: false });
        }

        // needed to apply same coloring scheme to focus representation
        await updateFocusRepr(plugin, structure, params.theme?.focus?.name, params.theme?.focus?.params);

        return representations;
    }
});