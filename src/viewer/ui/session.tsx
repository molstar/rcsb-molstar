/**
 * Copyright (c) 2020 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import { CollapsableControls } from 'molstar/lib/mol-plugin-ui/base';
import { LocalStateSnapshots, LocalStateSnapshotList, StateExportImportControls } from 'molstar/lib/mol-plugin-ui/state/snapshots';
import { SaveOutlinedSvg } from 'molstar/lib/mol-plugin-ui/controls/icons';

class LocalStateControls extends CollapsableControls {
    protected defaultState() {
        return {
            header: 'Views',
            isCollapsed: true,
        };
    }

    renderControls() {
        return <div>
            <LocalStateSnapshots />
            <LocalStateSnapshotList />
        </div>;
    }
}

class StateControls extends CollapsableControls {
    protected defaultState() {
        return {
            header: 'Download / Open',
            isCollapsed: true,
        };
    }

    renderControls() {
        return <div>
            <StateExportImportControls />
        </div>;
    }
}

export class SessionControls extends CollapsableControls {
    protected defaultState() {
        return {
            header: 'Session',
            isCollapsed: true,
            brand: { accent: 'gray' as const, svg: SaveOutlinedSvg }
        };
    }

    renderControls() {
        return <div className={'msp-control-offset'} style={{ paddingTop: '1px' }}>
            <LocalStateControls />
            <StateControls />
        </div>;
    }
}