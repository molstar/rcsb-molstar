/**
 * Copyright (c) 2019 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 * @author David Sehnal <david.sehnal@gmail.com>
 */

import { createPlugin, DefaultPluginSpec } from 'molstar/lib/mol-plugin';
import './index.html'
import { PluginContext } from 'molstar/lib/mol-plugin/context';
import { PluginCommands } from 'molstar/lib/mol-plugin/command';
import { PluginBehaviors } from 'molstar/lib/mol-plugin/behavior';
import { StateTransforms } from 'molstar/lib/mol-plugin/state/transforms';
import { StructureRepresentation3DHelpers } from 'molstar/lib/mol-plugin/state/transforms/representation';
import { PluginStateObject as PSO, PluginStateObject } from 'molstar/lib/mol-plugin/state/objects';
import { AnimateModelIndex } from 'molstar/lib/mol-plugin/state/animation/built-in';
import { StateBuilder, StateObject, StateSelection } from 'molstar/lib/mol-state';
import { LoadParams, SupportedFormats, RepresentationStyle, StateElements } from './helpers';
import { ControlsWrapper } from './ui/controls';
import { Scheduler } from 'molstar/lib/mol-task';
import { MolScriptBuilder as MS } from 'molstar/lib/mol-script/language/builder';
import { BuiltInStructureRepresentations } from 'molstar/lib/mol-repr/structure/registry';
import { BuiltInColorThemes } from 'molstar/lib/mol-theme/color';
import { BuiltInSizeThemes } from 'molstar/lib/mol-theme/size';
import { ColorNames } from 'molstar/lib/mol-util/color/tables';
import { InitVolumeStreaming, CreateVolumeStreamingInfo } from 'molstar/lib/mol-plugin/behavior/dynamic/volume-streaming/transformers';
import { ParamDefinition } from 'molstar/lib/mol-util/param-definition';
import { PluginSpec } from 'molstar/lib/mol-plugin/spec';
import { StructureRepresentationInteraction } from 'molstar/lib/mol-plugin/behavior/dynamic/selection/structure-representation-interaction';
require('molstar/lib/mol-plugin/skin/light.scss')

export class StructureViewer {
    plugin: PluginContext;

    init(target: string | HTMLElement, options?: {
        // TODO
    }) {
        this.plugin = createPlugin(typeof target === 'string' ? document.getElementById(target)! : target, {
            ...DefaultPluginSpec,
            behaviors: [
                PluginSpec.Behavior(PluginBehaviors.Representation.HighlightLoci),
                PluginSpec.Behavior(PluginBehaviors.Representation.SelectLoci),
                PluginSpec.Behavior(PluginBehaviors.Representation.DefaultLociLabelProvider),
                PluginSpec.Behavior(PluginBehaviors.Camera.FocusLociOnSelect, { minRadius: 8, extraRadius: 4 }),
                PluginSpec.Behavior(PluginBehaviors.CustomProps.RCSBAssemblySymmetry, { autoAttach: true }),
                PluginSpec.Behavior(StructureRepresentationInteraction)
            ],
            animations: [
                AnimateModelIndex
            ],
            layout: {
                initial: {
                    isExpanded: true,
                    showControls: true
                },
                controls: {
                    left: 'none',
                    right: ControlsWrapper,
                    bottom: 'none'
                }
            }
        });
    }

    get state() {
        return this.plugin.state.dataState;
    }

    private download(b: StateBuilder.To<PSO.Root>, url: string) {
        return b.apply(StateTransforms.Data.Download, { url, isBinary: false })
    }

    private model(b: StateBuilder.To<PSO.Data.Binary | PSO.Data.String>, format: SupportedFormats, assemblyId: string) {
        const parsed = format === 'cif'
            ? b.apply(StateTransforms.Data.ParseCif).apply(StateTransforms.Model.TrajectoryFromMmCif)
            : b.apply(StateTransforms.Model.TrajectoryFromPDB);

        return parsed
            .apply(StateTransforms.Model.ModelFromTrajectory, { modelIndex: 0 }, { ref: StateElements.Model });
    }

