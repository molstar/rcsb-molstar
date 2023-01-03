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
import { DefaultExchanges, ExchangesControl } from './exchanges';
import { Vec3 } from 'molstar/lib/mol-math/linear-algebra/3d/vec3';
import { Structure } from 'molstar/lib/mol-model/structure/structure/structure';
import { Unit } from 'molstar/lib/mol-model/structure/structure/unit';
import { UnitIndex } from 'molstar/lib/mol-model/structure/structure/element/element';
import { ViewerState } from '../types';

const ABSOLUTE_ADVANCED_SEARCH_URL = 'https://rcsb.org/search?query=';
const RELATIVE_ADVANCED_SEARCH_URL = '/search?query=';
const RETURN_TYPE = '&return_type=assembly';
const CSM_REGEX = /^[A-Z0-9]+_[A-Z0-9]{6,}$/i;
const CSM_TAG = '&include_csm=true';
const MIN_MOTIF_SIZE = 2;
const MAX_MOTIF_SIZE = 10;
export const MAX_EXCHANGES = 4;
const MAX_MOTIF_EXTENT = 15;
const MAX_MOTIF_EXTENT_SQUARED = MAX_MOTIF_EXTENT * MAX_MOTIF_EXTENT;

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

const location = StructureElement.Location.create(void 0);

