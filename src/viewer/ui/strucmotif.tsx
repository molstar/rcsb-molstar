/**
 * Copyright (c) 2020 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Sebastian Bittrich <sebastian.bittrich@rcsb.org>
 */

import { CollapsableControls, PurePluginUIComponent } from 'molstar/lib/mol-plugin-ui/base';
import { Button, IconButton, ToggleButton } from 'molstar/lib/mol-plugin-ui/controls/common';
import {
    ArrowDownwardSvg,
    ArrowUpwardSvg,
    DeleteOutlinedSvg,
    HelpOutlineSvg,
    Icon,
    TuneSvg
} from 'molstar/lib/mol-plugin-ui/controls/icons';
import { ActionMenu } from 'molstar/lib/mol-plugin-ui/controls/action-menu';
import { StructureSelectionHistoryEntry } from 'molstar/lib/mol-plugin-state/manager/structure/selection';
import { StructureElement, StructureProperties } from 'molstar/lib/mol-model/structure/structure';
import { ToggleSelectionModeButton } from 'molstar/lib/mol-plugin-ui/structure/selection';
import { OrderedSet } from 'molstar/lib/mol-data/int';
import { DefaultExchanges, ExchangesControl } from './strucmotif/exchanges';
import { Unit } from 'molstar/lib/mol-model/structure/structure/unit';
import { ViewerState } from '../types';
import { MAX_EXCHANGES, MAX_MOTIF_SIZE, MIN_MOTIF_SIZE, validate } from './strucmotif/validation';
import {
    createCtx,
    detectDataSource,
    ExchangeState,
    extractResidues,
    ResidueSelection,
    uploadStructure
} from './strucmotif/helpers';

const ABSOLUTE_ADVANCED_SEARCH_URL = 'https://rcsb.org/search?query=';
const RELATIVE_ADVANCED_SEARCH_URL = '/search?query=';
const RETURN_TYPE = '&return_type=assembly';

/**
 * The top-level component that exposes the strucmotif search.
 */
export class StrucmotifSubmitControls extends CollapsableControls {
    protected defaultState() {
        return {
            header: 'Structure Motif Search',
            isCollapsed: false,
            brand: { accent: 'gray' as const, svg: SearchIconSvg }
        };
    }

    renderControls() {
        return <>
            <SubmitControls />
        </>;
    }
}

const _SearchIcon = <svg width='24px' height='24px' viewBox='0 0 12 12'>
    <g strokeWidth='1.5' fill='none'>
        <path d='M11.29 11.71l-4-4' />
        <circle cx='5' cy='5' r='4' />
    </g>
</svg>;
export function SearchIconSvg() { return _SearchIcon; }

/**
 * The inner component of strucmotif search that can be collapsed.
 */
class SubmitControls extends PurePluginUIComponent<{}, { isBusy: boolean, residueMap: Map<StructureSelectionHistoryEntry, Residue>, action?: ExchangeState }> {
    state = {
        isBusy: false,
        // map between selection entries of Mol* and additional exchange state
        residueMap: new Map<StructureSelectionHistoryEntry, Residue>(),
        action: void 0 as ExchangeState | undefined
    };

    componentDidMount() {
        this.subscribe(this.selection.events.additionsHistoryUpdated, () => {
            // invalidate potentially expanded exchange panel
            this.setState({ action: void 0 });
            this.forceUpdate();
        });

        this.subscribe(this.plugin.behaviors.state.isBusy, v => {
            this.setState({ isBusy: v });
        });
    }

    get selection() {
        return this.plugin.managers.structure.selection;
    }