    private structure(assemblyId: string) {
        const model = this.state.build().to(StateElements.Model);

        const s = model
            .apply(StateTransforms.Model.StructureAssemblyFromModel, { id: assemblyId || 'deposited' }, { ref: StateElements.Assembly });

        s.apply(StateTransforms.Model.StructureComplexElement, { type: 'atomic-sequence' }, { ref: StateElements.Sequence });
        s.apply(StateTransforms.Model.StructureComplexElement, { type: 'atomic-het' }, { ref: StateElements.Het });
        s.apply(StateTransforms.Model.StructureComplexElement, { type: 'water' }, { ref: StateElements.Water });

        return s;
    }

    private visual(_style?: RepresentationStyle, partial?: boolean) {
        const structure = this.getObj<PluginStateObject.Molecule.Structure>(StateElements.Assembly);
        if (!structure) return;

        const style = _style || { };

        const update = this.state.build();

        if (!partial || (partial && style.sequence)) {
            const root = update.to(StateElements.Sequence);
            if (style.sequence && style.sequence.hide) {
                root.delete(StateElements.SequenceVisual);
            } else {
                root.applyOrUpdate(StateElements.SequenceVisual, StateTransforms.Representation.StructureRepresentation3D,
                    StructureRepresentation3DHelpers.getDefaultParamsWithTheme(this.plugin,
                        (style.sequence && style.sequence.kind) || 'cartoon',
                        (style.sequence && style.sequence.coloring) || 'unit-index', structure));
            }
        }

        if (!partial || (partial && style.hetGroups)) {
            const root = update.to(StateElements.Het);
            if (style.hetGroups && style.hetGroups.hide) {
                root.delete(StateElements.HetVisual);
            } else {
                if (style.hetGroups && style.hetGroups.hide) {
                    root.delete(StateElements.HetVisual);
                } else {
                    root.applyOrUpdate(StateElements.HetVisual, StateTransforms.Representation.StructureRepresentation3D,
                        StructureRepresentation3DHelpers.getDefaultParamsWithTheme(this.plugin,
                            (style.hetGroups && style.hetGroups.kind) || 'ball-and-stick',
                            (style.hetGroups && style.hetGroups.coloring), structure));
                }
            }
        }

        if (!partial || (partial && style.carbs)) {
            const root = update.to(StateElements.Het);
            if (style.hetGroups && style.hetGroups.hide) {
                root.delete(StateElements.HetVisual);
            } else {
                if (style.carbs && style.carbs.hide) {
                    root.delete(StateElements.HetCarbs);
                } else {
                    root.applyOrUpdate(StateElements.HetCarbs, StateTransforms.Representation.StructureRepresentation3D,
                        StructureRepresentation3DHelpers.getDefaultParamsWithTheme(this.plugin, 'carbohydrate', void 0, structure));
                }
            }
        }

        if (!partial || (partial && style.water)) {
            const root = update.to(StateElements.Water);
            if (style.water && style.water.hide) {
                root.delete(StateElements.WaterVisual);
            } else {
                root.applyOrUpdate(StateElements.WaterVisual, StateTransforms.Representation.StructureRepresentation3D,
                        StructureRepresentation3DHelpers.getDefaultParamsWithTheme(this.plugin,
                            (style.water && style.water.kind) || 'ball-and-stick',
                            (style.water && style.water.coloring), structure, { alpha: 0.51 }));
            }
        }

        return update;
    }

    private getObj<T extends StateObject>(ref: string): T['data'] {
        const state = this.state;
        const cell = state.select(ref)[0];
        if (!cell || !cell.obj) return void 0;
        return (cell.obj as T).data;
    }

    private applyState(tree: StateBuilder) {
        return PluginCommands.State.Update.dispatch(this.plugin, { state: this.plugin.state.dataState, tree });
    }