type ExchangeState = number;
type ResidueSelection = { label_asym_id: string, struct_oper_id: string, label_seq_id: number }
type Exchange = { residue_id: ResidueSelection, allowed: string[] }

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

    submitSearch = () => {
        const { label_atom_id, x, y, z } = StructureProperties.atom;
        // keep track of seen pdbIds, space-groups, and NCS operators - motifs can only have a single value
        const pdbId: Set<string> = new Set();
        const sg: Set<number> = new Set();
        const hkl: Set<string> = new Set();
        const ncs: Set<number> = new Set();
        const residueIds: ResidueSelection[] = [];
        const exchanges: Exchange[] = [];
        const coordinates: { coords: Vec3, residueId: ResidueSelection }[] = [];

        /**
         * This sets the 'location' to the backbone atom (CA or C4').
         * @param structure context
         * @param element wraps atom indices of this residue
         */
        const determineBackboneAtom = (structure: Structure, element: { unit: Unit; indices: OrderedSet<UnitIndex> }) => {
            const { indices } = element;
            for (let i = 0, il = OrderedSet.size(indices); i < il; i++) {
                StructureElement.Location.set(location, structure, element.unit, element.unit.elements[OrderedSet.getAt(indices, i)]);
                const atomLabelId = label_atom_id(location);
                if ('CA' === atomLabelId || `C4'` === atomLabelId) {
                    return true;
                }
            }
            return false;
        };

        function join(opers: any[]) {
            // this makes the assumptions that '1' is the identity operator
            if (!opers || !opers.length) return '1';
            if (opers.length > 1) {
                // Mol* operators are right-to-left
                return opers[1] + 'x' + opers[0];
            }
            return opers[0];
        }

        const loci = this.plugin.managers.structure.selection.additionsHistory;
        for (let i = 0; i < Math.min(MAX_MOTIF_SIZE, loci.length); i++) {
            const l = loci[i];
            const { structure, elements } = l.loci;

            // only first element and only first index will be considered (ignoring multiple residues)
            if (!determineBackboneAtom(structure, elements[0])) {
                alert(`No CA or C4' atom for ${StructureProperties.residue.label_seq_id(location)} | ${StructureProperties.chain.label_asym_id(location)} | ${join(StructureProperties.unit.pdbx_struct_oper_list_ids(location))}`);
                return;
            }

            pdbId.add(structure.model.entry);
            sg.add(StructureProperties.unit.spgrOp(location));
            hkl.add(StructureProperties.unit.hkl(location).join('-'));
            ncs.add(StructureProperties.unit.struct_ncs_oper_id(location));

            const struct_oper_list_ids = StructureProperties.unit.pdbx_struct_oper_list_ids(location);
            const struct_oper_id = join(struct_oper_list_ids);

            // handle pure residue-info
            const residueId = {
                label_asym_id: StructureProperties.chain.label_asym_id(location),
                // can be empty array if model is selected
                struct_oper_id,
                label_seq_id: StructureProperties.residue.label_seq_id(location)
            };
            residueIds.push(residueId);

            // retrieve CA/C4', used to compute residue distance
            const coords = [x(location), y(location), z(location)] as Vec3;
            coordinates.push({ coords, residueId });

            // handle potential exchanges - can be empty if deselected by users
            const residueMapEntry = this.state.residueMap.get(l)!;
            if (residueMapEntry.exchanges?.size > 0) {
                if (residueMapEntry.exchanges.size > MAX_EXCHANGES) {
                    alert(`Maximum number of exchanges per position is ${MAX_EXCHANGES} - Please remove some exchanges from residue ${residueId.label_seq_id} | ${residueId.label_asym_id} | ${residueId.struct_oper_id}.`);
                    return;
                }
                exchanges.push({ residue_id: residueId, allowed: Array.from(residueMapEntry.exchanges.values()) });
            }
        }

        if (pdbId.size > 1) {
            alert('Motifs can only be extracted from a single model!');
            return;
        }
        if (sg.size > 1) {
            alert('Motifs can only appear in a single space-group!');
            return;
        }
        if (hkl.size > 1) {
            alert('All motif residues must have matching hkl operators!');
            return;
        }
        if (ncs.size > 1) {
            alert('All motif residues must have matching NCS operators!');
            return;
        }
        if (residueIds.length > MAX_MOTIF_SIZE) {
            alert(`Maximum motif size is ${MAX_MOTIF_SIZE} residues!`);
            return;
        }
        if (residueIds.filter(v => v.label_seq_id === 0).length > 0) {
            alert('Selections may only contain polymeric entities!');
            return;
        }
        // warn if >15 A
        const a = Vec3();
        const b = Vec3();
        // this is not efficient but is good enough for up to 10 residues
        for (let i = 0, il = coordinates.length; i < il; i++) {
            Vec3.set(a, coordinates[i].coords[0], coordinates[i].coords[1], coordinates[i].coords[2]);
            let contact = false;
            for (let j = 0, jl = coordinates.length; j < jl; j++) {
                if (i === j) continue;
                Vec3.set(b, coordinates[j].coords[0], coordinates[j].coords[1], coordinates[j].coords[2]);
                const d = Vec3.squaredDistance(a, b);
                if (d < MAX_MOTIF_EXTENT_SQUARED) {
                    contact = true;
                }
            }

            if (!contact) {
                const { residueId } = coordinates[i];
                alert(`Residue ${residueId.label_seq_id} | ${residueId.label_asym_id} | ${residueId.struct_oper_id} needs to be less than ${MAX_MOTIF_EXTENT} \u212B from another residue - Consider adding more residues to connect far-apart residues.`);
                return;
            }
        }

        const entry_id = pdbId.values().next().value as string;
        const query = {
            type: 'terminal',
            service: 'strucmotif',
            parameters: {
                value: {
                    entry_id,
                    residue_ids: residueIds.sort((a, b) => this.sortResidueIds(a, b))
                },
                rmsd_cutoff: 2,
                atom_pairing_scheme: 'ALL'
            }
        };
        if (exchanges.length) Object.assign(query.parameters, { exchanges });
        // console.log(query);
        const sierraUrl = (this.plugin.customState as ViewerState).detachedFromSierra ? ABSOLUTE_ADVANCED_SEARCH_URL : RELATIVE_ADVANCED_SEARCH_URL;
        const csmTag = CSM_REGEX.test(entry_id) ? CSM_TAG : '';
        const url = sierraUrl + encodeURIComponent(JSON.stringify(query)) + RETURN_TYPE + csmTag;
        // console.log(url);
        window.open(url, '_blank');
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

export class Residue {
    readonly exchanges: Set<string>;

    constructor(readonly entry: StructureSelectionHistoryEntry, readonly parent: SubmitControls) {
        this.exchanges = new Set<string>();
        // by default: explicitly 'activate' original residue type
        const structure = entry.loci.structure;
        const e = entry.loci.elements[0];
        StructureElement.Location.set(location, structure, e.unit, e.unit.elements[OrderedSet.getAt(e.indices, 0)]);

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