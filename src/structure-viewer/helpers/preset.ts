/**
 * Copyright (c) 2020 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import { StructureViewerState } from '../types';
import { getStructureSize, StructureSize } from './util';
import { PluginContext } from 'molstar/lib/mol-plugin/context';
import { Structure } from 'molstar/lib/mol-model/structure';
import { Loci, EmptyLoci } from 'molstar/lib/mol-model/loci';
import { Axes3D } from 'molstar/lib/mol-math/geometry';
import { Vec3 } from 'molstar/lib/mol-math/linear-algebra';
import { ValidationReport } from 'molstar/lib/mol-model-props/rcsb/validation-report';
import { StructureSelectionQueries as SSQ } from 'molstar/lib/mol-plugin/util/structure-selection-helper';
import { MolScriptBuilder as MS } from 'molstar/lib/mol-script/language/builder';
import { AssemblySymmetry } from 'molstar/lib/mol-model-props/rcsb/assembly-symmetry';

type Target = {
    readonly auth_seq_id?: number
    readonly label_seq_id?: number
    readonly label_comp_id?: number
    readonly label_asym_id?: number
    readonly pdbx_struct_oper_list_ids?: string[]
}

function targetToLoci(target: Target, structure: Structure): Loci {
    return EmptyLoci
}

type ValidationProps = {
    kind: 'validation'
    colorTheme?: string
    showClashes?: boolean
    modelIndex?: number
}

type AssemblyProps = {
    kind: 'assembly'
    assemblyId: string
    modelIndex?: number
}

type StandardProps = {
    kind: 'standard'
}

type SymmetryProps = {
    kind: 'symmetry'
    assemblyId?: string
    symmetryIndex?: number
}

type FeatureProps = {
    kind: 'feature'
    assemblyId: string
    target: Target
}

export type PresetProps = ValidationProps | AssemblyProps | StandardProps | SymmetryProps | FeatureProps

export class PresetManager {
    get customState() {
        return this.plugin.customState as StructureViewerState
    }

    async apply(props?: PresetProps) {
        if (!props) props = { kind: 'assembly', assemblyId: 'deposited' }
        switch (props.kind) {
            case 'assembly':
                return this.assembly(props.assemblyId, props.modelIndex)
            case 'feature':
                return this.feature(props.target, props.assemblyId)
            case 'standard':
                return this.standard()
            case 'symmetry':
                return this.symmetry(props.symmetryIndex, props.assemblyId)
            case 'validation':
                return this.validation(props.colorTheme, props.showClashes, props.modelIndex)
        }
    }

    async default() {
        const assembly = this.customState.structureView.getAssembly()
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

    async standard() {
        await this.customState.structureView.setSymmetry(-1)
        await this.default()
        this.focus()
    }

    async assembly(assemblyId: string, modelIndex?: number) {
        if (modelIndex !== undefined) {
            await this.customState.structureView.setModel(modelIndex)
        }
        await this.customState.structureView.setAssembly(assemblyId)
        await this.default()
        this.focus()
    }

    async model(modelIndex: number) {
        await this.customState.structureView.setModel(modelIndex)
        await this.default()
        this.focus()
    }

    async feature(target: Target, assemblyId?: string, modelIndex?: number) {
        if (modelIndex !== undefined) {
            await this.customState.structureView.setModel(modelIndex)
        }
        if (assemblyId !== undefined) {
            await this.customState.structureView.setAssembly(assemblyId)
        }
        const assembly = this.customState.structureView.getAssembly()
        if (!assembly || assembly.data.isEmpty) return

        const loci = targetToLoci(target, assembly.data)
        // TODO show target and surrounding residues in detail if small
        this.focus(loci)
    }

    async symmetry(symmetryIndex?: number, assemblyId?: string) {
        if (assemblyId !== undefined) {
            await this.customState.structureView.setAssembly(assemblyId)
            await this.default()
        }

        const assembly = this.customState.structureView.getAssembly()
        if (!assembly || assembly.data.isEmpty) return

        const r = this.plugin.helpers.structureRepresentation

        await this.customState.structureView.setSymmetry(symmetryIndex || 0)
        r.eachRepresentation((repr, type, update) => {
            if (type !== ValidationReport.Tag.Clashes) {
                r.setRepresentationParams(repr, type, update, { color: AssemblySymmetry.Tag.Cluster })
            }
        })

        // TODO focus on symmetry axes
        this.focus()
    }

    async validation(colorTheme?: string, showClashes?: boolean, modelIndex?: number) {
        if (modelIndex !== undefined) {
            this.customState.structureView.setModel(modelIndex)
            await this.default()
        }

        const assembly = this.customState.structureView.getAssembly()
        if (!assembly || assembly.data.isEmpty) return

        const r = this.plugin.helpers.structureRepresentation

        if (showClashes === undefined) {
            showClashes = getStructureSize(assembly.data) <= StructureSize.Medium
        }

        await this.customState.structureView.attachValidationReport()
        if (showClashes) {
            await r.setFromExpression('only', ValidationReport.Tag.Clashes, SSQ.all.expression)
            await r.setFromExpression('add', 'ball-and-stick', SSQ.hasClash.expression)
        } else {
            await r.setFromExpression('remove', ValidationReport.Tag.Clashes, SSQ.all.expression)
        }

        if (colorTheme === undefined) colorTheme = ValidationReport.Tag.GeometryQuality
        r.eachRepresentation((repr, type, update) => {
            if (type !== ValidationReport.Tag.Clashes) {
                r.setRepresentationParams(repr, type, update, { color: colorTheme })
            }
        })

        this.focus()
    }

    focus(loci?: Loci) {
        if (!loci) {
            const assembly = this.customState.structureView.getAssembly()
            if (!assembly || assembly.data.isEmpty) return

            loci = Structure.toStructureElementLoci(assembly.data)
        }

        const principalAxes = Loci.getPrincipalAxes(loci)
        if (!principalAxes) return

        const extraRadius = 4, minRadius = 8, durationMs = 250
        const { origin, dirA, dirC } = principalAxes.boxAxes
        const axesRadius = Math.max(...Axes3D.size(Vec3(), principalAxes.boxAxes)) / 2
        const radius = Math.max(axesRadius + extraRadius, minRadius)
        this.plugin.canvas3d!.camera.focus(origin, radius, radius, durationMs, dirA, dirC);
    }

    constructor(private plugin: PluginContext) {

    }
}