    private loadedParams: LoadParams = { url: '', format: 'cif', assemblyId: '' };
    async load({ url, format = 'cif', assemblyId = '', representationStyle }: LoadParams) {
        let loadType: 'full' | 'update' = 'full';

        const state = this.plugin.state.dataState;

        if (this.loadedParams.url !== url || this.loadedParams.format !== format) {
            loadType = 'full';
        } else if (this.loadedParams.url === url) {
            if (state.select(StateElements.Assembly).length > 0) loadType = 'update';
        }

        if (loadType === 'full') {
            await PluginCommands.State.RemoveObject.dispatch(this.plugin, { state, ref: state.tree.root.ref });
            const modelTree = this.model(this.download(state.build().toRoot(), url), format, assemblyId);
            await this.applyState(modelTree);
            const structureTree = this.structure(assemblyId);
            await this.applyState(structureTree);
        } else {
            const tree = state.build();
            tree.to(StateElements.Assembly).update(StateTransforms.Model.StructureAssemblyFromModel, p => ({ ...p, id: assemblyId || 'deposited' }));
            await this.applyState(tree);
        }

        await this.updateStyle(representationStyle);

        this.loadedParams = { url, format, assemblyId };
        Scheduler.setImmediate(() => PluginCommands.Camera.Reset.dispatch(this.plugin, { }));

        this.experimentalData.init()
    }

    async updateStyle(style?: RepresentationStyle, partial?: boolean) {
        const tree = this.visual(style, partial);
        if (!tree) return;
        await PluginCommands.State.Update.dispatch(this.plugin, { state: this.plugin.state.dataState, tree });
    }

    experimentalData = {
        init: async () => {
            const asm = this.state.select(StateElements.Assembly)[0].obj!;
            const params = ParamDefinition.getDefaultValues(InitVolumeStreaming.definition.params!(asm, this.plugin));
            params.behaviorRef = StateElements.VolumeStreaming;
            params.defaultView = 'box';
            await this.plugin.runTask(this.state.applyAction(InitVolumeStreaming, params, StateElements.Assembly));
        },
        remove: () => {
            const r = this.state.select(StateSelection.Generators.ofTransformer(CreateVolumeStreamingInfo))[0];
            if (!r) return;
            PluginCommands.State.RemoveObject.dispatch(this.plugin, { state: this.state, ref: r.transform.ref });
        }
    }

    hetGroups = {
        reset: () => {
            const update = this.state.build().delete(StateElements.HetGroupFocus);
            PluginCommands.State.Update.dispatch(this.plugin, { state: this.state, tree: update });
            PluginCommands.Camera.Reset.dispatch(this.plugin, { });
        },
        focusFirst: async (resn: string) => {
            if (!this.state.transforms.has(StateElements.Assembly)) return;

            const update = this.state.build();

            update.delete(StateElements.HetGroupFocus);

            const surroundings = MS.struct.modifier.includeSurroundings({
                0: MS.struct.filter.first([
                    MS.struct.generator.atomGroups({
                        'residue-test': MS.core.rel.eq([MS.struct.atomProperty.macromolecular.label_comp_id(), resn]),
                        'group-by': MS.struct.atomProperty.macromolecular.residueKey()
                    })
                ]),
                radius: 5,
                'as-whole-residues': true
            });

            const sel = update.to(StateElements.Assembly)
                .apply(StateTransforms.Model.StructureSelection, { label: resn, query: surroundings }, { ref: StateElements.HetGroupFocus });

            sel.apply(StateTransforms.Representation.StructureRepresentation3D, this.createSurVisualParams());

            await PluginCommands.State.Update.dispatch(this.plugin, { state: this.state, tree: update });

            const focus = (this.state.select(StateElements.HetGroupFocus)[0].obj as PluginStateObject.Molecule.Structure).data;
            const sphere = focus.boundary.sphere;
            const snapshot = this.plugin.canvas3d.camera.getFocus(sphere.center, 0.75 * sphere.radius);
            PluginCommands.Camera.SetSnapshot.dispatch(this.plugin, { snapshot, durationMs: 250 });
        }
    }

    private createSurVisualParams() {
        const asm = this.state.select(StateElements.Assembly)[0].obj as PluginStateObject.Molecule.Structure;
        return StructureRepresentation3DHelpers.createParams(this.plugin, asm.data, {
            repr: BuiltInStructureRepresentations['ball-and-stick'],
            color: [BuiltInColorThemes.uniform, () => ({ value: ColorNames.gray })],
            size: [BuiltInSizeThemes.uniform, () => ({ value: 0.33 } )]
        });
    }
}