    submitSearch = async () => {
        const loci = this.plugin.managers.structure.selection.additionsHistory;
        if (loci.length < MIN_MOTIF_SIZE) return;

        const ctx = createCtx(this.plugin, loci[0].loci.structure, this.state.residueMap);
        extractResidues(ctx, loci);
        if (!validate(ctx)) return;

        const query = {
            type: 'terminal',
            service: 'strucmotif',
            parameters: {
                value: {
                    residue_ids: ctx.residueIds.sort((a, b) => this.sortResidueIds(a, b))
                },
                rmsd_cutoff: 2,
                atom_pairing_scheme: 'ALL'
            }
        };

        detectDataSource(ctx);
        const { dataSource, entryId, format, url } = ctx;
        if (!dataSource || !format) return;
        switch (dataSource) {
            case 'identifier':
                Object.assign(query.parameters.value, { entry_id: entryId });
                break;
            case 'url':
                if (format === 'pdb') {
                    const uploadUrl = await uploadStructure(ctx);
                    if (!uploadUrl) {
                        alert('File upload failed!');
                        return;
                    }
                    Object.assign(query.parameters.value, { url: uploadUrl, format: 'bcif' });
                } else {
                    Object.assign(query.parameters.value, { url, format });
                }
                break;
            case 'file':
                const uploadUrl = await uploadStructure(ctx);
                alert('Motifs can only be extracted from a single model!');
                if (!uploadUrl) {
                    alert('File upload failed!');
                    return;
                }
                Object.assign(query.parameters.value, { url: uploadUrl, format: 'bcif' });
                break;
        }

        if (ctx.exchanges.length) Object.assign(query.parameters, { exchanges: ctx.exchanges });
        // console.log(query);
        const sierraUrl = (this.plugin.customState as ViewerState).detachedFromSierra ? ABSOLUTE_ADVANCED_SEARCH_URL : RELATIVE_ADVANCED_SEARCH_URL;
        const queryUrl = sierraUrl + encodeURIComponent(JSON.stringify(query)) + RETURN_TYPE;
        // console.log(queryUrl);

        window.open(queryUrl, '_blank');
    };

    sortResidueIds(a: ResidueSelection, b: ResidueSelection): number {
        if (a.label_asym_id !== b.label_asym_id) {
            return a.label_asym_id.localeCompare(b.label_asym_id);
        } else if (a.struct_oper_id !== b.struct_oper_id) {
            return a.struct_oper_id.localeCompare(b.struct_oper_id);
        } else {
            return a.label_seq_id < b.label_seq_id ? -1 : a.label_seq_id > b.label_seq_id ? 1 : 0;
        }
    }

    get actions(): ActionMenu.Items {
        const history = this.selection.additionsHistory;
        return [
            {
                kind: 'item',
                label: `Submit Search ${history.length < MIN_MOTIF_SIZE ? ' (' + MIN_MOTIF_SIZE + ' selections required)' : ''}`,
                value: this.submitSearch,
                disabled: history.length < MIN_MOTIF_SIZE
            },
        ];
    }

    selectAction: ActionMenu.OnSelect = item => {
        if (!item) return;
        (item?.value as any)();
    };

    toggleExchanges = (idx: number) => this.setState({ action: (this.state.action === idx ? void 0 : idx) as ExchangeState });

    highlight(loci: StructureElement.Loci) {
        this.plugin.managers.interactivity.lociHighlights.highlightOnly({ loci }, false);
    }

    moveHistory(e: Residue, direction: 'up' | 'down') {
        this.setState({ action: void 0 });
        this.plugin.managers.structure.selection.modifyHistory(e.entry, direction, MAX_MOTIF_SIZE);
        this.updateResidues();
    }

    modifyHistory(e: Residue, a: 'remove') {
        this.setState({ action: void 0 });
        this.plugin.managers.structure.selection.modifyHistory(e.entry, a);
        this.updateResidues();
    }

    updateResidues() {
        const newResidueMap = new Map<StructureSelectionHistoryEntry, Residue>();
        this.selection.additionsHistory.forEach(entry => {
            newResidueMap.set(entry, this.state.residueMap.get(entry)!);
        });
        this.setState({ residueMap: newResidueMap });
    }

    focusLoci(loci: StructureElement.Loci) {
        this.plugin.managers.camera.focusLoci(loci);
    }

