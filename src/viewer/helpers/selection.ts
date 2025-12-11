import { MolScriptBuilder as MS } from 'molstar/lib/mol-script/language/builder';
import { StructureSelectionQueries as Q } from 'molstar/lib/mol-plugin-state/helpers/structure-selection-query';
import { StructureRepresentationRegistry } from 'molstar/lib/mol-repr/structure/registry';
import { Expression } from 'molstar/lib/mol-script/language/expression';
import { QueryContext, Structure, StructureElement, StructureProperties, StructureSelection } from 'molstar/lib/mol-model/structure';
import { compile } from 'molstar/lib/mol-script/runtime/query/compiler';
import { GlyGenProps } from './preset';
import { Unit } from 'molstar/lib/mol-model/structure/structure/unit';
import { join } from '../ui/strucmotif/helpers';

export type Range = {
    readonly beg: number
    readonly end?: number
}

export type Target = {
    readonly authSeqId?: number
    // readonly authSeqRange?: Range
    readonly labelSeqId?: number
    readonly labelSeqRange?: Range
    readonly labelCompId?: string
    readonly authAsymId?: string
    readonly labelAsymId?: string
    /**
     * Mol*-internal UUID of a model.
     */
    readonly modelId?: string

    readonly modelNum?: number
    /**
     * Mol*-internal representation, like 'ASM_2'. Enumerated in the order of appearance in the source file. If
     * possible, specify the assemblyId when using this selector.
     */
    readonly operatorName?: string
    /**
     * Strucmotif-/BioJava-specific representation, like 'Px42'. This is a single 'pdbx_struct_oper_list.id' value or a
     * combination thereof. Specify the assemblyId when using this selector. Order matters, use order as specified in
     * the source CIF file.
     */
    readonly structOperId?: string
    /**
     * Extend selection to whole chain, by default only the first residue is selected. This is used by the
     * oligoInteraction preset in rcsb-sierra, which should focus the whole oligo chain. Not wanted for the
     * ligandInteraction preset, which would otherwise focus alternative conformations and symmetry mates.
     */
    readonly extendToChain?: boolean
}

export type SelectBase = {
    readonly modelId?: string
    readonly modelNum?: number
    readonly labelAsymId: string
    readonly operatorName?: string
}
export type SelectSingle = Required<Pick<Target, 'labelAsymId' | 'labelSeqId'>> & Omit<Target, 'labelAsymId' | 'labelSeqId'>
export type SelectRange = {
    readonly labelSeqRange: Range
} & Required<Pick<Target, 'labelAsymId'>> & Omit<Target, 'labelAsymId'>;

export type SelectTarget = SelectSingle | SelectRange;

export type SelectionExpression = {
    tag: string
    type: StructureRepresentationRegistry.BuiltIn
    label: string
    expression: Expression
    isHidden?: boolean,
    color?: number,
    alpha?: number
};

/**
 * This serves as adapter between the strucmotif-/BioJava-approach to identify transformed chains and the Mol* way.
 * Looks for 'structOperId', converts it to an 'operatorName', and removes the original value. This will
 * override pre-existing 'operatorName' values.
 * @param target object to process
 * @param structure parent structure
 * @param operatorName optional value to which missing operators are set
 */
export function normalizeTarget(target: Target, structure: Structure, operatorName = undefined): Target {
    if (target.structOperId) {
        const { structOperId, ...others } = target;
        const oper = toOperatorName(structure, structOperId);
        return { ...others, operatorName: oper };
    }
    return target.operatorName ? target : { ...target, operatorName };
}

function toOperatorName(structure: Structure, expression: string): string {
    let isAssemblyDefined = false;

    for (const unit of structure.units) {
        const assembly = unit.conformation.operator.assembly;
        if (!assembly) continue;

        isAssemblyDefined = true;
        const { operList, operId } = assembly;

        if (expression === join(operList)) {
            return `ASM_${operId}`;
        }
    }
    if (isAssemblyDefined) {
        // TODO better error handling?
        throw Error(`Assemblies exist, but no matching operator expression found: '${expression}'`);
    }
    // Assemblies are not defined; return identity operator
    return '1_555';
}

