/**
 * Copyright (c) 2021-2022 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Sebastian Bittrich <sebastian.bittrich@rcsb.org>
 */

import { CollapsableControls, CollapsableState } from 'molstar/lib/mol-plugin-ui/base';
import { StructureHierarchyManager } from 'molstar/lib/mol-plugin-state/manager/structure/hierarchy';
import { ValidationReport } from 'molstar/lib/extensions/rcsb/validation-report/prop';
import { ValidationReportGeometryQualityPreset } from 'molstar/lib/extensions/rcsb/validation-report/behavior';
import { RSCCPreset } from '../helpers/rscc/behavior';
import { ActionMenu } from 'molstar/lib/mol-plugin-ui/controls/action-menu';
import { Model } from 'molstar/lib/mol-model/structure/model';
import { MmcifFormat } from 'molstar/lib/mol-model-formats/structure/mmcif';
import { QualityAssessment } from 'molstar/lib/extensions/model-archive/quality-assessment/prop';
import { PLDDTConfidenceColorThemeProvider } from 'molstar/lib/extensions/model-archive/quality-assessment/color/plddt';
import { QmeanScoreColorThemeProvider } from 'molstar/lib/extensions/model-archive/quality-assessment/color/qmean';
import { RSCC } from '../helpers/rscc/prop';

interface ValidationReportState extends CollapsableState {
    errorStates: Set<string>
}

const ValidationReportTag = 'validation-report';
const RSCCReportTag = 'rscc';

const _QualityIcon = <svg width='50px' height='50px' viewBox='0 0 38 47'>
    <g strokeWidth='4' fill='none'>
        <path d='m19 4.8c-3.7 3.6-9 5.8-15 5.8v4.3c0 25 14 29 14 29s16-4.5 16-29v-4.3c-6 0-11-2.3-15-5.8z' stroke='#000' strokeLinecap='square' strokeMiterlimit='10'/>
        <path d='m13 23 3.5 3.5 9.4-9.4' stroke='#000'/>
    </g>
</svg>;
export function QualityIconSvg() { return _QualityIcon; }

/**
 * A high-level component that gives access to the validation report preset.
 */
export class ValidationReportControls extends CollapsableControls<{}, ValidationReportState> {
    protected defaultState() {
        return {
            header: 'Quality Assessment',
            isCollapsed: false,
            isHidden: true,
            errorStates: new Set<string>(),
            brand: { accent: 'cyan' as const, svg: QualityIconSvg }
        };
    }

    componentDidMount() {
        this.subscribe(this.plugin.managers.structure.hierarchy.behaviors.selection, () => {
            const { errorStates, description } = this.state;
            const nextDescription = StructureHierarchyManager.getSelectedStructuresDescription(this.plugin);
            this.setState({
                isHidden: !this.canEnable(),
                // if structure is unchanged then keep old error states
                errorStates: nextDescription === description ? errorStates : new Set<string>(),
                description: nextDescription
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
        if (!pivot.obj || pivot.obj.data.models.length !== 1) return false;
        const model = pivot.obj.data.models[0];
        // all supported options must be registered here
        return ValidationReport.isApplicable(model) || QualityAssessment.isApplicable(model, 'pLDDT') || QualityAssessment.isApplicable(model, 'qmean');
    }

    get noValidationReport() {
        const structure = this.pivot.cell.obj?.data;
        if (!structure || structure.models.length !== 1) return true;
        const model = structure.models[0];
        return !model || !this.isFromPdbArchive(model);
    }

    get rsccData() {
        const structure = this.pivot.cell.obj?.data;
        return RSCC.isApplicable({ structure });
    }

    get pLDDTData() {
        const structure = this.pivot.cell.obj?.data;
        if (!structure || structure.models.length !== 1) return false;
        const model = structure.models[0];
        return QualityAssessment.isApplicable(model, 'pLDDT');
    }

    get qmeanData() {
        const structure = this.pivot.cell.obj?.data;
        if (!structure || structure.models.length !== 1) return false;
        const model = structure.models[0];
        return QualityAssessment.isApplicable(model, 'qmean');
    }

    isFromPdbArchive(model: Model) {
        if (!MmcifFormat.is(model.sourceData)) return false;
        return model.entryId.match(/^[1-9][a-z0-9]{3}$/i) !== null ||
            model.entryId.match(/^pdb_[0-9]{4}[1-9][a-z0-9]{3}$/i) !== null;
    }

    requestValidationReportPreset = async () => {
        try {
            await ValidationReportGeometryQualityPreset.apply(this.pivot.cell, Object.create(null), this.plugin);
        } catch (err) {
            // happens e.g. for 2W4S
            this.setState(({ errorStates }) => {
                const errors = new Set(errorStates);
                errors.add(ValidationReportTag);
                return { errorStates: errors };
            });
        }
    };

    requestRSCCPreset = async () => {
        try {
            await RSCCPreset.apply(this.pivot.cell, Object.create(null), this.plugin);
        } catch (err) {
            // happens e.g. for 4HHB
            this.setState(({ errorStates }) => {
                const errors = new Set(errorStates);
                errors.add(RSCCReportTag);
                return { errorStates: errors };
            });
        }
    };

    requestPLDDTConfidenceColoring = async () => {
        await this.plugin.managers.structure.component.updateRepresentationsTheme(this.pivot.components, { color: PLDDTConfidenceColorThemeProvider.name as any });
    };

    requestQmeanConfidenceColoring = async () => {
        await this.plugin.managers.structure.component.updateRepresentationsTheme(this.pivot.components, { color: QmeanScoreColorThemeProvider.name as any });
    };

    get actions(): ActionMenu.Items {
        const noValidationReport = this.noValidationReport;
        const validationReportError = this.state.errorStates.has(ValidationReportTag);
        const rsccReportError = this.state.errorStates.has(RSCCReportTag);
        const out: ActionMenu.Items = [
            {
                kind: 'item',
                label: validationReportError ? 'Failed to Obtain Validation Report' : (noValidationReport ? 'No Validation Report Available' : 'Validation Report'),
                value: this.requestValidationReportPreset,
                disabled: noValidationReport || validationReportError
            },
        ];

        if (this.rsccData) {
            out.push({
                kind: 'item',
                label: rsccReportError || validationReportError ? 'Failed to Obtain RSCC Values' : (noValidationReport ? 'No RSCC Values Available' : 'Experimental Support Confidence'),
                value: this.requestRSCCPreset,
                disabled: noValidationReport || validationReportError || rsccReportError
            });
        }
        if (this.pLDDTData) {
            out.push({
                kind: 'item',
                label: 'pLDDT Confidence Scores',
                value: this.requestPLDDTConfidenceColoring
            });
        }
        if (this.qmeanData) {
            out.push({
                kind: 'item',
                label: 'QMEAN Confidence Scores',
                value: this.requestQmeanConfidenceColoring
            });
        }

        return out;
    }

    selectAction: ActionMenu.OnSelect = item => {
        if (!item) return;
        (item?.value as any)();
    };

    renderControls() {
        return <ActionMenu items={this.actions} onSelect={this.selectAction} />;
    }
}