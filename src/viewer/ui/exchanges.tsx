/**
 * Copyright (c) 2020 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Sebastian Bittrich <sebastian.bittrich@rcsb.org>
 */
import * as React from 'react';
import {Button} from 'molstar/lib/mol-plugin-ui/controls/common';

export const DefaultExchanges = [
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
    ['A', 'Adenosine'],
    ['C', 'Cytidine'],
    ['DA', 'Deoxyadenosine'],
    ['DC', 'Deoxycytidine'],
    ['DG', 'Deoxyguanosine'],
    ['G', ',Guanosine'],
    ['T', 'Thymidine'],
    ['U', 'Uridine']
];

export class ExchangesControl extends React.PureComponent<{}, { exchanges: Set<string> }> {
    state = {
        exchanges: new Set<string>()
    }

    onClickSwatch = (e: React.MouseEvent<HTMLButtonElement>) => {
        const tlc = e.currentTarget.getAttribute('data-id')!;
        if (this.state.exchanges.has(tlc)) {
            this.setState(({ exchanges }) => {
                const newExchanges = new Set(exchanges);
                newExchanges.delete(tlc);

                return {
                    exchanges: newExchanges
                };
            });
        } else {
            this.setState(({ exchanges }) => ({
                exchanges: new Set(exchanges).add(tlc)
            }));
        }
    }

    swatch() {
        // TODO it would be nice to only display relevant exchanges (amino acids for amino acids, nucleotides for nucl)
        // TODO update of isSelected style is delayed
        return <div className='msp-combined-color-swatch'>
            {DefaultExchanges.map(e => {
                const isSelected = this.state.exchanges.has(e[0]);
                const className = isSelected ? 'msp-control-current' : '';
                return <Button key={e[0]} title={e[1]} inline data-id={e[0]} onClick={this.onClickSwatch} style={{ padding: 0, fontSize: '13px' }} className={className}>
                    {e[0] && isSelected ? <b>{e[0]}</b> : e[0]}
                </Button>;
            })}
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