/**
 * Convert a selection to an array of selection expressions.
 * @param labelBase the base label that will appear in the UI (e.g., the entry ID)
 * @param selection a selection by Range or a set of Targets
 */
export function createSelectionExpressions(labelBase: string, selection?: Target | Target[]): SelectionExpression[] {
    if (selection) {
        if ('labelAsymId' in selection) {
            const target = selection as Target;
            const residues: number[] = (target.labelSeqRange) ? toRange(target.labelSeqRange!.beg, target.labelSeqRange!.end) : [];
            const test = rangeToTest(target.labelAsymId!, residues);
            const label = labelFromProps(labelBase, target.labelAsymId, residues);
            return [{
                expression: MS.struct.generator.atomGroups(test),
                label: `${label}`,
                type: 'cartoon',
                tag: 'polymer'
            }];
        } else if (Array.isArray(selection)) {
            const expression = targetsToExpression(selection);
            return [{
                expression: expression,
                label: `${labelBase}`,
                type: 'ball-and-stick',
                tag: 'polymer'
            }];
        } else {
            throw Error('Unable to handle selection: ' + selection);
        }
    } else {
        return [
            {
                expression: Q.polymer.expression,
                label: `${labelBase} - Polymers`,
                type: 'cartoon',
                tag: 'polymer'
            },
            {
                expression: Q.ligand.expression,
                label: `${labelBase} - Ligands`,
                type: 'ball-and-stick',
                tag: 'ligand'
            },
            {
                expression: Q.ion.expression,
                label: `${labelBase} - Ions`,
                type: 'ball-and-stick',
                tag: 'ion'
            },
            {
                expression: Q.branched.expression,
                label: `${labelBase} - Carbohydrates`,
                type: 'ball-and-stick',
                tag: 'branched-ball-and-stick',
                alpha: 0.3
            },
            {
                expression: Q.branched.expression,
                label: `${labelBase} - Carbohydrates`,
                type: 'carbohydrate',
                tag: 'branched-snfg-3d'
            },
            {
                expression: Q.lipid.expression,
                label: `${labelBase} - Lipids`,
                type: 'ball-and-stick',
                tag: 'lipid'
            },
            {
                expression: Q.water.expression,
                label: `${labelBase} - Waters`,
                type: 'ball-and-stick',
                tag: 'water'
            }
        ];
    }
}

export function createGlyGenSelectionExpressions(p: GlyGenProps, label: string): SelectionExpression[] {
    // TODO migrate this and other composable presets to MVS
    const glycoChains = MS.set(...p.glycosylation.map(t => t.labelAsymId!));
    return [
        {
            expression: MS.struct.generator.atomGroups({ 'chain-test': MS.core.rel.eq([MS.ammp('label_asym_id'), p.focus.labelAsymId!]) }),
            label: `Chain ${p.focus.labelAsymId}`,
            type: 'cartoon',
            tag: 'polymer'
        },
        {
            expression: MS.struct.generator.atomGroups({ 'chain-test': MS.core.set.has([glycoChains, MS.ammp('label_asym_id')]) }),
            label: 'Glycosylation',
            type: 'carbohydrate',
            tag: 'carbohydrate'
        },
        ...createSelectionExpressions(label).map(e => { return { ...e, alpha: 0.21 }; })
    ];
}

export const toRange = (start: number, end?: number) => {
    if (!end) return [start];
    const b = start < end ? start : end;
    const e = start < end ? end : start;
    return [...Array(e - b + 1)].map((_, i) => b + i);
};

const labelFromProps = (entryId: string, labelAsymId?: string, range?: number[]) => {
    return entryId + (labelAsymId ? `.${labelAsymId}` : '') +
        (range && range.length > 0 ? `:${range[0]}` : '') +
        (range && range.length > 1 ? `-${range[range.length - 1]}` : '');
};

