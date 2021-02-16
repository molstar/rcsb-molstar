import { PluginStateTransform, PluginStateObject as SO } from 'molstar/lib/mol-plugin-state/objects';
import { RootStructureDefinition } from 'molstar/lib/mol-plugin-state/helpers/root-structure';
import { PluginContext } from 'molstar/lib/mol-plugin/context';
import { Task } from 'molstar/lib/mol-task';
import { ParamDefinition as PD } from 'molstar/lib/mol-util/param-definition';
import { PropsetProps, selectionTest, toRange } from '../preset';
import { StructureQueryHelper } from 'molstar/lib/mol-plugin-state/helpers/structure-query';
import { MolScriptBuilder as MS } from 'molstar/lib/mol-script/language/builder';
import { StructureSelection, Structure } from 'molstar/lib/mol-model/structure';

export { FlexibleStructureFromModel as FlexibleStructureFromModel };
type FlexibleStructureFromModel = typeof FlexibleStructureFromModel
const FlexibleStructureFromModel = PluginStateTransform.BuiltIn({
    name: 'flexible-structure-from-model',
    display: { name: 'Flexible Structure', description: 'Create a molecular structure from independently transformed substructures.' },
    from: SO.Molecule.Model,
    to: SO.Molecule.Structure,
    isDecorator: true,
    params(a) {
        return {
            selection: PD.Value<PropsetProps['selection']>([])
        };
    }
})({
    apply({ a, params }, plugin: PluginContext) {
        return Task.create('Build Flexible Structure', async ctx => {
            const base = await RootStructureDefinition.create(plugin, ctx, a.data);
            const { selection } = params;
            if (!selection?.length) return base;

            const selectChains: string[] = [];
            const selectBlocks: Structure[][] = [];
            for (const p of selection) {
                if (!selectChains.includes(p.label_asym_id)) {
                    selectChains.push(p.label_asym_id);
                    selectBlocks.push([]);
                }
                const residues: number[] = (p.label_seq_id) ? toRange(p.label_seq_id.beg, p.label_seq_id.end) : [];
                const test = selectionTest(p.label_asym_id, residues);
                const expression = MS.struct.generator.atomGroups(test);
                const { selection: sele } = StructureQueryHelper.createAndRun(base.data, expression);
                const s = StructureSelection.unionStructure(sele);
                if (!p.matrix) {
                    selectBlocks[selectChains.indexOf(p.label_asym_id)].push(s);
                } else {
                    const ts = Structure.transform(s, p.matrix);
                    selectBlocks[selectChains.indexOf(p.label_asym_id)].push(ts);
                }
            }

            const builder = Structure.Builder({ label: base.data.label });
            for (const blocks of selectBlocks) {
                if (blocks.length === 1) {
                    const u = blocks[0].units[0];
                    builder.addUnit(u.kind, u.model, u.conformation.operator, u.elements, u.traits, u.invariantId);
                } else {
                    builder.beginChainGroup();
                    for (const b of blocks) {
                        const u = b.units[0];
                        builder.addUnit(u.kind, u.model, u.conformation.operator, u.elements, u.traits, u.invariantId);
                    }
                    builder.endChainGroup();
                }
            }

            const blockStructure = builder.getStructure();
            return new SO.Molecule.Structure(blockStructure, { label: base.data.label });
        });
    },
    dispose({ b }) {
        b?.data.customPropertyDescriptors.dispose();
    }
});