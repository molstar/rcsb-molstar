import { PluginContext } from 'molstar/lib/mol-plugin/context';
import { StateSelection } from 'molstar/lib/mol-state';
import { PluginStateObject } from 'molstar/lib/mol-plugin-state/objects';
import { StructureSelection, Structure } from 'molstar/lib/mol-model/structure';
import { CifExportContext, encode_mmCIF_categories } from 'molstar/lib/mol-model/structure/export/mmcif';
import { utf8ByteCount, utf8Write } from 'molstar/lib/mol-io/common/utf8';
import { zip } from 'molstar/lib/mol-util/zip/zip';
import { getFormattedTime } from 'molstar/lib/mol-util/date';
import { download } from 'molstar/lib/mol-util/download';
import { CustomPropertyDescriptor } from 'molstar/lib/mol-model/custom-property';
import { CifWriter } from 'molstar/lib/mol-io/writer/cif';

type encode_mmCIF_categories_Params = {
    skipCategoryNames?: Set<string>,
    exportCtx?: CifExportContext,
    copyAllCategories?: boolean,
    customProperties?: CustomPropertyDescriptor[]
}

function exportParams(): encode_mmCIF_categories_Params {
    const skipCategories: Set<string> = new Set();
    skipCategories.add('pdbx_struct_assembly').add('pdbx_struct_assembly_gen').add('pdbx_struct_oper_list');
    const params: encode_mmCIF_categories_Params = {
        skipCategoryNames: skipCategories
    };
    return params;
}

function to_mmCIF(name: string, structure: Structure, asBinary = false) {
    const enc = CifWriter.createEncoder({ binary: asBinary });
    enc.startDataBlock(name);
    encode_mmCIF_categories(enc, structure, exportParams());
    return enc.getData();
}

function getDecorator(plugin: PluginContext, root: string): string {
    const tree = plugin.state.data.tree;
    const children = tree.children.get(root);
    if (children.size !== 1) return root;
    const child = children.first();
    if (tree.transforms.get(child).transformer.definition.isDecorator) {
        return getDecorator(plugin, child);
    }
    return root;
}

function extractStructureDataFromState(plugin: PluginContext): { [k: string]: Structure } {
    const content: { [k: string]: Structure } = {};
    const cells = plugin.state.data.select(StateSelection.Generators.rootsOfType(PluginStateObject.Molecule.Structure));
    for (let i=0; i<cells.length; i++) {
        const c = cells[i];
        const nodeRef = getDecorator(plugin, c.transform.ref);
        const children = plugin.state.data.select(StateSelection.Generators.byRef(nodeRef))
            .map(child => child.obj!.data);
        const sele = StructureSelection.Sequence(c.obj!.data, children);
        const structure = StructureSelection.unionStructure(sele);
        const name = `${i+1}-${structure.model.entryId}`;
        content[name] = structure;
    }
    return content;
}

export function encodeStructureData(plugin: PluginContext): { [k: string]: Uint8Array } {
    const content: { [k: string]: Uint8Array } = {};
    const structures = extractStructureDataFromState(plugin);
    for (const [key, structure] of Object.entries(structures)) {
        const filename = `${key}.cif`;
        const str = to_mmCIF(filename, structure, false) as string;
        const data = new Uint8Array(utf8ByteCount(str));
        utf8Write(data, 0, str);
        content[filename] = data;
    }
    return content;
}

export function downloadAsZipFile(content: { [k: string]: Uint8Array }) {
    const filename = `mol-star_download_${getFormattedTime()}.zip`;
    const buf = zip(content)
    download(new Blob([buf]), filename);
}