export function rangeToTest(asymId: string, residues: number[], operatorName?: string) {
    const chainTests: Expression[] = [MS.core.rel.eq([MS.ammp('label_asym_id'), asymId])];
    if (operatorName)
        chainTests.push(MS.core.rel.eq([operatorName, MS.acp('operatorName')]));

    if (residues.length > 0) {
        return {
            'chain-test': MS.core.logic.and(chainTests),
            'residue-test': MS.core.set.has([MS.set(...residues), MS.ammp('label_seq_id')])
        };
    } else {
        return { 'chain-test': MS.core.logic.and(chainTests) };
    }
}

export function targetToLoci(target: Target, structure: Structure): StructureElement.Loci {
    const expression = targetToExpression(target);
    const query = compile<StructureSelection>(expression);
    const selection = query(new QueryContext(structure));
    return StructureSelection.toLociWithSourceUnits(selection);
}

export function lociToTargets(loci: StructureElement.Loci): Target[] {
    const keys = new Set();
    const targets: Target[] = [];
    StructureElement.Loci.forEachLocation(loci, location => {
        if (!Unit.isAtomic(location.unit)) return;
        const label_asym_id = StructureProperties.chain.label_asym_id(location);
        const auth_asym_id = StructureProperties.chain.auth_asym_id(location);
        const label_seq_id = StructureProperties.residue.label_seq_id(location);
        const auth_seq_id = StructureProperties.residue.auth_seq_id(location);
        const label_comp_id = StructureProperties.atom.label_comp_id(location);
        const struct_oper_list_ids = StructureProperties.unit.pdbx_struct_oper_list_ids(location);
        const struct_oper_id = join(struct_oper_list_ids);
        // canonical key string
        const key = [label_asym_id, auth_asym_id, label_seq_id, auth_seq_id, label_comp_id, struct_oper_id].join('|');
        if (!keys.has(key)) {
            // Pushing only unique targets
            keys.add(key);
            targets.push({
                labelAsymId: label_asym_id,
                authAsymId: auth_asym_id,
                labelSeqId: label_seq_id,
                authSeqId: auth_seq_id,
                labelCompId: label_comp_id,
                structOperId: struct_oper_id
            });
        }
    });
    return targets;
};

function targetsToExpression(targets: Target[]): Expression {
    const expressions = targets.map(t => targetToExpression(t));
    return MS.struct.combinator.merge(expressions);
}

export function targetToExpression(target: Target): Expression {
    const residueTests: Expression[] = [];
    const chainTests: Expression[] = [];
    const tests: { 'residue-test': Expression, 'chain-test': Expression } = Object.create(null);

    if (target.authSeqId) {
        residueTests.push(MS.core.rel.eq([target.authSeqId, MS.ammp('auth_seq_id')]));
    } else if (target.labelSeqId) {
        residueTests.push(MS.core.rel.eq([target.labelSeqId, MS.ammp('label_seq_id')]));
    } else if (target.labelSeqRange) {
        residueTests.push(MS.struct.atomProperty.ihm.overlapsSeqIdRange({
            beg: target.labelSeqRange.beg,
            end: (target.labelSeqRange.end ?? target.labelSeqRange.beg)
        }));
    }
    if (target.labelCompId) {
        residueTests.push(MS.core.rel.eq([target.labelCompId, MS.ammp('label_comp_id')]));
    }
    if (residueTests.length === 1) {
        tests['residue-test'] = residueTests[0];
    } else if (residueTests.length > 1) {
        tests['residue-test'] = MS.core.logic.and(residueTests);
    }

    if (target.labelAsymId) {
        chainTests.push(MS.core.rel.eq([target.labelAsymId, MS.ammp('label_asym_id')]));
    }
    if (target.operatorName) {
        chainTests.push(MS.core.rel.eq([target.operatorName, MS.acp('operatorName')]));
    }

    if (chainTests.length === 1) {
        tests['chain-test'] = chainTests[0];
    } else if (chainTests.length > 1) {
        tests['chain-test'] = MS.core.logic.and(chainTests);
    }

    if (Object.keys(tests).length > 0) {
        return MS.struct.modifier.union([
            MS.struct.generator.atomGroups(tests)
        ]);
    } else {
        return MS.struct.generator.empty;
    }
}