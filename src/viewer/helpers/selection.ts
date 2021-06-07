import { MolScriptBuilder as MS } from 'molstar/lib/mol-script/language/builder';
import { StructureSelectionQueries as Q } from 'molstar/lib/mol-plugin-state/helpers/structure-selection-query';
import { StructureRepresentationRegistry } from 'molstar/lib/mol-repr/structure/registry';
import { Expression } from 'molstar/lib/mol-script/language/expression';
import { QueryContext, Structure, StructureElement, StructureSelection } from 'molstar/lib/mol-model/structure';
import { compile } from 'molstar/lib/mol-script/runtime/query/compiler';

export type Target = {
    readonly auth_seq_id?: number
    readonly label_seq_id?: number
    readonly label_comp_id?: string
    readonly label_asym_id?: string
    // TODO add support for 'operators'
}

export type Range = {
    label_asym_id: string
    label_seq_id?: { beg: number, end?: number }
}

export const toRange = (start: number, end?: number) => {
    if (!end) return [start];
    const b = start < end ? start : end;
    const e = start < end ? end : start;
    return [...Array(e - b + 1)].map((_, i) => b + i);
};

export type SelectionExpression = {
    tag: string
    type: StructureRepresentationRegistry.BuiltIn
    label: string
    expression: Expression
    isHidden?: boolean,
    color?: number
};

/**
 * Convert a selection to an array of selection expressions.
 * @param labelBase the base label that will appear in the UI (e.g., the entry ID)
 * @param selection a selection by Range or a set of Targets
 */
export function createSelectionExpression(labelBase: string, selection?: Range | Target[]): SelectionExpression[] {
    if (selection) {
        if ('label_asym_id' in selection && 'label_seq_id' in selection) {
            const range = selection as Range;
            const residues: number[] = (range.label_seq_id) ? toRange(range.label_seq_id.beg, range.label_seq_id.end) : [];
            const test = rangeToTest(range.label_asym_id, residues);
            const label = labelFromProps(labelBase, range);
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

const labelFromProps = (entryId: string, range: Range) => {
    const residues: number[] = (range.label_seq_id) ? toRange(range.label_seq_id.beg, range.label_seq_id.end) : [];
    return entryId + (range.label_asym_id ? `.${range.label_asym_id}` : '') +
        (residues && residues.length > 0 ? `:${residues[0]}` : '') +
        (residues && residues.length > 1 ? `-${residues[residues.length - 1]}` : '');
};

export function rangeToTest(asymId: string, residues: number[]) {
    if (residues.length > 0) {
        return {
            'chain-test': MS.core.rel.eq([MS.ammp('label_asym_id'), asymId]),
            'residue-test': MS.core.set.has([MS.set(...residues), MS.ammp('label_seq_id')])
        };
    } else {
        return { 'chain-test': MS.core.rel.eq([MS.ammp('label_asym_id'), asymId]) };
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
        chainTests.push(MS.core.rel.eq([target.label_asym_id, MS.ammp('label_asym_id')]));
    }
    // TODO add support for 'operators'

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