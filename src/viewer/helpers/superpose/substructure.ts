import { PluginStateTransform, PluginStateObject as SO } from 'molstar/lib/mol-plugin-state/objects';
import { RootStructureDefinition } from 'molstar/lib/mol-plugin-state/helpers/root-structure';
import { PluginContext } from 'molstar/lib/mol-plugin/context';
import { Task } from 'molstar/lib/mol-task';
import { ParamDefinition as PD } from 'molstar/lib/mol-util/param-definition';
import { MotifProps, selectionTest } from '../preset';
import { StructureQueryHelper } from 'molstar/lib/mol-plugin-state/helpers/structure-query';
import { MolScriptBuilder as MS } from 'molstar/lib/mol-script/language/builder';
import { StructureSelection, Structure } from 'molstar/lib/mol-model/structure';

export const SubstructureFromModel = PluginStateTransform.BuiltIn({
    name: 'substructure-from-model',
    display: { name: 'Substructure', description: 'Create a molecular substructure.' },
    from: SO.Molecule.Model,
    to: SO.Molecule.Structure,
    isDecorator: true,
    params(a) {
        return {
            targets: PD.Value<MotifProps['targets']>([])
        };
    }
})({
    apply({ a, params }, plugin: PluginContext) {
        return Task.create('Build Substructure', async ctx => {
            const base = await RootStructureDefinition.create(plugin, ctx, a.data);
            const { targets } = params;
            if (!targets?.length) return base;

            const selectChains: string[] = [];
            const selectBlocks: Structure[][] = [];
            for (const target of targets) {
                const asymId = target.label_asym_id!;
                if (!selectChains.includes(asymId)) {
                    selectChains.push(asymId);
                    selectBlocks.push([]);
                }
                const test = selectionTest(asymId, [target.label_seq_id!]);
                const expression = MS.struct.generator.atomGroups(test);
                const { selection: sele } = StructureQueryHelper.createAndRun(base.data, expression);
                const s = StructureSelection.unionStructure(sele);
                selectBlocks[selectChains.indexOf(asymId)].push(s);
            }

            const builder = Structure.Builder({ label: base.data.label });
            for (const blocks of selectBlocks) {
                builder.beginChainGroup();
                for (const b of blocks) {
                    const u = b.units[0];
                    builder.addUnit(u.kind, u.model, u.conformation.operator, u.elements, u.traits, u.invariantId);
                }
                builder.endChainGroup();
            }

            const blockStructure = builder.getStructure();
            console.log(base.data.label);
            return new SO.Molecule.Structure(blockStructure, { label: base.data.label });
        });
    },
    dispose({ b }) {
        b?.data.customPropertyDescriptors.dispose();
    }
});