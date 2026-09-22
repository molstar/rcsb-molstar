/**
 * Copyright (c) 2022-2026 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Sebastian Bittrich <sebastian.bittrich@rcsb.org>
 */

import {
    PresetStructureRepresentations,
    StructureRepresentationPresetProvider
} from 'molstar/lib/mol-plugin-state/builder/structure/representation-preset';
import { State, StateObjectRef } from 'molstar/lib/mol-state';
import { RSCCColorThemeProvider } from './color';
import { PluginBehavior } from 'molstar/lib/mol-plugin/behavior/behavior';
import { RSCC, RSCCProvider } from './prop';
import { Loci } from 'molstar/lib/mol-model/loci';
import { StructureElement } from 'molstar/lib/mol-model/structure/structure';
import { OrderedSet } from 'molstar/lib/mol-data/int';
import { ParamDefinition as PD } from 'molstar/lib/mol-util/param-definition';
import { Task } from 'molstar/lib/mol-task';
import { PluginStateObject } from 'molstar/lib/mol-plugin-state/objects';
import { PluginCommands } from 'molstar/lib/mol-plugin/commands';

export const RSCCPreset = StructureRepresentationPresetProvider({
    id: 'preset-structure-representation-rcsb-validation-report-rscc',
    display: {
        name: 'Validation Report (Experimental Support)', group: 'Annotation',
        description: 'Color structure based on real-space correlation coefficients. Data from wwPDB Validation Report, obtained via RCSB PDB.'
    },
    isApplicable(a) {
        return a.data.models.length === 1 && RSCC.isApplicableAndAvailable({ structure: a.data });
    },
    params: () => StructureRepresentationPresetProvider.CommonParams,
    async apply(ref, params, plugin) {
        const structureCell = StateObjectRef.resolveAndCheck(plugin.state.data, ref);
        const structure = structureCell?.obj?.data;
        if (!structureCell || !structure) return {};

        const data = structure.models[0];
        await plugin.runTask(Task.create('Validation Report', async runtime => {
            await RSCCProvider.attach({ runtime, assetManager: plugin.managers.asset }, data);
        }));
        if (RSCC.isUnavailable(data)) throw Error('No RSCC available');

        const colorTheme = RSCCColorThemeProvider.name as any;
        return PresetStructureRepresentations.auto.apply(ref, { ...params, theme: { globalName: colorTheme, focus: { name: colorTheme } } }, plugin);
    }
});

export const RSCCScore = PluginBehavior.create<{ autoAttach: boolean, showTooltip: boolean }>({
    name: 'rscc-prop',
    category: 'custom-props',
    display: {
        name: 'Real-Space Correlation Coefficient',
        description: 'Real-Space Correlation Coefficient.'
    },
    ctor: class extends PluginBehavior.Handler<{ autoAttach: boolean, showTooltip: boolean }> {
        private provider = RSCCProvider;

        private labelProvider = {
            label: (loci: Loci): string | undefined => {
                if (!this.params.showTooltip) return;

                switch (loci.kind) {
                    case 'element-loci':
                        if (loci.elements.length === 0) return;
                        const e = loci.elements[0];
                        const u = e.unit;
                        if (!u.model.customProperties.hasReference(RSCCProvider.descriptor)) return;

                        const se = StructureElement.Location.create(loci.structure, u, u.elements[OrderedSet.getAt(e.indices, 0)]);
                        const confidenceScore = RSCC.getScore(se);
                        return confidenceScore && confidenceScore[0] !== -1 ? `RSCC value: ${confidenceScore[0]} <small>( ${confidenceScore[1]} )</small>` : `No RSCC value`;

                    default: return;
                }
            }
        };

        // representations that already triggered a 'no RSCC values' notification
        private notifiedRefs = new Set<string>();

        private notifyIfUnavailable = ({ state, ref }: State.ObjectEvent) => {
            const cell = state.cells.get(ref);
            if (!cell || !PluginStateObject.Molecule.Structure.Representation3D.is(cell.obj)) return;
            if (cell.transform.params?.colorTheme?.name !== RSCCColorThemeProvider.name) {
                this.notifiedRefs.delete(ref);
                return;
            }

            const { sourceData } = cell.obj.data;
            if (this.notifiedRefs.has(ref) || sourceData.models.length === 0 || !RSCC.isUnavailable(sourceData.models[0])) return;

            this.notifiedRefs.add(ref);
            PluginCommands.Toast.Show(this.ctx, {
                title: 'Experimental Support Confidence',
                message: `No RSCC values available for ${sourceData.models[0].entryId}.`,
                key: 'rscc-unavailable',
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

            this.ctx.representation.structure.themes.colorThemeRegistry.add(RSCCColorThemeProvider);
            this.ctx.builders.structure.representation.registerPreset(RSCCPreset);
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
            this.ctx.representation.structure.themes.colorThemeRegistry.remove(RSCCColorThemeProvider);
            this.ctx.builders.structure.representation.unregisterPreset(RSCCPreset);
        }
    },
    params: () => ({
        autoAttach: PD.Boolean(false),
        showTooltip: PD.Boolean(true)
    })
});