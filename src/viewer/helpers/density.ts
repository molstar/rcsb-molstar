/**
 * Copyright (c) 2019-2020 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author David Sehnal <david.sehnal@gmail.com>
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import { PluginStateObject as SO, PluginStateTransform } from 'molstar/lib/mol-plugin-state/objects';
import { ParamDefinition as PD } from 'molstar/lib/mol-util/param-definition';
import { Task } from 'molstar/lib/mol-task';
import { PluginContext } from 'molstar/lib/mol-plugin/context';
import { Volume } from 'molstar/lib/mol-model/volume';
import { StateAction, StateObject, StateTransformer } from 'molstar/lib/mol-state';
import { VolumeRepresentation3DHelpers } from 'molstar/lib/mol-plugin-state/transforms/representation';
import { VolumeRepresentationRegistry } from 'molstar/lib/mol-repr/volume/registry';
import { Theme } from 'molstar/lib/mol-theme/theme';
import { Model } from 'molstar/lib/mol-model/structure';
import { GlobalModelTransformInfo } from 'molstar/lib/mol-model/structure/model/properties/global-transform';
import {
    getContourLevel,
    getEmdbIds,
    getIds,
    getStreamingMethod
} from 'molstar/lib/mol-plugin/behavior/dynamic/volume-streaming/util';
import { VolumeStreaming } from 'molstar/lib/mol-plugin/behavior/dynamic/volume-streaming/behavior';
import { PluginConfig } from 'molstar/lib/mol-plugin/config';
import { VolumeServerInfo } from 'molstar/lib/mol-plugin/behavior/dynamic/volume-streaming/model';
import {
    CreateVolumeStreamingBehavior,
    CreateVolumeStreamingInfo
} from 'molstar/lib/mol-plugin/behavior/dynamic/volume-streaming/transformers';

// TODO SMB 6/11/21 - this is a temp impl, safe to remove as soon as the next Mol* version after 2.0.6 is released

function addEntry(entries: InfoEntryProps[], method: VolumeServerInfo.Kind, dataId: string, emDefaultContourLevel: number) {
    entries.push({
        source: method === 'em'
            ? { name: 'em', params: { isoValue: Volume.IsoValue.absolute(emDefaultContourLevel || 0) } }
            : { name: 'x-ray', params: { } },
        dataId
    });
}

export const InitVolumeStreaming = StateAction.build({
    display: { name: 'Volume Streaming' },
    from: SO.Molecule.Structure,
    params(a, plugin: PluginContext) {
        const method = getStreamingMethod(a && a.data);
        const ids = getIds(method, a && a.data);
        return {
            method: PD.Select<VolumeServerInfo.Kind>(method, [['em', 'EM'], ['x-ray', 'X-Ray']]),
            entries: PD.ObjectList({ id: PD.Text(ids[0] || '') }, ({ id }) => id, { defaultValue: ids.map(id => ({ id })) }),
            defaultView: PD.Select<VolumeStreaming.ViewTypes>(method === 'em' ? 'cell' : 'selection-box', VolumeStreaming.ViewTypeOptions as any),
            options: PD.Group({
                serverUrl: PD.Text(plugin.config.get(PluginConfig.VolumeStreaming.DefaultServer) || 'https://ds.litemol.org'),
                behaviorRef: PD.Text('', { isHidden: true }),
                emContourProvider: PD.Select<'emdb' | 'pdbe'>('emdb', [['emdb', 'EMDB'], ['pdbe', 'PDBe']], { isHidden: true }),
                channelParams: PD.Value<VolumeStreaming.DefaultChannelParams>({}, { isHidden: true })
            })
        };
    },
    isApplicable: (a, _, plugin: PluginContext) => {
        const canStreamTest = plugin.config.get(PluginConfig.VolumeStreaming.CanStream);
        if (canStreamTest) return canStreamTest(a.data, plugin);
        return a.data.models.length === 1 && Model.probablyHasDensityMap(a.data.models[0]);
    }
})(({ ref, state, params }, plugin: PluginContext) => Task.create('Volume Streaming', async taskCtx => {
    const entries: InfoEntryProps[] = [];

    for (let i = 0, il = params.entries.length; i < il; ++i) {
        let dataId = params.entries[i].id.toLowerCase();
        let emDefaultContourLevel: number | undefined;

        if (params.method === 'em') {
            // if pdb ids are given for method 'em', get corresponding emd ids
            // and continue the loop
            if (!dataId.toUpperCase().startsWith('EMD')) {
                await taskCtx.update('Getting EMDB info...');
                const emdbIds = await getEmdbIds(plugin, taskCtx, dataId);
                for (let j = 0, jl = emdbIds.length; j < jl; ++j) {
                    const emdbId = emdbIds[j];
                    let contourLevel: number | undefined;
                    try {
                        contourLevel = await getContourLevel(params.options.emContourProvider, plugin, taskCtx, emdbId);
                    } catch (e) {
                        console.info(`Could not get map info for ${emdbId}: ${e}`);
                        continue;
                    }
                    addEntry(entries, params.method, emdbId, contourLevel || 0);
                }
                continue;
            }
            try {
                emDefaultContourLevel = await getContourLevel(params.options.emContourProvider, plugin, taskCtx, dataId);
            } catch (e) {
                console.info(`Could not get map info for ${dataId}: ${e}`);
                continue;
            }
        }

        addEntry(entries, params.method, dataId, emDefaultContourLevel || 0);
    }

    const infoTree = state.build().to(ref)
        .applyOrUpdateTagged(VolumeStreaming.RootTag, CreateVolumeStreamingInfo, {
            serverUrl: params.options.serverUrl,
            entries
        });

    await infoTree.commit();

    const info = infoTree.selector;
    if (!info.isOk) return;

    // clear the children in case there were errors
    const children = state.tree.children.get(info.ref);
    if (children?.size > 0) await plugin.managers.structure.hierarchy.remove(children?.toArray());

    const infoObj = info.cell!.obj!;

    const behTree = state.build().to(infoTree.ref).apply(CreateVolumeStreamingBehavior,
        PD.getDefaultValues(VolumeStreaming.createParams({ data: infoObj.data, defaultView: params.defaultView, channelParams: params.options.channelParams })),
        { ref: params.options.behaviorRef ? params.options.behaviorRef : void 0 });

    if (params.method === 'em') {
        behTree.apply(VolumeStreamingVisual, { channel: 'em' }, { state: { isGhost: true }, tags: 'em' });
    } else {
        behTree.apply(VolumeStreamingVisual, { channel: '2fo-fc' }, { state: { isGhost: true }, tags: '2fo-fc' });
        behTree.apply(VolumeStreamingVisual, { channel: 'fo-fc(+ve)' }, { state: { isGhost: true }, tags: 'fo-fc(+ve)' });
        behTree.apply(VolumeStreamingVisual, { channel: 'fo-fc(-ve)' }, { state: { isGhost: true }, tags: 'fo-fc(-ve)' });
    }
    await state.updateTree(behTree).runInContext(taskCtx);
}));

const InfoEntryParams = {
    dataId: PD.Text(''),
    source: PD.MappedStatic('x-ray', {
        'em': PD.Group({
            isoValue: Volume.createIsoValueParam(Volume.IsoValue.relative(1))
        }),
        'x-ray': PD.Group({ })
    })
};
type InfoEntryProps = PD.Values<typeof InfoEntryParams>

export { VolumeStreamingVisual };
type VolumeStreamingVisual = typeof VolumeStreamingVisual
const VolumeStreamingVisual = PluginStateTransform.BuiltIn({
    name: 'create-volume-streaming-visual-custom',
    display: { name: 'Volume Streaming Visual' },
    from: VolumeStreaming,
    to: SO.Volume.Representation3D,
    params: {
        channel: PD.Select<VolumeStreaming.ChannelType>('em', VolumeStreaming.ChannelTypeOptions, { isHidden: true })
    }
})({
    apply: ({ a, params: srcParams, spine }, plugin: PluginContext) => Task.create('Volume Representation', async ctx => {
        const channel = a.data.channels[srcParams.channel];
        if (!channel) return StateObject.Null;

        const params = createVolumeProps(a.data, srcParams.channel);
        const provider = VolumeRepresentationRegistry.BuiltIn.isosurface;
        const props = params.type.params || {};
        const repr = provider.factory({ webgl: plugin.canvas3d?.webgl, ...plugin.representation.volume.themes }, provider.getParams);
        repr.setTheme(Theme.create(plugin.representation.volume.themes, { volume: channel.data }, params));
        const structure = spine.getAncestorOfType(SO.Molecule.Structure)?.data;
        const transform = structure?.models.length === 0 ? void 0 : GlobalModelTransformInfo.get(structure?.models[0]!);
        await repr.createOrUpdate(props, channel.data).runInContext(ctx);
        if (transform) repr.setState({ transform });
        return new SO.Volume.Representation3D({ repr, sourceData: channel.data }, { label: `${Math.round(channel.isoValue.relativeValue * 100) / 100} σ [${srcParams.channel}]` });
    }),
    update: ({ a, b, newParams, spine }, plugin: PluginContext) => Task.create('Volume Representation', async ctx => {
        // TODO : check if params/underlying data/etc have changed; maybe will need to export "data" or some other "tag" in the Representation for this to work

        const channel = a.data.channels[newParams.channel];
        // TODO: is this correct behavior?
        if (!channel) return StateTransformer.UpdateResult.Unchanged;

        const visible = b.data.repr.state.visible;
        const params = createVolumeProps(a.data, newParams.channel);
        const props = { ...b.data.repr.props, ...params.type.params };
        b.data.repr.setTheme(Theme.create(plugin.representation.volume.themes, { volume: channel.data }, params));
        await b.data.repr.createOrUpdate(props, channel.data).runInContext(ctx);
        b.data.repr.setState({ visible });
        b.data.sourceData = channel.data;

        // TODO: set the transform here as well in case the structure moves?
        //       doing this here now breaks the code for some reason...
        // const structure = spine.getAncestorOfType(SO.Molecule.Structure)?.data;
        // const transform = structure?.models.length === 0 ? void 0 : GlobalModelTransformInfo.get(structure?.models[0]!);
        // if (transform) b.data.repr.setState({ transform });

        return StateTransformer.UpdateResult.Updated;
    })
});

function createVolumeProps(streaming: VolumeStreaming.Behavior, channelName: VolumeStreaming.ChannelType) {
    const channel = streaming.channels[channelName]!;
    return VolumeRepresentation3DHelpers.getDefaultParamsStatic(streaming.plugin,
        'isosurface', { isoValue: channel.isoValue, alpha: channel.opacity, visuals: channel.wireframe ? ['wireframe'] : ['solid'] },
        'uniform', { value: channel.color });
}