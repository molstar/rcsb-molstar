import { PluginStateTransform, PluginStateObject as SO } from 'molstar/lib/mol-plugin-state/objects';
import { RootStructureDefinition } from 'molstar/lib/mol-plugin-state/helpers/root-structure';
import { PluginContext } from 'molstar/lib/mol-plugin/context';
import { Task } from 'molstar/lib/mol-task';
import { ParamDefinition as PD } from 'molstar/lib/mol-util/param-definition';
import { AlignmentProps } from '../preset';
import { StructureQueryHelper } from 'molstar/lib/mol-plugin-state/helpers/structure-query';
import { MolScriptBuilder as MS } from 'molstar/lib/mol-script/language/builder';
import { StructureSelection, Structure } from 'molstar/lib/mol-model/structure';
import { rangeToTest, toRange } from '../selection';

export { FlexibleStructureFromModel as FlexibleStructureFromModel };
type FlexibleStructureFromModel = typeof FlexibleStructureFromModel
const FlexibleStructureFromModel = PluginStateTransform.BuiltIn({
    name: 'flexible-structure-from-model',
    display: { name: 'Flexible Structure', description: 'Create a molecular structure from independently transformed substructures.' },
    from: SO.Molecule.Model,
    to: SO.Molecule.Structure,
    isDecorator: true,
    params(_a) {
        return {
            targets: PD.Value<AlignmentProps['targets']>([])
        };
    }
})({
    apply({ a, params }, plugin: PluginContext) {
        return Task.create('Build Flexible Structure', async ctx => {
            const base = await RootStructureDefinition.create(plugin, ctx, a.data);
            const { targets } = params;
            if (!targets?.length) return base;

            const selectChains: string[] = [];
            const selectBlocks: Structure[][] = [];
            for (const target of targets) {
                if (!target.labelAsymId) continue;

                if (!selectChains.includes(target.labelAsymId)) {
                    selectChains.push(target.labelAsymId);
                    selectBlocks.push([]);
                }
                const residues: number[] = (target.labelSeqRange) ? toRange(target.labelSeqRange.beg, target.labelSeqRange.end) : [];
                const test = rangeToTest(target.labelAsymId, residues);
                const expression = MS.struct.generator.atomGroups(test);
                const { selection: sele } = StructureQueryHelper.createAndRun(base.data, expression);
                const s = StructureSelection.unionStructure(sele);
                if (!target.matrix) {
                    selectBlocks[selectChains.indexOf(target.labelAsymId)].push(s);
                } else {
                    const ts = Structure.transform(s, target.matrix);
                    selectBlocks[selectChains.indexOf(target.labelAsymId)].push(ts);
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