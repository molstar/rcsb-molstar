

import { StructureRepresentationPresetProvider } from 'molstar/lib/mol-plugin-state/builder/structure/representation-preset';
import { ParamDefinition as PD } from 'molstar/lib/mol-util/param-definition';
import { StateObjectRef } from 'molstar/lib/mol-state';
import reprBuilder = StructureRepresentationPresetProvider.reprBuilder;
import updateFocusRepr = StructureRepresentationPresetProvider.updateFocusRepr;
import { MolScriptBuilder as MS } from 'molstar/lib/mol-script/language/builder';
import { StateTransform } from 'molstar/lib/mol-state/transform';

export const RcsbChainRepresentationPreset = StructureRepresentationPresetProvider({
    id: 'preset-superposition-representation-rcsb',
    display: {
        group: 'Chain',
        name: 'Chain Representation',
        description: 'Show representations based on the given chain asymId.'
    },
    params: () => ({
        ...StructureRepresentationPresetProvider.CommonParams,
        asymId: PD.Value<string>("A"),
        colorTheme: PD.Value<string>('sequence-id'),
    }),
    async apply(ref, params, plugin) {
        const structureCell = StateObjectRef.resolveAndCheck(plugin.state.data, ref);
        if (!structureCell) return {};
        const structure = structureCell.obj!.data;
        const cartoonProps = { sizeFactor: structure.isCoarseGrained ? 0.8 : 0.2 };
        const components = Object.create(null);
        const representations = Object.create(null);
        const chain = await plugin.builders.structure.tryCreateComponentFromExpression(structureCell, chainSelection(params.asymId), `Chain ${params.asymId}`);
        Object.assign(components, { [`Chain ${params.asymId}`]: chain });
        const { update, builder, typeParams } = reprBuilder(plugin, params);
        const typeProps = { typeParams,...cartoonProps };
        const reprProps = {
            typeParams: typeProps,
            color: params.colorTheme as any
        };
        Object.assign(representations, {
            [`Chain ${params.asymId}`]: builder.buildRepresentation(update, chain, reprProps, {
                tag: `Chain ${params.asymId}`,
                // this only hides the visuals but the state UI will still indicate them as visible
                initialState: { isHidden: false }
            })
        });
        // make sure UI state is consistent
        if (chain?.cell?.state) {
            StateTransform.assignState(chain?.cell?.state, { isHidden: false });
        }
        await update.commit({ revertOnError: false });
        // needed to apply same coloring scheme to focus representation
        await updateFocusRepr(plugin, structure, params.theme?.focus?.name, params.theme?.focus?.params);
        return representations;
    }
});

function chainSelection(auth_asym_id: string) {
    return MS.struct.generator.atomGroups({
        'chain-test': MS.core.rel.eq([MS.struct.atomProperty.macromolecular.auth_asym_id(), auth_asym_id])
    });
}