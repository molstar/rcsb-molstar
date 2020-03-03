/**
 * Copyright (c) 2020 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import { StructureViewerState } from '../types';
import { getStructureSize, StructureSize } from './util';
import { PluginContext } from 'molstar/lib/mol-plugin/context';
import { Structure, StructureSelection, QueryContext, StructureElement } from 'molstar/lib/mol-model/structure';
import { Loci } from 'molstar/lib/mol-model/loci';
import { Axes3D } from 'molstar/lib/mol-math/geometry';
import { Vec3 } from 'molstar/lib/mol-math/linear-algebra';
import { ValidationReport } from 'molstar/lib/mol-model-props/rcsb/validation-report';
import { StructureSelectionQueries as SSQ } from 'molstar/lib/mol-plugin/util/structure-selection-helper';
import { MolScriptBuilder as MS } from 'molstar/lib/mol-script/language/builder';
import { AssemblySymmetry, AssemblySymmetryProvider } from 'molstar/lib/mol-model-props/rcsb/assembly-symmetry';
import Expression from 'molstar/lib/mol-script/language/expression';
import { compile } from 'molstar/lib/mol-script/runtime/query/compiler';
import { Color } from 'molstar/lib/mol-util/color';

type Target = {
    readonly auth_seq_id?: number
    readonly label_seq_id?: number
    readonly label_comp_id?: string
    readonly label_asym_id?: string
}

function targetToExpression(target: Target): Expression {
    const residueTests: Expression[] = []
    const tests = Object.create(null)

    if (target.auth_seq_id) {
        residueTests.push(MS.core.rel.eq([target.auth_seq_id, MS.ammp('auth_seq_id')]))
    } else if (target.label_seq_id) {
        residueTests.push(MS.core.rel.eq([target.label_seq_id, MS.ammp('label_seq_id')]))
    }
    if (target.label_comp_id) {
        residueTests.push(MS.core.rel.eq([target.label_comp_id, MS.ammp('label_comp_id')]))
    }
    if (residueTests.length === 1) {
        tests['residue-test'] = residueTests[0]
    } else if (residueTests.length > 1) {
        tests['residue-test'] = MS.core.logic.and(residueTests)
    }

    if (target.label_asym_id) {
        tests['chain-test'] = MS.core.rel.eq([target.label_asym_id, MS.ammp('label_asym_id')])
    }

    if (Object.keys(tests).length > 0) {
        return MS.struct.modifier.union([
            MS.struct.generator.atomGroups(tests)
        ])
    } else {
        return MS.struct.generator.all
    }
}

type BaseProps = {
    assemblyId?: string
    modelIndex?: number
}

type ValidationProps = {
    kind: 'validation'
    colorTheme?: string
    showClashes?: boolean
} & BaseProps

type StandardProps = {
    kind: 'standard'
} & BaseProps

type SymmetryProps = {
    kind: 'symmetry'
    symmetryIndex?: number
} & BaseProps

type FeatureProps = {
    kind: 'feature'
    target: Target
} & BaseProps

export type PresetProps = ValidationProps | StandardProps | SymmetryProps | FeatureProps

export class PresetManager {
    get customState() {
        return this.plugin.customState as StructureViewerState
    }

    async apply(props?: PresetProps) {
        if (!props) props = { kind: 'standard', assemblyId: 'deposited' }

        switch (props.kind) {
            case 'feature':
                return this.feature(props.target, props.assemblyId, props.modelIndex)
            case 'standard':
                return this.standard(props.assemblyId, props.modelIndex)
            case 'symmetry':
                return this.symmetry(props.symmetryIndex, props.assemblyId, props.modelIndex)
            case 'validation':
                return this.validation(props.colorTheme, props.showClashes, props.assemblyId, props.modelIndex)
        }
    }

    async default() {
        const assembly = this.customState.structureView.getAssembly()?.obj
        if (!assembly || assembly.data.isEmpty) return

        const r = this.plugin.helpers.structureRepresentation
        const size = getStructureSize(assembly.data)

        if (size === StructureSize.Gigantic) {
            await r.clearExcept(['gaussian-surface'])
            await r.setFromExpression('only', 'gaussian-surface', SSQ.trace.expression, {
                repr: {
                    radiusOffset: 1,
                    smoothness: 0.5,
                    visuals: ['structure-gaussian-surface-mesh']
                }
            })
        } else if(size === StructureSize.Huge) {
            await r.clearExcept(['gaussian-surface'])
            await r.setFromExpression('add', 'gaussian-surface', SSQ.polymer.expression, {
                repr: {
                    smoothness: 0.5
                },
            })
        } else if(size === StructureSize.Large) {
            await r.clearExcept(['cartoon'])
            await r.setFromExpression('only', 'cartoon', SSQ.polymer.expression)
        } else if(size === StructureSize.Medium) {
            await r.clearExcept(['cartoon', 'carbohydrate', 'ball-and-stick'])
            await r.setFromExpression('only', 'cartoon', SSQ.polymer.expression)
            await r.setFromExpression('only', 'carbohydrate', SSQ.branchedPlusConnected.expression)
            await r.setFromExpression('only', 'ball-and-stick', MS.struct.modifier.union([
                MS.struct.combinator.merge([
                    SSQ.ligandPlusConnected.expression,
                    SSQ.branchedConnectedOnly.expression,
                    SSQ.disulfideBridges.expression,
                    SSQ.nonStandardPolymer.expression,
                    // SSQ.water.expression
                ])
            ]))
        } else if(size === StructureSize.Small) {
            await r.clearExcept(['ball-and-stick'])
            await r.setFromExpression('only', 'ball-and-stick', MS.struct.modifier.union([
                MS.struct.modifier.exceptBy({
                    0: MS.struct.generator.all(),
                    by: SSQ.water.expression
                })
            ]))
        }
    }

    async standard(assemblyId?: string, modelIndex?: number) {
        await this.ensureAssembly(assemblyId, modelIndex)
        await this.customState.structureView.setSymmetry(-1)
        await this.default()
        this.focusOnLoci()
    }

    async feature(target: Target, assemblyId?: string, modelIndex?: number) {
        await this.ensureAssembly(assemblyId, modelIndex, true)
        const r = this.plugin.helpers.structureRepresentation

        const assembly = this.customState.structureView.getAssembly()?.obj
        if (!assembly || assembly.data.isEmpty) return

        const expression = targetToExpression(target)
        const query = compile<StructureSelection>(expression)
        const result = query(new QueryContext(assembly.data))
        const loci = StructureSelection.toLociWithSourceUnits(result)

        if (target.auth_seq_id !== undefined || target.label_comp_id !== undefined || target.label_seq_id !== undefined ) {
            const surroundings = MS.struct.modifier.includeSurroundings({
                0: expression,
                radius: 5,
                'as-whole-residues': true
            });
            const surroundingsOnly = MS.struct.modifier.exceptBy({ 0: surroundings, by: expression });
            await r.setFromExpression('add', 'ball-and-stick', surroundings)
            await r.setFromExpression('add', 'interactions', surroundings)
            await r.setFromExpression('add', 'label', surroundings)
            await this.plugin.helpers.structureOverpaint.setFromExpression(Color(0xFFFFFF), surroundingsOnly, undefined, 2/3)
            const firstResidue = StructureElement.Loci.firstResidue(loci)
            this.focusOnLoci(Loci.isEmpty(firstResidue) ? Structure.Loci(assembly.data) : firstResidue)
        } else if(target.label_asym_id) {
            await this.default()
            const firstChain = StructureElement.Loci.firstChain(loci)
            this.focusOnLoci(Loci.isEmpty(firstChain) ? Structure.Loci(assembly.data) : firstChain)
        } else {
            await this.default()
            this.focusOnLoci()
        }
    }

    async symmetry(symmetryIndex?: number, assemblyId?: string, modelIndex?: number) {
        await this.ensureAssembly(assemblyId, modelIndex)
        const r = this.plugin.helpers.structureRepresentation

        const assembly = this.customState.structureView.getAssembly()?.obj
        if (!assembly || assembly.data.isEmpty) return

        await this.customState.structureView.attachAssemblySymmetry()
        const assemblySymmetry = AssemblySymmetryProvider.get(assembly.data).value
        if (!assemblySymmetry || !assemblySymmetry.find(s => s.symbol !== 'C1')) {
            this.focusOnLoci()
            return
        }

        if (symmetryIndex === undefined) {
            symmetryIndex = assemblySymmetry.findIndex(s => s.symbol !== 'C1')
        }

        await this.customState.structureView.setSymmetry(symmetryIndex)
        await r.eachRepresentation((repr, type, update) => {
            if (type !== ValidationReport.Tag.Clashes) {
                r.setRepresentationParams(repr, type, update, {
                    color: [AssemblySymmetry.Tag.Cluster, { symmetryIndex }]
                })
            }
        })

        this.focusOnSymmetry(symmetryIndex)
    }

    async validation(colorTheme?: string, showClashes?: boolean, assemblyId?: string, modelIndex?: number) {
        await this.ensureAssembly(assemblyId, modelIndex)
        const r = this.plugin.helpers.structureRepresentation

        const size = this.customState.structureView.getSize()
        if (size === undefined) return

        if (showClashes === undefined) {
            showClashes = size <= StructureSize.Medium
        }

        await this.customState.structureView.attachValidationReport()
        if (showClashes) {
            await r.setFromExpression('only', ValidationReport.Tag.Clashes, SSQ.all.expression)
            await r.setFromExpression('add', 'ball-and-stick', SSQ.hasClash.expression)
        } else {
            await r.setFromExpression('remove', ValidationReport.Tag.Clashes, SSQ.all.expression)
        }

        if (colorTheme === undefined) colorTheme = ValidationReport.Tag.GeometryQuality
        await r.eachRepresentation((repr, type, update) => {
            if (type !== ValidationReport.Tag.Clashes) {
                r.setRepresentationParams(repr, type, update, { color: colorTheme })
            }
        })

        this.focusOnLoci()
    }

    async ensureAssembly(assemblyId?: string, modelIndex?: number, neverApplyDefault?: boolean) {
        const oldSize = this.customState.structureView.getSize()

        const model = this.customState.structureView.getModel()
        if (!model && modelIndex === undefined) modelIndex = 0

        const assembly = this.customState.structureView.getAssembly()
        if (!assembly && assemblyId === undefined) assemblyId = 'deposited'

        if (modelIndex !== undefined) {
            await this.customState.structureView.setModel(modelIndex)
        }

        if (assemblyId !== undefined) {
            await this.customState.structureView.setAssembly(assemblyId)
        }
        const newSize = this.customState.structureView.getSize()

        if (!neverApplyDefault && oldSize !== newSize) await this.default()
    }

    focusOnLoci(loci?: Loci) {
        if (!loci) {
            const assembly = this.customState.structureView.getAssembly()?.obj
            if (!assembly || assembly.data.isEmpty) return

            loci = Structure.toStructureElementLoci(assembly.data)
        }

        const principalAxes = Loci.getPrincipalAxes(loci)
        if (!principalAxes) return

        const extraRadius = 4, minRadius = 8, durationMs = 0
        const { origin, dirA, dirC } = principalAxes.boxAxes
        const axesRadius = Math.max(...Axes3D.size(Vec3(), principalAxes.boxAxes)) / 2
        const radius = Math.max(axesRadius + extraRadius, minRadius)
        this.plugin.canvas3d!.camera.focus(origin, radius, radius, durationMs, dirA, dirC);
    }

    focusOnSymmetry(symmetryIndex: number) {
        const assembly = this.customState.structureView.getAssembly()?.obj
        if (!assembly || assembly.data.isEmpty) return

        const assemblySymmetry = AssemblySymmetryProvider.get(assembly.data).value
        const axes = assemblySymmetry?.[symmetryIndex].rotation_axes
        if (!axes || !AssemblySymmetry.isRotationAxes(axes)) {
            this.focusOnLoci()
            return
        }

        const [aA, aB] = axes
        if (!aA) return

        const extraRadius = 4, minRadius = 8, durationMs = 0

        const axisRadius = Vec3.distance(aA.start, aA.end) / 2
        const radius = Math.max(axisRadius + extraRadius, minRadius)

        const origin = Vec3()
        Vec3.scale(origin, Vec3.add(origin, aA.start, aA.end), 0.5)

        const dir = Vec3.sub(Vec3(), aA.start, aA.end)
        const up = Vec3()

        if (aB) {
            Vec3.sub(up, aB.end, aB.start)
        } else {
            if (Vec3.dot(Vec3.unitY, Vec3.sub(Vec3(), aA.end, aA.start)) === 0) {
                Vec3.copy(up, Vec3.unitY)
            } else {
                Vec3.copy(up, Vec3.unitX)
            }
        }

        this.plugin.canvas3d!.camera.focus(origin, radius, radius, durationMs, up, dir);
    }

    constructor(private plugin: PluginContext) {

    }
}