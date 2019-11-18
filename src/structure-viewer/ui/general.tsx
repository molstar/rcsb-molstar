/**
 * Copyright (c) 2019 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import * as React from 'react';
import { CollapsableControls } from 'molstar/lib/mol-plugin/ui/base';
import { ParameterControls } from 'molstar/lib/mol-plugin/ui/controls/parameters';
import { ParamDefinition as PD } from 'molstar/lib/mol-util/param-definition';
import { PluginCommands } from 'molstar/lib/mol-plugin/command';
import { Canvas3DParams } from 'molstar/lib/mol-canvas3d/canvas3d';
import { ColorNames } from 'molstar/lib/mol-util/color/names';

const GeneralSettingsParams = {
    spin: Canvas3DParams.trackball.params.spin,
    camera: Canvas3DParams.cameraMode,
    background: PD.Select('white', [['white', 'White'], ['black', 'Black'], ['transparent', 'Transparent']], { description: 'Background of the 3D canvas' }),
    renderStyle: PD.Select('glossy', [['toon', 'Toon'], ['matte', 'Matte'], ['glossy', 'Glossy'], ['metallic', 'Metallic']], { description: 'Style in which the 3D scene is rendered' }),
    occlusion: PD.Boolean(false, { description: 'Darken occluded crevices with the ambient occlusion effect' }),
    fog: PD.Boolean(false, { description: 'Show fog in the distance' }),
}

export class GeneralSettings<P> extends CollapsableControls<P> {
    setSettings = (p: { param: PD.Base<any>, name: string, value: any }) => {
        if (p.name === 'spin') {
            const trackball = this.plugin.canvas3d.props.trackball;
            PluginCommands.Canvas3D.SetSettings.dispatch(this.plugin, { settings: { trackball: { ...trackball, spin: p.value } } });
        } else if (p.name === 'camera') {
            PluginCommands.Canvas3D.SetSettings.dispatch(this.plugin, { settings: { cameraMode: p.value }});
        } else if (p.name === 'background') {
            const renderer = this.plugin.canvas3d.props.renderer;
            if (p.value === 'white') {
                PluginCommands.Canvas3D.SetSettings.dispatch(this.plugin, { settings: { renderer: { ...renderer, backgroundColor: ColorNames.white, transparentBackground: false } } });
            } else if (p.value === 'black') {
                PluginCommands.Canvas3D.SetSettings.dispatch(this.plugin, { settings: { renderer: { ...renderer, backgroundColor: ColorNames.black, transparentBackground: false } } });
            } else if (p.value === 'transparent') {
                PluginCommands.Canvas3D.SetSettings.dispatch(this.plugin, { settings: { renderer: { ...renderer, backgroundColor: ColorNames.white, transparentBackground: true } } });
            }
        } else if (p.name === 'renderStyle') {
            const postprocessing = this.plugin.canvas3d.props.postprocessing;
            const renderer = this.plugin.canvas3d.props.renderer;
            if (p.value === 'toon') {
                PluginCommands.Canvas3D.SetSettings.dispatch(this.plugin, { settings: {
                    postprocessing: { ...postprocessing, outlineEnable: true, },
                    renderer: { ...renderer, lightIntensity: 0, ambientIntensity: 1, roughness: 0.4, metalness: 0 }
                } });
            } else if (p.value === 'matte') {
                PluginCommands.Canvas3D.SetSettings.dispatch(this.plugin, { settings: {
                    postprocessing: { ...postprocessing, outlineEnable: false, },
                    renderer: { ...renderer, lightIntensity: 0.6, ambientIntensity: 0.4, roughness: 1, metalness: 0 }
                } });
            } else if (p.value === 'glossy') {
                PluginCommands.Canvas3D.SetSettings.dispatch(this.plugin, { settings: {
                    postprocessing: { ...postprocessing, outlineEnable: false, },
                    renderer: { ...renderer, lightIntensity: 0.6, ambientIntensity: 0.4, roughness: 0.4, metalness: 0 }
                } });
            } else if (p.value === 'metallic') {
                PluginCommands.Canvas3D.SetSettings.dispatch(this.plugin, { settings: {
                    postprocessing: { ...postprocessing, outlineEnable: false, },
                    renderer: { ...renderer, lightIntensity: 0.6, ambientIntensity: 0.4, roughness: 0.6, metalness: 0.4 }
                } });
            }
        } else if (p.name === 'occlusion') {
            const postprocessing = this.plugin.canvas3d.props.postprocessing;
            PluginCommands.Canvas3D.SetSettings.dispatch(this.plugin, { settings: {
                postprocessing: { ...postprocessing, occlusionEnable: p.value, occlusionBias: 0.5, occlusionRadius: 64 },
            } });
        } else if (p.name === 'fog') {;
            PluginCommands.Canvas3D.SetSettings.dispatch(this.plugin, { settings: {
                cameraFog: p.value ? 50 : 1,
            } });
        }
    }

    get values () {
        const renderer = this.plugin.canvas3d.props.renderer;
        const postprocessing = this.plugin.canvas3d.props.postprocessing;

        let renderStyle = 'custom'
        if (postprocessing.outlineEnable) {
            if (renderer.lightIntensity === 0 && renderer.ambientIntensity === 1 && renderer.roughness === 0.4 && renderer.metalness === 0) {
                renderStyle = 'toon'
            }
        } else if (renderer.lightIntensity === 0.6 && renderer.ambientIntensity === 0.4) {
            if (renderer.roughness === 1 && renderer.metalness === 0) {
                renderStyle = 'matte'
            } else if (renderer.roughness === 0.4 && renderer.metalness === 0) {
                renderStyle = 'glossy'
            } else if (renderer.roughness === 0.6 && renderer.metalness === 0.4) {
                renderStyle = 'metallic'
            }
        }

        let background = 'custom'
        if (renderer.backgroundColor === ColorNames.white && !renderer.transparentBackground) {
            background = 'white'
        } else if (renderer.backgroundColor === ColorNames.black && !renderer.transparentBackground) {
            background = 'black'
        } else if (renderer.backgroundColor === ColorNames.white && renderer.transparentBackground) {
            background = 'transparent'
        }

        return {
            spin: this.plugin.canvas3d.props.trackball.spin,
            camera: this.plugin.canvas3d.props.cameraMode,
            background,
            renderStyle,
            occlusion: this.plugin.canvas3d.props.postprocessing.occlusionEnable,
            fog: this.plugin.canvas3d.props.cameraFog > 1
        }
    }

    componentDidMount() {
        this.subscribe(this.plugin.events.canvas3d.settingsUpdated, () => this.forceUpdate());
    }

    defaultState() {
        return {
            isCollapsed: false,
            header: 'General Settings'
        }
    }

    renderControls() {
        if (!this.plugin.canvas3d) return null

        return <div>
            <ParameterControls params={GeneralSettingsParams} values={this.values} onChange={this.setSettings} />
        </div>
    }
}