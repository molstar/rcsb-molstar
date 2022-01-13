[![npm version](https://badge.fury.io/js/%40rcsb%2Frcsb-molstar.svg)](https://www.npmjs.com/package/@rcsb/rcsb-molstar)
[![Changelog](https://img.shields.io/badge/changelog--lightgrey.svg?style=flat)](https://github.com/molstar/rcsb-molstar/blob/master/CHANGELOG.md)
[![License](http://img.shields.io/badge/license-MIT-blue.svg?style=flat)](./LICENSE)

RCSB PDB implementation of [Mol* (/'mol-star/)](https://github.com/molstar/molstar).
Try it [here](https://rcsb.org/3d-view/).

PDBe also maintains a flavor of Mol* called [PDBe Molstar](https://github.com/PDBeurope/pdbe-molstar).
Documentation of the parent Mol* project can be found [here](https://molstar.org/docs/). See [index.html](https://github.com/molstar/rcsb-molstar/blob/master/src/viewer/index.html) for examples.

When using Mol*, please cite:

David Sehnal, Sebastian Bittrich, Mandar Deshpande, Radka Svobodová, Karel Berka, Václav Bazgier, Sameer Velankar, Stephen K Burley, Jaroslav Koča, Alexander S Rose: [Mol* Viewer: modern web app for 3D visualization and analysis of large biomolecular structures](https://doi.org/10.1093/nar/gkab314), *Nucleic Acids Research*, 2021; https://doi.org/10.1093/nar/gkab314.

## Functionality
Provides custom features used in the Mol* viewer on [rcsb.org](https://www.rcsb.org/3d-view):
- visualization of structure alignments
- visualization of structure motifs & UI to launch structure motif queries
- interactivity functionality to highlight and add representations for selections of a structure, used in the [3D Protein Feature View](https://www.rcsb.org/3d-sequence/4hhb)
- bookmarkable focus representation on ligands or chains

## Install
    npm install @rcsb/rcsb-molstar

## Building & Running

### Build:
    npm install
    npm run build

### Build automatically on file save:
    npm run watch

### Build with debug mode enabled:
    DEBUG=molstar npm run watch

### Build for production:
    npm run build

**Run**

If not installed previously:

    npm install -g http-server

...or a similar solution.

From the root of the project:

    http-server -p PORT-NUMBER

and navigate to `build/dist/viewer/`

## Prerelease
    npm version prerelease # assumes the current version ends with '-dev.X'
    npm publish --tag next

## Release
    npm version 1.X.0 # provide valid semver string
    npm publish

## Funding
Funding sources include but are not limited to:
* [RCSB PDB](https://www.rcsb.org) funding by a grant [DBI-1338415; PI: SK Burley] from the NSF, the NIH, and the US DoE
* [PDBe, EMBL-EBI](https://pdbe.org)
* [CEITEC](https://www.ceitec.eu/)
* [EntosAI](https://www.entos.ai)