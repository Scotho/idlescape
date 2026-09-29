import { createEmitter, type Emitter } from './emitter';
import { createWorldHooks } from './world';
import { CHAT_COLOUR_TAG, type ChatColour, type ClientHooks, type HookBridge, type HookEvents } from './types';
import { createCapability } from '../plugins/capability';
import { createClientPluginRegistry, type ClientPluginRegistry } from '../plugins/registry';

declare global {
  interface Window { idlescape?: { client?: ClientHooks; plugins?: ClientPluginRegistry } }
}

export interface Installed { hooks: ClientHooks; emitter: Emitter<HookEvents> }

export function installHooks(bridge: HookBridge): Installed {
  const emitter = createEmitter<HookEvents>();
  const world = createWorldHooks(bridge, emitter);
  const hooks: ClientHooks = {
    login: (gameName, secret) => bridge.login(gameName, secret),
    armLogin: (gameName, secret, label) => bridge.armLogin(gameName, secret, label ?? gameName),
    loginArmed: () => bridge.loginArmed(),
    logout: () => bridge.logout(),
    setRenderSuspended: suspended => bridge.setRenderSuspended(suspended),
    setAttended: attended => bridge.setAttended(attended),
    echoChat(text, colour: ChatColour = 'orange') {
      bridge.addChat(0, `${CHAT_COLOUR_TAG[colour]}${text}`, '');
    },
    getState: () => bridge.getState(),
    getObjName: id => bridge.getObjName(id),
    getObjIcon: (id, count) => bridge.getObjIcon(id, count ?? 1),
    getObjInfo: id => bridge.getObjInfo(id),
    getWorldState: world.getWorldState,
    dispatch: world.dispatch,
    cancelAll: world.cancelAll,
    on: (event, handler) => emitter.on(event, handler)
  };
  const capability = createCapability({ state: () => bridge.getState() });
  const plugins = createClientPluginRegistry(capability);
  window.idlescape = { ...(window.idlescape ?? {}), client: hooks, plugins };
  window.dispatchEvent(new CustomEvent('idlescape:client-ready'));
  return { hooks, emitter };
}
