/**
 * Copyright (c) 2020 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Sebastian Bittrich <sebastian.bittrich@rcsb.org>
 */
import * as React from 'react';
import { Button } from 'molstar/lib/mol-plugin-ui/controls/common';
import { MAX_EXCHANGES, Residue } from './strucmotif';

export const DefaultExchanges: Map<string, string> = new Map([
    ['ALA', 'Alanine'],
    ['CYS', 'Cysteine'],
    ['ASP', 'Aspartic Acid'],
    ['GLU', 'Glutamic Acid'],
    ['PHE', 'Phenylalanine'],
    ['GLY', 'Glycine'],
    ['HIS', 'Histidine'],
    ['ILE', 'Isoleucine'],
    ['LYS', 'Lysine'],
    ['LEU', 'Leucine'],
    ['MET', 'Methionine'],
    ['ASN', 'Asparagine'],
    ['PRO', 'Proline'],
    ['GLN', 'Glutamine'],
    ['ARG', 'Arginine'],
    ['SER', 'Serine'],
    ['THR', 'Threonine'],
    ['VAL', 'Valine'],
    ['TRP', 'Tryptophan'],
    ['TYR', 'Tyrosine'],
    ['DA', 'Deoxyadenosine'],
    ['DC', 'Deoxycytidine'],
    ['DG', 'Deoxyguanosine'],
    ['DT', 'Deoxythymidine'],
    ['A', 'Adenosine'],
    ['C', 'Cytidine'],
    ['G', 'Guanosine'],
    ['U', 'Uridine'],
]);

export class ExchangesControl extends React.Component<{ handler: Residue }> {
    onClickSwatch = (e: React.MouseEvent<HTMLButtonElement>) => {
        const tlc = e.currentTarget.getAttribute('data-id')!;
        this.props.handler.toggleExchange(tlc);
        // this makes Chrome pick up CSS change
        e.currentTarget.blur();
    };

    swatch() {
        const out: JSX.Element[] = [];
        DefaultExchanges.forEach((v, k) => {
            const isSelected = this.props.handler.hasExchange(k);
            const className = isSelected ? 'msp-control-current' : '';
            const isDisabled = this.props.handler.exchanges.size >= MAX_EXCHANGES && !isSelected;

            out[out.length] = <Button key={k} title={v} inline data-id={k} onClick={this.onClickSwatch} style={{ padding: 0, fontSize: '13px' }} className={className} disabled={isDisabled}>
                {k && isSelected ? <b>{k}</b> : k}
            </Button>;
        });

        return <div className='msp-combined-color-swatch'>
            { out }
        </div>;
    }

    render() {
        return <>
            <div className='msp-control-offset'>
                {this.swatch()}
            </div>
        </>;
    }
}