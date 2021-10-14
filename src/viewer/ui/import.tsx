/**
 * Copyright (c) 2019-2020 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import { StateTransform } from 'molstar/lib/mol-state';
import { OpenFiles } from 'molstar/lib/mol-plugin-state/actions/file';
import { DownloadStructure } from 'molstar/lib/mol-plugin-state/actions/structure';
import { ApplyActionControl } from 'molstar/lib/mol-plugin-ui/state/apply-action';
import { CollapsableControls } from 'molstar/lib/mol-plugin-ui/base';
import { FileOutlineSvg } from 'molstar/lib/mol-plugin-ui/controls/icons';

export class ImportControls extends CollapsableControls {
    protected defaultState() {
        return {
            header: 'Import',
            isCollapsed: false,
            brand: { accent: 'gray' as const, svg: FileOutlineSvg }
        };
    }

    renderControls() {
        return <div className={'msp-control-offset'} style={{ paddingTop: '1px' }}>
            <ApplyActionControl key={`${OpenFiles.id}`} state={this.plugin.state.data} action={OpenFiles} nodeRef={StateTransform.RootRef} initiallyCollapsed={true} />
            <ApplyActionControl key={`${DownloadStructure.id}`} state={this.plugin.state.data} action={DownloadStructure} nodeRef={StateTransform.RootRef} initiallyCollapsed={true} />
        </div>;
    }
}