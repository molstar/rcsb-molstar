import { PluginStateTransform, PluginStateObject as SO } from 'molstar/lib/mol-plugin-state/objects';
import { RootStructureDefinition } from 'molstar/lib/mol-plugin-state/helpers/root-structure';
import { PluginContext } from 'molstar/lib/mol-plugin/context';
import { Task } from 'molstar/lib/mol-task';
import { ParamDefinition as PD } from 'molstar/lib/mol-util/param-definition';
import { PropsetProps, createTest, createRange } from '../preset';
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

            const blocks: Structure[] = []
            for (const p of selection) {
                const residues: number[] = (p.beg && p.end) ? createRange(p.beg, p.end) : [];
                const test = createTest(p.asymId, residues);
                const expression = MS.struct.generator.atomGroups(test);
                const { selection: sele } = StructureQueryHelper.createAndRun(base.data, expression);
                const s = StructureSelection.unionStructure(sele);
                if (!p.matrix) {
                    blocks.push(s);
                } else {
                    const ts = Structure.transform(s, p.matrix);
                    blocks.push(ts);
                }
            }

            const builder = Structure.Builder()
            for (const b of blocks) {
                for (const u of b.units) {
                    builder.addUnit(u.kind, u.model, u.conformation.operator, u.elements, u.traits, u.invariantId);
                }
            }

            const blockStructure = builder.getStructure();
            return new SO.Molecule.Structure(blockStructure)
        });
    },
    dispose({ b }) {
        b?.data.customPropertyDescriptors.dispose();
    }
});