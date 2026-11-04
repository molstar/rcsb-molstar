/**
 * Copyright (c) 2026 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Sebastian Bittrich <sebastian.bittrich@rcsb.org>
 */

import {
    PresetStructureRepresentations,
    StructureRepresentationPresetProvider
} from 'molstar/lib/mol-plugin-state/builder/structure/representation-preset';
import { State, StateObjectRef } from 'molstar/lib/mol-state';
import { QScoreColorThemeProvider } from './color';
import { PluginBehavior } from 'molstar/lib/mol-plugin/behavior/behavior';
import { QScore, QScoreProvider } from './prop';
import { Loci } from 'molstar/lib/mol-model/loci';
import { StructureElement } from 'molstar/lib/mol-model/structure/structure';
import { OrderedSet } from 'molstar/lib/mol-data/int';
import { ParamDefinition as PD } from 'molstar/lib/mol-util/param-definition';
import { Task } from 'molstar/lib/mol-task';
import { PluginStateObject } from 'molstar/lib/mol-plugin-state/objects';
import { PluginCommands } from 'molstar/lib/mol-plugin/commands';

export const QScorePreset = StructureRepresentationPresetProvider({
    id: 'preset-structure-representation-rcsb-validation-report-qscore',
    display: {
        name: 'Q-score (Experimental Support)', group: 'Annotation',
        description: 'Color structure based on Q-scores (atom resolvability in the cryo-EM map). Data from wwPDB Validation Report, obtained via RCSB PDB.'
    },
    isApplicable(a) {
        return a.data.models.length === 1 && QScore.isApplicableAndAvailable({ structure: a.data });
    },
    params: () => StructureRepresentationPresetProvider.CommonParams,
    async apply(ref, params, plugin) {
        const structureCell = StateObjectRef.resolveAndCheck(plugin.state.data, ref);
        const structure = structureCell?.obj?.data;
        if (!structureCell || !structure) return {};

        const data = structure.models[0];
        await plugin.runTask(Task.create('Q-score', async runtime => {
            await QScoreProvider.attach({ runtime, assetManager: plugin.managers.asset }, data);
        }));
        if (QScore.isUnavailable(data)) throw Error('No Q-scores available');

        const colorTheme = QScoreColorThemeProvider.name as any;
        return PresetStructureRepresentations.auto.apply(ref, { ...params, theme: { globalName: colorTheme, focus: { name: colorTheme } } }, plugin);
    }
});

export const QScoreBehavior = PluginBehavior.create<{ autoAttach: boolean, showTooltip: boolean }>({
    name: 'qscore-prop',
    category: 'custom-props',
    display: {
        name: 'Q-score',
        description: 'Q-score (atom resolvability in cryo-EM maps).'
    },
    ctor: class extends PluginBehavior.Handler<{ autoAttach: boolean, showTooltip: boolean }> {
        private provider = QScoreProvider;

        private labelProvider = {
            label: (loci: Loci): string | undefined => {
                if (!this.params.showTooltip) return;

                switch (loci.kind) {
                    case 'element-loci':
                        if (loci.elements.length === 0) return;
                        const e = loci.elements[0];
                        const u = e.unit;
                        if (!u.model.customProperties.hasReference(QScoreProvider.descriptor)) return;

                        const se = StructureElement.Location.create(loci.structure, u, u.elements[OrderedSet.getAt(e.indices, 0)]);
                        const score = QScore.getScore(se);
                        return score !== undefined ? `Q-score: ${score}` : `No Q-score`;

                    default: return;
                }
            }
        };

        // representations that already triggered a 'no Q-scores' notification
        private notifiedRefs = new Set<string>();

        private notifyIfUnavailable = ({ state, ref }: State.ObjectEvent) => {
            const cell = state.cells.get(ref);
            if (!cell || !PluginStateObject.Molecule.Structure.Representation3D.is(cell.obj)) return;
            if (cell.transform.params?.colorTheme?.name !== QScoreColorThemeProvider.name) {
                this.notifiedRefs.delete(ref);
                return;
            }

            const { sourceData } = cell.obj.data;
            if (this.notifiedRefs.has(ref) || sourceData.models.length === 0 || !QScore.isUnavailable(sourceData.models[0])) return;

            this.notifiedRefs.add(ref);
            PluginCommands.Toast.Show(this.ctx, {
                title: 'Q-score',
                message: `No Q-scores available for ${sourceData.models[0].entryId}.`,
                key: 'qscore-unavailable',
                timeoutMs: 5000
            });
        };

        register(): void {
            this.ctx.customModelProperties.register(this.provider, this.params.autoAttach);
            this.ctx.managers.lociLabels.addProvider(this.labelProvider);

            const { events } = this.ctx.state.data;
            this.subscribeObservable(events.object.created, this.notifyIfUnavailable);
            this.subscribeObservable(events.object.updated, this.notifyIfUnavailable);
            this.subscribeObservable(events.object.removed, ({ ref }) => this.notifiedRefs.delete(ref));

            this.ctx.representation.structure.themes.colorThemeRegistry.add(QScoreColorThemeProvider);
            this.ctx.builders.structure.representation.registerPreset(QScorePreset);
        }

        update(p: { autoAttach: boolean, showTooltip: boolean }) {
            const updated = this.params.autoAttach !== p.autoAttach;
            this.params.autoAttach = p.autoAttach;
            this.params.showTooltip = p.showTooltip;
            this.ctx.customModelProperties.setDefaultAutoAttach(this.provider.descriptor.name, this.params.autoAttach);
            return updated;
        }

        unregister() {
            this.ctx.customModelProperties.unregister(this.provider.descriptor.name);
            this.ctx.managers.lociLabels.removeProvider(this.labelProvider);
            this.ctx.representation.structure.themes.colorThemeRegistry.remove(QScoreColorThemeProvider);
            this.ctx.builders.structure.representation.unregisterPreset(QScorePreset);
        }
    },
    params: () => ({
        autoAttach: PD.Boolean(false),
        showTooltip: PD.Boolean(true)
    })
});
