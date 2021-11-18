/**
 * Copyright (c) 2021 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Sebastian Bittrich <sebastian.bittrich@rcsb.org>
 */

import { CollapsableControls, CollapsableState } from 'molstar/lib/mol-plugin-ui/base';
import { TuneSvg } from 'molstar/lib/mol-plugin-ui/controls/icons';
import { StructureHierarchyManager } from 'molstar/lib/mol-plugin-state/manager/structure/hierarchy';
import { ValidationReport } from 'molstar/lib/extensions/rcsb/validation-report/prop';
import { ValidationReportGeometryQualityPreset } from 'molstar/lib/extensions/rcsb/validation-report/behavior';
import { ActionMenu } from 'molstar/lib/mol-plugin-ui/controls/action-menu';
import { Model } from 'molstar/lib/mol-model/structure/model';
import { MmcifFormat } from 'molstar/lib/mol-model-formats/structure/mmcif';

interface ValidationReportState extends CollapsableState {
    isInitialized: boolean
}

/**
 * A high-level component that gives access to the validation report preset.
 */
export class ValidationReportControls extends CollapsableControls<{}, ValidationReportState> {
    protected defaultState() {
        return {
            header: 'Validation Report',
            isCollapsed: false,
            isHidden: true,
            isInitialized: false,
            brand: { accent: 'gray' as const, svg: TuneSvg } // TODO better logo
        };
    }

    componentDidMount() {
        this.subscribe(this.plugin.managers.structure.hierarchy.behaviors.selection, () => {
            this.setState({
                isHidden: !this.canEnable(),
                description: StructureHierarchyManager.getSelectedStructuresDescription(this.plugin)
            });
        });
    }

    get pivot() {
        return this.plugin.managers.structure.hierarchy.selection.structures[0];
    }

    canEnable() {
        const { selection } = this.plugin.managers.structure.hierarchy;
        if (selection.structures.length !== 1) return false;
        const pivot = this.pivot.cell;
        if (!pivot.obj) return false;
        return pivot.obj.data.models.length === 1 && ValidationReport.isApplicable(pivot.obj.data.models[0]);
    }

    get noReport() {
        const structure = this.pivot.cell.obj?.data;
        if (!structure || structure.models.length !== 1) return true;
        const model = structure.models[0];
        return !model || !this.isFromPdbArchive(model);
    }

    isFromPdbArchive(model: Model) {
        if (!MmcifFormat.is(model.sourceData)) return false;
        return model.entryId.match(/^[1-9][a-z0-9]{3}$/i) !== null ||
            model.entryId.match(/^pdb_[0-9]{4}[1-9][a-z0-9]{3}$/i) !== null;
    }

    requestPreset = () => {
        ValidationReportGeometryQualityPreset.apply(this.pivot.cell, Object.create(null), this.plugin);
    }

    get actions(): ActionMenu.Items {
        const noReport = this.noReport;
        // TODO this could support other kinds of reports/validation like the AlphaFold confidence scores
        return [
            {
                kind: 'item',
                label: noReport ? 'No Report Available' : 'Visualize RCSB PDB Validation Report',
                value: this.requestPreset,
                disabled: noReport
            },
        ];
    }

    selectAction: ActionMenu.OnSelect = item => {
        if (!item) return;
        (item?.value as any)();
    }

    renderControls() {
        return <ActionMenu items={this.actions} onSelect={this.selectAction} />;
    }
}