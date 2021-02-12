import React = require('react');
import { CollapsableControls, CollapsableState, PluginUIComponent } from 'molstar/lib/mol-plugin-ui/base';
import { Button } from 'molstar/lib/mol-plugin-ui/controls/common';
import { GetAppSvg } from 'molstar/lib/mol-plugin-ui/controls/icons';
import { encodeStructureData, downloadAsZipFile } from '../helpers/export';

export class ExportControls extends CollapsableControls {

    protected defaultState(): CollapsableState {
        return {
            header: 'Export',
            isCollapsed: true,
            brand: { accent:  'gray' as const, svg: ExportOutlinedSvg }
        };
    }

    componentDidMount() {
        this.subscribe(this.plugin.managers.structure.hierarchy.behaviors.selection, sel => {
            this.setState({ isHidden: sel.structures.length === 0 });
        });
    }

    protected renderControls(): JSX.Element | null {
        return <div className={'msp-control-offset'} style={{ paddingTop: '1px' }}>
            <CoordinatesExportControls />
        </div>;
    }
}

class CoordinatesExportControls extends PluginUIComponent<{ onAction?: () => void }> {

    download = () => {
        this.props.onAction?.();
        const content = encodeStructureData(this.plugin);
        downloadAsZipFile(content);
    }

    render() {
        return <>
            <div className='msp-flex-row'>
                <Button icon={GetAppSvg} onClick={this.download} title='Save structures as mmCIF files'>
                    Structures
                </Button>
            </div>
        </>;
    }
}

function ExportOutlinedSvg() { return _ExportOutlined; }
const _ExportOutlined = <svg width='24px' height='24px' viewBox='0 0 24 24' strokeWidth='0.1px'><path d="M19 12v7H5v-7H3v9h18v-9h-2zm-6 .67l2.59-2.58L17 11.5l-5 5-5-5 1.41-1.41L11 12.67V3h2v9.67z" /></svg>;
