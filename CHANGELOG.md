# RCSB Mol* Changelog

[Semantic Versioning](https://semver.org/)

## [2.14.2] - 2026-01-16
### API
- Selects surrounding polymeric residues within a specified radius of a given target
- Order a list of targets by their spatial distance to a pivot target

## [2.14.1] - 2026-01-08
### General
- Update of RSCC statistics (RO-4900)

## [2.14.0] - 2025-12-18
### General
- Default assembly preset
- More configuration options for controls in the layout and viewport

### API
- Subscribe to a structural selection-related event in the plugin
- Update the interactivity settings in the plugin's interactivity manager
- Retrieve the list of assembly IDs for a default structure model
- Retrieve asym and author chain IDs for a default structure model
- Set the current structure view based on the provided assembly ID
- Add custom labels to specified targets within the current structure
- Focus on a specific residue within the current structure
- Set ball and stick representation for a specific target
- Determine the unknown assemblyId for a set of targets
- Toggle visibility of structure component groups

## [2.13.0] - 2025-09-29
### General
- Dependency update: Mol* to v5.0.0

## [2.12.1] - 2025-05-21
### General
- Mol* dependency update

## [2.12.0] - 2025-05-20
### Improvements
- IHM adjustments

## [2.11.4] - 2025-04-04
### General
- Better handling for motifs in assembly-less entries (RO-4624)

## [2.11.3] - 2025-04-02
### General
- Dependency updates
- React 19 support

## [2.11.2] - 2025-01-27
### General
- Dependency updates (RO-4535: PDB-IHM rebranding)

## [2.11.1] - 2024-12-17
### General
- Dependency updates

## [2.11.0] - 2024-11-27
### General
- Enable Predicted Aligned Error Panel (RO-3593)

## [2.10.6] - 2024-10-28
### General
- Dependency & SCSS updates

## [2.10.5] - 2024-10-03
### General
- Dependency updates (e.g., higher resolution on mobile)

## [2.10.4] - 2024-09-30
### General
- Dependency updates
- Sequence Viewer: Adjust visuals of unobserved regions (HELP-21475)

## [2.10.3] - 2024-07-01
### Bug fixes
- HELP-21267: don't apply pLDDT coloring to experimental structures

## [2.10.2] - 2024-07-01
### General
- Dependency updates

## [2.10.1] - 2024-05-22
### General
- Update of RSCC statistics (RO-3983)

## [2.10.0] - 2024-05-01
### Added
- GlyGen visuals (RO-4259)

## [2.9.4] - 2024-04-16
### General
- Dependency updates

## [2.9.3] - 2024-02-28
### General
- Adjust superimpose/motif visuals to include ball-and-stick representation of carbohydrates (RO-4202)

## [2.9.2] - 2024-02-26
### General
- Dependency update to Mol* v4

## [2.9.1] - 2024-01-24
### General
- Dependency update

## [2.9.0] - 2023-12-15
### Added
- Ligand Viewer: expose MP4 export
- Ligand Viewer: toggle state of controls when expanding viewport

## [2.8.3] - 2023-11-06
### Added
- Less intrusive tooltips in ligand viewer (RO-4126)

## [2.8.2] - 2023-10-25
### Added
- Option to show density as wireframe (RO-4085)

## [2.8.1] - 2023-10-16
### Bug fixes
- Fix undesired interaction between settings panel and the panel on the right

## [2.8.0] - 2023-10-02
### Added
- Dedicated ligand viewer for the visualization of CCD/BIRD entries

## [2.7.4] - 2023-08-23
### Added
- Motif preset: Show global structure

## [2.7.3] - 2023-08-14
### Added
- Relaxed strucmotif distance requirement from 15 to 20 A

## [2.7.2] - 2023-07-25
### Bug fixes
- Fix detection of CCD files

## [2.7.1] - 2023-06-28
### Improvement
- Delegate the responsibility for setting structure label to representation provider, when available

## [2.7.0] - 2023-06-28
### Added
- Allow setting a structure label when loading from URL

## [2.6.2] - 2023-06-12
### General
- Update dependencies

### Bug fixes
- Make sure density channels are conditionally hidden (RO-3706)

## [2.6.1] - 2023-05-16
### General
- Update dependencies

## [2.6.0] - 2023-03-15
### Added
- Upload non-archive structures when searching structure motifs (RO-2771)

### Bug fixes
- Change transformation matrix for alignment example

## [2.5.11] - 2023-02-03
### Improvement
- Return trajectory-provider object in loading methods

## [2.5.10] - 2023-01-26
### Bug fixes
- Improve handling of `collapsed` state for assembly symmetry UI

## [2.5.9] - 2023-01-03
### General
- Update dependencies
- Fix handling of struct_oper_ids when extracting structure motifs

## [2.5.8] - 2022-10-19
### General
- Bump dependencies to Mol* 3.23.0 (switch to 'auto' mode for EM density maps)

## [2.5.7] - 2022-10-07
### General
- Bump dependencies

## [2.5.6] - 2022-09-15
### Bug fixes
- Make outgoing strucmotif query URL context-aware

## [2.5.5] - 2022-07-28
### Bug fixes
- Strucmotif UI: improve handling of modified & non-standard components

## [2.5.4] - 2022-07-28
### Bug fixes
- Avoid deprecated React API
- Rename 'RCSB PDB Validation Report' to 'Validation Report'

## [2.5.3] - 2022-07-24
### Bug fixes
- [Breaking Change] renamed `prop-set` preset to `alignment`, renamed `representation` to `colors`
- Pecos related changes

## [2.5.2] - 2022-07-21
### Bug fixes
- Fix outgoing strucmotif query URL

## [2.5.1] - 2022-07-19
### Bug fixes
- Rename presets/themes for RSCC coloring
- Improve handling of missing RSCC values

## [2.5.0] - 2022-07-18
### Added
- RSCC coloring & validation option

## [2.4.2] - 2022-07-08
### Bug fixes
- Strucmotif UI: call `blur()` to update CSS style properly

## [2.4.1] - 2022-05-16
### Bug fixes
- Mol* 3.8.1 (fix Polymer Chain Instance coloring)

## [2.4.0] - 2022-05-12
### Added
- Auto-apply pLDDT confidence coloring for single chains

## [2.3.0] - 2022-04-04
### Added
- NAKB preset (nucleic acids colored by residue-name, everything else by entity-id)

### Bug fixes
- RO-3186: fix detection of disulfide bridges
- RO-3194: fix density maps for entries with half-maps

## [2.2.1] - 2022-02-28
### Bug fixes
- RO-3063: parse v3 EMDB header XML properly
- Mol* 3.3.1 (performance improvements)

## [2.2.0] - 2022-02-22
### Added
- Expose Quick Styles functionality
- More fine-grained options for UI controls
- Expose Canvas3DProps

## [2.1.2] - 2022-02-08
### General
- RO-2766: Allow strucmotif of 2 residues

## [2.1.1] - 2022-02-07
### General
- Mol* 3.1.0 (Quick Styles panel, default representation tweaks)
- RO-2968: better error message when density data can't be fetched

## [2.1.0] - 2022-02-03
### Added
- Expose GeometryExport functionality

### Breaking Internal Change
- Remove `ExportControls` et al. in favor of impl from parent project
- `viewer#exportLoadedStructures` now returns single structures directly (rather than as a ZIP file)

### General
- Mol* 3.0.2

### Bug fixes
- RO-2605: check for single space-group, hkl, & NCS operator before submitting strucmotif queries

## [2.0.9] - 2022-01-24
### General
- Update to Mol* 3.0.0 

## [2.0.8] - 2022-01-18
### General
- Update Mol* & some other dependencies

## [2.0.7] - 2022-01-13
### General
- Update links to new Mol* organization

## [2.0.6] - 2022-01-10
### Breaking Internal Change
- Remove `PLDDTConfidenceScore` in favor of impl from parent project

## [2.0.5] - 2022-01-10
### General
- Update Mol* dependency

## [2.0.4] - 2022-01-03
### General
- Update Mol* dependency

### Bug fixes
- Show downloaded structures with default/auto representation

## [2.0.3] - 2021-12-20
### General
- Hide unusable Animate State Snapshots option

## [2.0.2] - 2021-12-16
### General
- Update Mol* dependency

## [2.0.1] - 2021-12-07
### Bug fixes
- fix typo in pLDDT behavior name

## [2.0.0] - 2021-12-07
### Breaking changes
- `loadStructureFromData()` is not async anymore
- Replaced `getPlugin()` by `plugin()` getter
- Signature changes to `setFocus()`, `select()`, `clearSelection()`, and `createComponent()`
  - Effectively the overloaded methods were replaced by ones that use `Target` objects to reference residues/ranges
- Merged `Range` into `Target`
  - 'CIF' fields are now represented as camelCase (`label_asym_id` to `labelAsymId`)
  - Renamed `label_seq_id` to `labelSeqRange` (if referring to a range and not a single residue)
- `ColorProp` and `PropsetProps` now use `Target`
  - `positions` and `selection` props renamed to `targets` of type `Target[]`
- Changed loading methods signature 
  - Added optional configuration parameter `config?: {props?: PresetProps; matrix?: Mat4; reprProvider?: TrajectoryHierarchyPresetProvider, params?: P}`
  - The loading configuration includes an optional trajectory preset provider `TrajectoryHierarchyPresetProvider`
- Remove `alignMotif` methods (& pecos-integration) as the strucmotif service now reports RMSD and transformations for all hits

### Bug fixes
- Support multiple chains in pLDDT confidence coloring

## [1.10.1] - 2021-11-30
### General
- Update Mol* dependency

## [1.10.0] - 2021-11-22
### Added
- Dedicated UI for quality assessment & validation reports

## [1.9.6] - 2021-11-16
### General
- Try to fix packing issues

## [1.9.5] - 2021-11-16
### General
- Mol* 2.3.7 (more WebGL fixes)

## [1.9.4] - 2021-11-02
### General
- Mol* 2.3.5 and other dependencies (iOS WebGL fixes)

## [1.9.3] - 2021-10-18
### Bug fixes
- Rewire index parameter of symmetry preset

## [1.9.2] - 2021-10-15
### Bug fixes
- removed implicit 'chain-mode', must be explicitly requested by setting 'extendToChain' to true as part of the part

## [1.9.1] - 2021-10-14
### Bug fixes
- More robust 'chain-mode' check in feature preset
- Don't expand MP4 export controls as part of the symmetry preset

## [1.9.0] - 2021-09-29
### Added
- Integrate PDBe/AlphaFold confidence coloring theme

## [1.8.8] - 2021-09-28
### General
- Mol* 2.3.1

## [1.8.7] - 2021-08-25
### General
- Mol* 2.2.3

## [1.8.6] - 2021-08-23
### General
- Display warning if membrane preset calculation fails
- Add fallback if membrane preset calculation fails

## [1.8.5] - 2021-08-11
### General
- Update strucmotif integration with rcsb.org

## [1.8.4] - 2021-08-03
### General
- Mol* 2.2.1
- Reset camera for membrane preset

## [1.8.3] - 2021-07-23
### General
- Rename 'Structural Motif Search' to 'Structure Motif Search'

## [1.8.2] - 2021-07-20
### Bug fixes
- Post-pare for pecos API changes

## [1.8.1] - 2021-07-16
### Added
- Prepare for pecos API changes

## [1.8.0] - 2021-07-13
### Added
- Moved code for motif alignment (i.e., talking to pecos) here

## [1.7.4] - 2021-07-12
### Bug fixes
- structure selection: handle selection of full chains

## [1.7.3] - 2021-07-08
### Bug fixes
- Strucmotif: relative URLs when running inside of sierra

## [1.7.2] - 2021-07-05
### Bug fixes
- Code that determines assemblyId is now aware of label_asym_id

## [1.7.1] - 2021-07-02
### Bug fixes
- Strucmotif UI now reports chained operators that can be used by sierra/arches/strucmotif
- Motif preset now works if no assemblyId was provided

### Breaking Changes
- Rename experimental 'structOperExpression' prop to 'struct_oper_id'

## [1.7.0] - 2021-06-24
### Added
- Visualize (an arbitrary number of) structural motifs

### Bug fixes
- Fix order of operators in strucmotif queries

## [1.6.9] - 2021-06-23
### Added
- Mol* 2.0.7 & some internal cleanup

## [1.6.8] - 2021-06-11
### Added
- Hide all but 2Fo-Fc map (RO-2751)

## [1.6.6] - 2021-06-08
### Added
- Special density preset with 0(-ish) radius for ligands (RO-2751)

## [1.6.5] - 2021-06-03
### Bug fixes
- Access to maps.rcsb.org via HTTPS

## [1.6.4] - 2021-06-02
### Added
- Option to show membrane orientation preset

## [1.6.3] - 2021-06-01
### Bug fixes
- Improve quality of ANVIL prediction
- Improve ANVIL & ASA calculation performance

## [1.6.2] - 2021-05-12
### Bug fixes
- Clean up viewer init routine

## [1.6.1] - 2021-05-04
### Bug fixes
- Multiple region selection (only last one was selected) bug fixed

## [1.6.0] - 2021-05-03
### Viewer class new methods
- Added new methods for selection, creating components and focus

## [1.5.1] - 2021-04-30
### Bug fixes
- 'Membrane Orientation' preset now honors assembly-ids

## [1.5.0] - 2021-04-22
### Added
- feature density preset for ligand validation

### Bug fixes
- hide 'Membrane Orientation' representation from UI

## [1.4.2] - 2021-04-20
### Bug fixes
- fix measurement labels
- hide 'Membrane Orientation' preset from UI

## [1.4.1] - 2021-04-06
### Bug fixes
- structure export: getting transformed data

## [1.4.0] - 2021-04-02
### Added
- membrane orientation preset by ANVIL

## [1.3.5] - 2021-03-25
### Bug fixes
- make sure only structure objects are filtered in for export
- do not create unit cell object when alignments are loaded

## [1.3.4] - 2021-03-25
### Bug fixes
- structure export: getting children for a referenced node correctly

## [1.3.3] - 2021-03-24
### Bug fixes
- build

## [1.3.2] - 2021-03-24
### General
- major version update of Mol*

## [1.3.1] - 2021-03-11
### Bug fixes
- this is a dummy release

## [1.3.0] - 2021-03-10
### Added
- expose video export option

## [1.2.3] - 2021-03-03
### Bug fixes
- warn when residues are more than 15 A apart (RO-2597)

## [1.2.2] - 2021-02-26
### Bug fixes
- switch to 'model' when ligand preset is requested but ligand is not present in assembly '1' - HELP-16678

## [1.2.1] - 2021-02-18
### Bug fixes
- limit number of exchanges per position
- hide State Tree panel

## [1.2.0] - 2021-02-16
### General
-  structure alignment data visualization

## [1.1.0] - 2021-02-08
### General
- structural motif search wizard

## [1.0.35] - 2021-02-08
### General
- Mol* 1.3.0

## [1.0.34] - 2021-02-05
### General
- bumps dependencies

## [1.0.33] - 2021-02-02
### General
- let's call this the initial release