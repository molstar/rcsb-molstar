/**
 * Copyright (c) 2019 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import * as path from 'path'

export const getStructureViewerAbsoluteFSPath = function () {
    return path.resolve(path.join(__dirname, '..', 'dist', 'structure-viewer'))
}
