import { MolScriptBuilder as MS } from 'molstar/lib/mol-script/language/builder';
import { StructureSelectionQueries as Q } from 'molstar/lib/mol-plugin-state/helpers/structure-selection-query';
import { StructureRepresentationRegistry } from 'molstar/lib/mol-repr/structure/registry';
import { Expression } from 'molstar/lib/mol-script/language/expression';
import { QueryContext, Structure, StructureElement, StructureSelection } from 'molstar/lib/mol-model/structure';
import { compile } from 'molstar/lib/mol-script/runtime/query/compiler';

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
    // readonly authAsymId?: string
    readonly labelAsymId?: string
    /**
     * Mol*-internal UUID of a model.
     */
    readonly modelId?: string
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
    readonly modelId: string
    readonly labelAsymId: string
    readonly operatorName?: string
}
export type SelectSingle = {
    readonly labelSeqId: number
} & SelectBase;
export type SelectRange = {
    readonly labelSeqRange: Range
} & SelectBase;
export type SelectTarget = SelectSingle | SelectRange;

export type SelectionExpression = {
    tag: string
    type: StructureRepresentationRegistry.BuiltIn
    label: string
    expression: Expression
    isHidden?: boolean,
    color?: number
};

/**
 * This serves as adapter between the strucmotif-/BioJava-approach to identify transformed chains and the Mol* way.
 * Looks for 'structOperId', converts it to an 'operatorName', and removes the original value. This will
 * override pre-existing 'operatorName' values.
 * @param targets collection to process
 * @param structure parent structure
 * @param operatorName optional value to which missing operators are set
 */
export function normalizeTargets(targets: Target[], structure: Structure, operatorName = undefined): Target[] {
    return targets.map(t => {
        if (t.structOperId) {
            const { structOperId, ...others } = t;
            const oper = toOperatorName(structure, structOperId);
            return { ...others, operatorName: oper };
        }
        return t.operatorName ? t : { ...t, operatorName };
    });
}

function toOperatorName(structure: Structure, expression: string): string {
    function join(opers: any[]) {
        // this makes the assumptions that '1' is the identity operator
        if (!opers || !opers.length) return '1';
        if (opers.length > 1) {
            // Mol* operators are right-to-left
            return opers[1] + 'x' + opers[0];
        }
        return opers[0];
    }

    for (const unit of structure.units) {
        const assembly = unit.conformation.operator.assembly;
        if (!assembly) continue;

        if (expression === join(assembly.operList)) return `ASM_${assembly.operId}`;
    }
    // TODO better error handling?
    throw Error(`Unable to find expression '${expression}'`);
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

function targetsToExpression(targets: Target[]): Expression {
    const expressions = targets.map(t => targetToExpression(t));
    return MS.struct.combinator.merge(expressions);
}

function targetToExpression(target: Target): Expression {
    const residueTests: Expression[] = [];
    const chainTests: Expression[] = [];
    const tests: { 'residue-test': Expression, 'chain-test': Expression } = Object.create(null);

    if (target.authSeqId) {
        residueTests.push(MS.core.rel.eq([target.authSeqId, MS.ammp('auth_seq_id')]));
    } else if (target.labelSeqId) {
        residueTests.push(MS.core.rel.eq([target.labelSeqId, MS.ammp('label_seq_id')]));
    } else if (target.labelSeqRange) {
        residueTests.push(MS.core.rel.inRange([MS.ammp('label_seq_id'), target.labelSeqRange.beg, target.labelSeqRange.end ?? target.labelSeqRange.beg]));
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