    historyEntry(e: Residue, idx: number) {
        const history = this.plugin.managers.structure.selection.additionsHistory;
        return <div key={e.entry.id}>
            <div className='msp-flex-row'>
                <Button noOverflow title='Click to focus. Hover to highlight.' onClick={() => this.focusLoci(e.entry.loci)} style={{ width: 'auto', textAlign: 'left' }} onMouseEnter={() => this.highlight(e.entry.loci)} onMouseLeave={() => this.plugin.managers.interactivity.lociHighlights.clearHighlights()}>
                    {idx}. <span dangerouslySetInnerHTML={{ __html: e.entry.label }} />
                </Button>
                <ToggleButton icon={TuneSvg} className='msp-form-control' title='Define exchanges' toggle={() => this.toggleExchanges(idx)} isSelected={this.state.action === idx} disabled={this.state.isBusy} style={{ flex: '0 0 40px', padding: 0 }} />
                {history.length > 1 && <IconButton svg={ArrowUpwardSvg} small={true} className='msp-form-control' onClick={() => this.moveHistory(e, 'up')} flex='20px' title={'Move up'} />}
                {history.length > 1 && <IconButton svg={ArrowDownwardSvg} small={true} className='msp-form-control' onClick={() => this.moveHistory(e, 'down')} flex='20px' title={'Move down'} />}
                <IconButton svg={DeleteOutlinedSvg} small={true} className='msp-form-control' onClick={() => this.modifyHistory(e, 'remove')} flex title={'Remove'} />
            </div>
            { this.state.action === idx && <ExchangesControl handler={e} /> }
        </div>;
    }

    add() {
        const history = this.plugin.managers.structure.selection.additionsHistory;

        const entries: JSX.Element[] = [];
        for (let i = 0, _i = Math.min(history.length, 10); i < _i; i++) {
            let residue: Residue;
            if (this.state.residueMap.has(history[i])) {
                residue = this.state.residueMap.get(history[i])!;
            } else {
                residue = new Residue(history[i], this);
                this.state.residueMap.set(history[i], residue);
            }
            entries.push(this.historyEntry(residue, i + 1));
        }

        return <>
            <ActionMenu items={this.actions} onSelect={this.selectAction} />
            {entries.length > 0 && <div className='msp-control-offset'>
                {entries}
            </div>}
            {entries.length === 0 && <div className='msp-control-offset msp-help-text'>
                <div className='msp-help-description'><Icon svg={HelpOutlineSvg} inline />Add one or more selections (toggle <ToggleSelectionModeButton inline /> mode)</div>
            </div>}
        </>;
    }

    render() {
        return <>
            {this.add()}
        </>;
    }
}

const location = StructureElement.Location.create(void 0);
export class Residue {
    readonly exchanges: Set<string>;

    constructor(readonly entry: StructureSelectionHistoryEntry, readonly parent: SubmitControls) {
        this.exchanges = new Set<string>();
        // by default: explicitly 'activate' original residue type
        const structure = entry.loci.structure;
        const e = entry.loci.elements[0];
        StructureElement.Location.set(location, structure, e.unit, e.unit.elements[OrderedSet.getAt(e.indices, 0)]);
        if (!Unit.isAtomic(location.unit)) return;

        const comp = StructureProperties.atom.label_comp_id(location);
        if (DefaultExchanges.has(comp)) {
            this.exchanges.add(comp);
            return;
        }
    }

    toggleExchange(val: string): void {
        if (this.hasExchange(val)) {
            this.exchanges.delete(val);
        } else {
            if (this.exchanges.size < MAX_EXCHANGES) {
                this.exchanges.add(val);
            } else {
                alert(`Maximum number of exchanges per position is ${MAX_EXCHANGES}`);
            }
        }
        // this will update state of parent component
        this.parent.forceUpdate();
    }

    hasExchange(val: string): boolean {
        return this.exchanges.has(val);
    }
}