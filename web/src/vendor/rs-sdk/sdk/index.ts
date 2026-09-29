// Vendored from rs-sdk (MIT) 56b73e08; see web/src/vendor/PATCHES.md
// Bot SDK - the high-level game API, rewired off the rs-sdk gateway WebSocket
// onto our Transport (web/src/agent/types.ts).
// Low-level API that maps 1:1 to the action protocol.
// Raw actions resolve when the client validates/routes and dispatches them.
// Use BotActions when the caller needs observation of the resulting game effect.

import type {
    BotWorldState,
    BotAction,
    ActionResult,
    SkillState,
    InventoryItem,
    NearbyNpc,
    NearbyPlayer,
    NearbyLoc,
    GroundItem,
    DialogState,
    BankItem,
    PrayerState,
    PrayerName,
    GameMessage,
    FindOptions
} from './types';
import type { TradeState } from './types';
import { PRAYER_INDICES, PRAYER_NAMES, PLAYER_CHAT_TYPES, TRADE_REQUEST_CHAT_TYPE } from './types';
import { ChatHistory } from './chat-history';
import * as pathfinding from './pathfinding';
import { resolveInterfaceOption, shortestNameMatch, type InterfaceOptionSelector } from './action-quantity';
import type { Transport } from '../../../agent/types';

/** Fallback dispatch deadline; the Transport applies it per action. */
const DEFAULT_ACTION_TIMEOUT_MS = 10_000;

/**
 * Apply {@link FindOptions} to a find* winner. `shortestNameMatch` already
 * prefers a reachable match; `{reachable: true}` turns an unreachable-only
 * result into null instead, so callers get "nothing usable" rather than a
 * target whose interaction would fail with a silent `cant_reach`.
 */
// Player trade interface components (see server/webclient/src/bot/types.ts
// for the full trademain/tradeconfirm component map).
const TRADE_SIDE_INV_ID = 3322;     // tradeside:inv - INV_BUTTON = Offer 1/5/10/All/X
const TRADE_MAIN_INV_ID = 3415;     // trademain:inv - INV_BUTTON = Remove 1/5/10/All/X
const TRADE_MAIN_ACCEPT_ID = 3420;  // trademain:accept
const TRADE_CONFIRM_ACCEPT_ID = 3546; // tradeconfirm:accept

function applyFindOptions<T extends { reachable?: boolean }>(match: T | null, options?: FindOptions): T | null {
    if (options?.reachable === true && match?.reachable === false) return null;
    return match;
}

function selectorLabel(selector: InterfaceOptionSelector): string {
    if (typeof selector === 'string') return `"${selector}"`;
    if (selector instanceof RegExp) return String(selector);
    return `option "${selector.text}"`;
}

// Chat chunking lives in ./chunking so the gateway can share it without
// importing the full SDK; re-exported here for existing consumers and tests.
export { chunkMessage } from './chunking';
import { chunkMessage } from './chunking';
export { Spells, type SpellName } from './spells';

export class BotSDK {
    private state: BotWorldState | null = null;
    private stateReceivedAt: number = 0;
    /**
     * Max chat length before chunking. The RS wire limit; the gateway handshake
     * that used to raise it is not part of the local transport.
     */
    private serverMaxMessageLength: number = 80;
    /** Per-action dispatch deadline handed to the Transport. */
    private actionTimeout: number = DEFAULT_ACTION_TIMEOUT_MS;
    /**
     * Chat accumulated across state syncs. The client ring only holds 100
     * messages (and each sync only carries 50), so without this an agent could
     * never read further back than ~50 lines. See sdk/chat-history.ts.
     */
    private chatHistory = new ChatHistory();
    /** Cursor consumed by getNewChat(): value of chatHistory.seen at last read. */
    private chatReadCursor: number = 0;
    private stateListeners = new Set<(state: BotWorldState) => void>();
    private temporaryDoorBlocks = new pathfinding.TemporaryDoorBlocklist();

    constructor(private readonly transport: Transport) {
        const initial = this.transport.getState();
        if (initial) this.ingestState(initial);
        this.transport.onState(state => {
            this.ingestState(state);
            // Publish the normalised copy, not the transport's snapshot, so
            // waitForCondition predicates and listeners see the named skills.
            const published = this.state!;
            for (const listener of this.stateListeners) {
                try {
                    listener(published);
                } catch (e) {
                    console.error('State listener error:', e);
                }
            }
        });
    }

    // ============ Connection ============

    /** True once a world state has arrived over the transport. */
    isConnected(): boolean {
        return this.transport.getState() !== null;
    }

    /** Kept for API compatibility: the local transport has no separate auth step. */
    isAuthenticated(): boolean {
        return this.isConnected();
    }

    /** The local transport is always connected; kept so callers need no edits. */
    async waitForConnection(_timeout: number = 60000): Promise<void> {
        return;
    }

    // ============ State Access (Synchronous) ============

    /** Get current game state snapshot. */
    getState(): BotWorldState | null {
        return this.state;
    }

    /** Get timestamp when state was last received (ms since epoch) */
    getStateReceivedAt(): number {
        return this.stateReceivedAt;
    }

    /** Get age of current state in milliseconds */
    getStateAge(): number {
        if (this.stateReceivedAt === 0) return 0;
        return Date.now() - this.stateReceivedAt;
    }

    /**
     * Read recent chat messages. Returns player chat (public + PMs) by default,
     * newest last. Reads from the SDK's accumulated history — up to 500
     * messages retained since connect — so old lines survive both system spam
     * (level-ups, combat) and the client's own 100-deep ring eviction.
     *
     * @param opts.limit Max messages to return (default 20; pass 0 for the full history).
     * @param opts.types Chat type codes to include (default player chat: 1/2/3/6/7). Pass e.g. `[0]` for system messages.
     * @param opts.includeSelf Include your own messages (default false).
     */
    getChat(opts: { limit?: number; types?: readonly number[]; includeSelf?: boolean } = {}): GameMessage[] {
        const { limit = 20, types = PLAYER_CHAT_TYPES, includeSelf = false } = opts;
        const typeSet = new Set(types);
        const filtered = this.chatHistory.all().filter(m =>
            typeSet.has(m.type) && (includeSelf || !m.fromSelf)
        );
        return limit > 0 ? filtered.slice(-limit) : filtered;
    }

    /**
     * Read only chat messages that have arrived since the last call (cursor-based,
     * newest last). Repeat polls never re-show the same message — no need to
     * hand-roll a baseline. The first call returns everything seen since
     * connect. Excludes your own messages by default.
     *
     * @param opts.types Chat type codes to include (default player chat: 1/2/3/6/7).
     * @param opts.includeSelf Include your own messages (default false).
     */
    getNewChat(opts: { types?: readonly number[]; includeSelf?: boolean } = {}): GameMessage[] {
        const { types = PLAYER_CHAT_TYPES, includeSelf = false } = opts;
        const typeSet = new Set(types);

        // Advance the cursor past everything recorded so far (including system
        // lines) so the next call only sees genuinely newer messages.
        const prev = this.chatReadCursor;
        this.chatReadCursor = this.chatHistory.seen;

        return this.chatHistory.since(prev).filter(m =>
            typeSet.has(m.type) && (includeSelf || !m.fromSelf)
        );
    }

    /**
     * Read recent chat from a specific sender (case-insensitive, substring match
     * on name), newest last, from the accumulated history. Handy for "what did
     * my partner say?" without regex-matching the sender field yourself.
     *
     * @param name Sender name (or substring) to match.
     * @param opts.limit Max messages to return (default 20; pass 0 for all).
     */
    getChatFrom(name: string, opts: { limit?: number } = {}): GameMessage[] {
        const { limit = 20 } = opts;
        const needle = name.toLowerCase();
        const filtered = this.chatHistory.all().filter(m =>
            m.sender !== '' && m.sender.toLowerCase().includes(needle)
        );
        return limit > 0 ? filtered.slice(-limit) : filtered;
    }

    /**
     * Wait for the next chat message matching the given filters (messages
     * arriving after this call; your own messages are excluded by default).
     * The easy way to coordinate two bots: `sdk.say('ready'); const reply =
     * await sdk.waitForChat({ from: 'partner', timeout: 60000 });`
     *
     * @param opts.from Only accept this sender (case-insensitive substring).
     * @param opts.matching Only accept messages whose text matches this pattern.
     * @param opts.types Chat type codes to accept (default player chat: 1/2/3/6/7).
     * @param opts.includeSelf Accept your own messages (default false).
     * @param opts.timeout Ms to wait before returning null (default 30000).
     * @returns The first matching message, or null on timeout.
     */
    async waitForChat(opts: {
        from?: string;
        matching?: RegExp | string;
        types?: readonly number[];
        includeSelf?: boolean;
        timeout?: number;
    } = {}): Promise<GameMessage | null> {
        const { from, matching, types = PLAYER_CHAT_TYPES, includeSelf = false, timeout = 30000 } = opts;
        const typeSet = new Set(types);
        const needle = from?.toLowerCase();
        const pattern = typeof matching === 'string' ? new RegExp(matching, 'i') : matching;
        const accepts = (m: GameMessage) =>
            typeSet.has(m.type) &&
            (includeSelf || !m.fromSelf) &&
            (!needle || m.sender.toLowerCase().includes(needle)) &&
            (!pattern || pattern.test(m.text));

        // Private cursor starting "now" — does not consume getNewChat's cursor.
        let cursor = this.chatHistory.seen;

        return new Promise((resolve) => {
            const timeoutId = setTimeout(() => {
                unsubscribe();
                resolve(null);
            }, timeout);

            const unsubscribe = this.onStateUpdate(() => {
                const fresh = this.chatHistory.since(cursor);
                cursor = this.chatHistory.seen;
                const match = fresh.find(accepts);
                if (match) {
                    clearTimeout(timeoutId);
                    unsubscribe();
                    resolve(match);
                }
            });
        });
    }

    /** Get a skill by name (case-insensitive; "hp"/"hitpoint" alias Hitpoints). */
    getSkill(name: string): SkillState | null {
        if (!this.state) return null;
        const requested = name.trim().toLowerCase();
        const normalized = /^(hp|hitpoint|hitpoints)$/.test(requested) ? 'hitpoints' : requested;
        return this.state.skills.find(s => s.name.toLowerCase() === normalized) || null;
    }

    /** Get XP for a skill by name. */
    getSkillXp(name: string): number | null {
        const skill = this.getSkill(name);
        return skill?.experience ?? null;
    }

    /** Get all skills. */
    getSkills(): SkillState[] {
        return this.state?.skills || [];
    }

    /** Get inventory item by slot number. */
    getInventoryItem(slot: number): InventoryItem | null {
        if (!this.state) return null;
        return this.state.inventory.find(i => i.slot === slot) || null;
    }

    /** Find inventory item by name pattern (shortest matching name wins). */
    findInventoryItem(pattern: string | RegExp): InventoryItem | null {
        if (!this.state) return null;
        return shortestNameMatch(this.state.inventory, pattern);
    }

    /** Get all inventory items. */
    getInventory(): InventoryItem[] {
        return this.state?.inventory || [];
    }

    /**
     * Count total item quantity matching a name pattern.
     *
     * This sums stack sizes across every matching slot. Use
     * `getInventory().filter(...)` when the number of occupied slots is needed.
     */
    countInventoryItems(pattern: string | RegExp): number {
        if (!this.state) return 0;
        const regex = typeof pattern === 'string'
            ? new RegExp(pattern, 'i')
            : new RegExp(pattern.source, pattern.flags.replace(/[gy]/g, ''));
        return this.state.inventory.reduce(
            (total, item) => total + (regex.test(item.name) ? item.count : 0),
            0
        );
    }

    /** Get equipment item by slot number. */
    getEquipmentItem(slot: number): InventoryItem | null {
        if (!this.state) return null;
        return this.state.equipment.find(i => i.slot === slot) || null;
    }

    /** Find equipment item by name pattern (shortest matching name wins). */
    findEquipmentItem(pattern: string | RegExp): InventoryItem | null {
        if (!this.state) return null;
        return shortestNameMatch(this.state.equipment, pattern);
    }

    /** Get all equipped items. */
    getEquipment(): InventoryItem[] {
        return this.state?.equipment || [];
    }

    /** Get bank item by slot number (bank must be open). */
    getBankItem(slot: number): BankItem | null {
        if (!this.state?.bank.isOpen) return null;
        return this.state.bank.items.find(i => i.slot === slot) || null;
    }

    /** Find bank item by name pattern (bank must be open; shortest matching name wins). */
    findBankItem(pattern: string | RegExp): BankItem | null {
        if (!this.state?.bank.isOpen) return null;
        return shortestNameMatch(this.state.bank.items, pattern);
    }

    /** Get all bank items (bank must be open). */
    getBankItems(): BankItem[] {
        return this.state?.bank.items || [];
    }

    /** Check if bank interface is open. */
    isBankOpen(): boolean {
        return this.state?.bank.isOpen || false;
    }

    /** Get NPC by index. */
    getNearbyNpc(index: number): NearbyNpc | null {
        if (!this.state) return null;
        return this.state.nearbyNpcs.find(n => n.index === index) || null;
    }

    /** Find NPC by name pattern (shortest matching name wins, then nearest; reachable preferred). */
    findNearbyNpc(pattern: string | RegExp, options?: FindOptions): NearbyNpc | null {
        if (!this.state) return null;
        return applyFindOptions(shortestNameMatch(this.state.nearbyNpcs, pattern), options);
    }

    /** Get all nearby NPCs. */
    getNearbyNpcs(): NearbyNpc[] {
        return this.state?.nearbyNpcs || [];
    }

    /** Find a nearby player by name pattern (shortest matching name wins, then nearest; reachable preferred). */
    findNearbyPlayer(pattern: string | RegExp, options?: FindOptions): NearbyPlayer | null {
        if (!this.state) return null;
        return applyFindOptions(shortestNameMatch(this.state.nearbyPlayers, pattern), options);
    }

    /** Get all nearby players, nearest first. */
    getNearbyPlayers(): NearbyPlayer[] {
        return this.state?.nearbyPlayers || [];
    }

    /** Get location (object) by coordinates and ID. */
    getNearbyLoc(x: number, z: number, id: number): NearbyLoc | null {
        if (!this.state) return null;
        return this.state.nearbyLocs.find(l =>
            l.x === x && l.z === z && l.id === id
        ) || null;
    }

    /** Find location by name pattern (shortest matching name wins, then nearest; reachable preferred). */
    findNearbyLoc(pattern: string | RegExp, options?: FindOptions): NearbyLoc | null {
        if (!this.state) return null;
        let candidates = this.state.nearbyLocs;
        if (options?.withOption !== undefined) {
            const optionPattern = options.withOption;
            const regex = typeof optionPattern === 'string' ? new RegExp(optionPattern, 'i') : optionPattern;
            candidates = candidates.filter(loc => loc.optionsWithIndex?.some(o => {
                regex.lastIndex = 0;
                return regex.test(o.text);
            }));
        }
        return applyFindOptions(shortestNameMatch(candidates, pattern), options);
    }

    /** Get all nearby locations (trees, rocks, etc). */
    getNearbyLocs(): NearbyLoc[] {
        return this.state?.nearbyLocs || [];
    }

    /** Find ground item by name pattern (shortest matching name wins, then nearest; reachable preferred). */
    findGroundItem(pattern: string | RegExp, options?: FindOptions): GroundItem | null {
        if (!this.state) return null;
        return applyFindOptions(shortestNameMatch(this.state.groundItems, pattern), options);
    }

    /** Get all ground items. */
    getGroundItems(): GroundItem[] {
        return this.state?.groundItems || [];
    }

    /** Get current dialog state. */
    getDialog(): DialogState | null {
        return this.state?.dialog || null;
    }

    // ============ On-Demand Scanning ============
    // These methods scan the environment on-demand rather than relying on pushed state
    // Use these for expensive scans of nearby locations and ground items

    /**
     * Scan for nearby locations with custom radius. Results are scoped to the
     * player's current plane (each carries `level`); re-scan after climbing or
     * descending rather than reusing old references.
     * @param radius - Scan radius in tiles (default 15)
     * @returns Array of nearby locations sorted by distance
     */
    async scanNearbyLocs(radius?: number): Promise<NearbyLoc[]> {
        const result = await this.sendAction({ type: 'scanNearbyLocs', radius, reason: 'SDK' });
        if (result.success && result.data) {
            return result.data as NearbyLoc[];
        }
        return [];
    }

    /**
     * Scan for ground items on-demand.
     * This is more efficient than constantly pushing this data in state updates.
     * @param radius - Scan radius in tiles (default 15)
     * @returns Array of ground items sorted by distance
     */
    async scanGroundItems(radius?: number): Promise<GroundItem[]> {
        const result = await this.sendAction({ type: 'scanGroundItems', radius, reason: 'SDK' });
        if (result.success && result.data) {
            return result.data as GroundItem[];
        }
        return [];
    }

    /**
     * Find a nearby location by name pattern (on-demand scan).
     * @param pattern - String or RegExp to match location name
     * @param radius - Scan radius in tiles (default 15)
     * @returns First matching location or null
     */
    async scanFindNearbyLoc(pattern: string | RegExp, radius?: number): Promise<NearbyLoc | null> {
        const locs = await this.scanNearbyLocs(radius);
        const regex = typeof pattern === 'string'
            ? new RegExp(pattern, 'i')
            : pattern;
        return locs.find(l => regex.test(l.name)) || null;
    }

    /**
     * Find a ground item by name pattern (on-demand scan).
     * @param pattern - String or RegExp to match item name
     * @param radius - Scan radius in tiles (default 15)
     * @returns First matching item or null
     */
    async scanFindGroundItem(pattern: string | RegExp, radius?: number): Promise<GroundItem | null> {
        const items = await this.scanGroundItems(radius);
        const regex = typeof pattern === 'string'
            ? new RegExp(pattern, 'i')
            : pattern;
        return items.find(i => regex.test(i.name)) || null;
    }

    // ============ State Subscriptions ============

    onStateUpdate(listener: (state: BotWorldState) => void): () => void {
        this.stateListeners.add(listener);
        return () => this.stateListeners.delete(listener);
    }

    // ============ Plumbing: Raw Actions ============

    private async sendAction(action: BotAction): Promise<ActionResult> {
        try {
            return await this.transport.dispatch(action, this.actionTimeout);
        } catch (err) {
            // A dropped dispatch is a reportable failure, not a fatal one: callers
            // check result.success and can retry, reposition, or give up. The local
            // transport already reports its own timeouts as failed results.
            return {
                success: false,
                message: err instanceof Error ? err.message : String(err),
                reason: 'error',
                phase: 'dispatch'
            };
        }
    }

    /** Send walk command to coordinates. */
    async sendWalk(x: number, z: number, running: boolean = true): Promise<ActionResult> {
        return this.sendAction({ type: 'walkTo', x, z, running, reason: 'SDK' });
    }

    /** Interact with a location (tree, rock, door, etc). */
    async sendInteractLoc(x: number, z: number, locId: number, option: number = 1): Promise<ActionResult> {
        return this.sendAction({ type: 'interactLoc', x, z, locId, optionIndex: option, reason: 'SDK' });
    }

    /** Interact with an NPC by index and option. */
    async sendInteractNpc(npcIndex: number, option: number = 1): Promise<ActionResult> {
        return this.sendAction({ type: 'interactNpc', npcIndex, optionIndex: option, reason: 'SDK' });
    }

    /** Interact with a player by index and option (1-5). Option 2 = Attack (wilderness), 3 = Follow, 4 = Trade. */
    async sendInteractPlayer(playerIndex: number, option: number = 2): Promise<ActionResult> {
        return this.sendAction({ type: 'interactPlayer', playerIndex, optionIndex: option, reason: 'SDK' });
    }

    /** Talk to an NPC by index. */
    async sendTalkToNpc(npcIndex: number): Promise<ActionResult> {
        return this.sendAction({ type: 'talkToNpc', npcIndex, reason: 'SDK' });
    }

    /** Pick up a ground item. */
    async sendPickup(x: number, z: number, itemId: number): Promise<ActionResult> {
        return this.sendAction({ type: 'pickupItem', x, z, itemId, reason: 'SDK' });
    }

    /**
     * Use an inventory item (eat, equip, etc).
     *
     * `interfaceId` selects which inventory component holds the item. The main
     * inventory (3214, the default) dispatches OPHELD1-5; any other component
     * (trade offer, bank side inventory, ...) dispatches INV_BUTTON1-5, which
     * is the packet family the engine actually handles for interface-defined
     * item options - OPHELD with a foreign component id is silently dropped.
     */
    async sendUseItem(slot: number, option: number = 1, interfaceId?: number): Promise<ActionResult> {
        return this.sendAction({ type: 'useInventoryItem', slot, optionIndex: option, interfaceId, reason: 'SDK' });
    }

    /** Use an equipped item (remove, operate, etc). */
    async sendUseEquipmentItem(slot: number, option: number = 1): Promise<ActionResult> {
        return this.sendAction({ type: 'useEquipmentItem', slot, optionIndex: option, reason: 'SDK' });
    }

    /** Drop an inventory item. */
    async sendDropItem(slot: number): Promise<ActionResult> {
        return this.sendAction({ type: 'dropItem', slot, reason: 'SDK' });
    }

    /**
     * Use one inventory item on another.
     *
     * Rejected up front while a shop or bank modal is open: those replace the
     * inventory tab, so the server drops the packet as "component not visible"
     * and sends no message at all. Close the modal first — `bot.closeShop()`,
     * `bot.closeInterface()`, or `sendCloseModal()`.
     */
    async sendUseItemOnItem(sourceSlot: number, targetSlot: number): Promise<ActionResult> {
        const blocker = this.describeInventoryBlocker();
        if (blocker) {
            return { success: false, message: blocker, reason: 'modal_open' };
        }
        return this.sendAction({ type: 'useItemOnItem', sourceSlot, targetSlot, reason: 'SDK' });
    }

    /**
     * Name the open modal that hides the inventory tab from the server, if any.
     * Returns null when inventory packets can be expected to land.
     */
    private describeInventoryBlocker(): string | null {
        const state = this.getState();
        if (!state) return null;
        if (state.shop.isOpen) {
            return 'Shop interface is open, which replaces the inventory tab - the server will silently drop this. Close it first (bot.closeShop() / sdk.sendCloseShop()).';
        }
        if (state.bank.isOpen) {
            return 'Bank interface is open, which replaces the inventory tab - the server will silently drop this. Close it first (bot.closeInterface() / sdk.sendCloseModal()).';
        }
        if (state.trade?.isOpen) {
            return 'Trade interface is open, which replaces the inventory tab - the server will silently drop this. Finish or decline the trade first (sdk.sendDeclineTrade()).';
        }
        return null;
    }

    /** Use an inventory item on a location. */
    async sendUseItemOnLoc(itemSlot: number, x: number, z: number, locId: number): Promise<ActionResult> {
        return this.sendAction({ type: 'useItemOnLoc', itemSlot, x, z, locId, reason: 'SDK' });
    }

    /** Use an inventory item on an NPC. */
    async sendUseItemOnNpc(itemSlot: number, npcIndex: number): Promise<ActionResult> {
        return this.sendAction({ type: 'useItemOnNpc', itemSlot, npcIndex, reason: 'SDK' });
    }

    /**
     * Click a dialog option by its server-assigned index.
     *
     * IMPORTANT: `option` is the **server-assigned index** stored on each
     * `DialogOption.index` field — NOT the array position in `dialog.options`.
     * Server-assigned indices are 1-based: `dialog.options[0].index === 1`.
     *
     * Pass `0` only as the implicit "continue" click for dialogs with no
     * selectable options (the common pattern: pass through narration pages).
     *
     * To click an option by its visible text, prefer `clickDialogByText()`,
     * which avoids the index-vs-position footgun entirely.
     *
     * @example
     * ```ts
     * const opt = sdk.getDialog()?.options.find(o => /yes/i.test(o.text));
     * await sdk.sendClickDialog(opt?.index ?? 0);  // ← .index, NOT array position
     * ```
     */
    async sendClickDialog(option: number = 0): Promise<ActionResult> {
        return this.sendAction({ type: 'clickDialogOption', optionIndex: option, reason: 'SDK' });
    }

    /**
     * Click a dialog option whose visible text matches `pattern`.
     *
     * Convenience wrapper that resolves the server-assigned index for you,
     * sidestepping the 1-based vs 0-based array-position confusion of
     * `sendClickDialog()`. Matches against `DialogOption.text` (case-insensitive
     * by default for string patterns).
     *
     * @returns ActionResult with `success: false` and `reason: 'no_dialog'` if
     *          no dialog is open, or `reason: 'no_match'` if no option matches.
     *
     * @example
     * ```ts
     * await sdk.clickDialogByText(/yes/i);             // pay the toll
     * await sdk.clickDialogByText('Is there anything down this alleyway?');
     * ```
     */
    async clickDialogByText(pattern: string | RegExp): Promise<ActionResult> {
        const dialog = this.state?.dialog;
        if (!dialog?.isOpen) {
            return { success: false, message: 'No dialog open', reason: 'no_dialog' };
        }
        const regex = typeof pattern === 'string' ? new RegExp(pattern, 'i') : pattern;
        const match = dialog.options.find(o => regex.test(o.text));
        if (!match) {
            const available = dialog.options.map(o => `"${o.text}"`).join(', ') || '(none)';
            return {
                success: false,
                message: `No dialog option matched ${pattern}. Available: ${available}`,
                reason: 'no_match'
            };
        }
        return this.sendClickDialog(match.index);
    }

    /** Click a component using IF_BUTTON packet - for simple buttons, spellcasting, etc. */
    async sendClickComponent(componentId: number): Promise<ActionResult> {
        return this.sendAction({ type: 'clickComponent', componentId, reason: 'SDK' });
    }

    /** Click a component using INV_BUTTON packet - for components with inventory operations (smithing, crafting, etc.) */
    async sendClickComponentWithOption(componentId: number, optionIndex: number = 1, slot: number = 0): Promise<ActionResult> {
        return this.sendAction({ type: 'clickComponentWithOption', componentId, optionIndex, slot, reason: 'SDK' });
    }

    /**
     * Click an interface option by **0-based array position**.
     *
     * Note the mismatch: `InterfaceOption.index` is a 1-based display label, so
     * passing one straight through clicks the option after the one you matched.
     * Prefer `clickInterfaceOption()` when selecting from published state.
     */
    async sendClickInterfaceOption(arrayPosition: number): Promise<ActionResult> {
        const state = this.getState();
        if (!state?.interface?.isOpen) {
            return { success: false, message: 'No interface open', reason: 'no_interface' };
        }

        const options = state.interface.options;
        const option = options[arrayPosition];
        if (arrayPosition < 0 || arrayPosition >= options.length || !option) {
            return {
                success: false,
                message: `Invalid array position ${arrayPosition}; interface has ${options.length} options (0..${options.length - 1})`,
                reason: 'no_match',
            };
        }

        return this.sendClickComponent(option.componentId);
    }

    /**
     * Click exactly one interface option, selected by its state object or by
     * visible text (substring for strings, match for regexes).
     *
     * This dispatches the option's `componentId` and never interprets
     * `InterfaceOption.index` as an array position.
     */
    async clickInterfaceOption(selector: InterfaceOptionSelector): Promise<ActionResult> {
        const state = this.getState();
        if (!state?.interface?.isOpen) {
            return { success: false, message: 'No interface open', reason: 'no_interface' };
        }
        const option = resolveInterfaceOption(state.interface.options, selector);
        if (!option) {
            const available = state.interface.options.map(o => `"${o.text}"`).join(', ') || '(none)';
            return {
                success: false,
                message: `No interface option matched ${selectorLabel(selector)}. Available: ${available}`,
                reason: 'no_match',
            };
        }
        return this.sendClickComponent(option.componentId);
    }

    /** Accept character design in tutorial. */
    async sendAcceptCharacterDesign(): Promise<ActionResult> {
        return this.sendAction({ type: 'acceptCharacterDesign', reason: 'SDK' });
    }

    /** Randomize character appearance in tutorial. */
    async sendRandomizeCharacterDesign(): Promise<ActionResult> {
        return this.sendAction({ type: 'randomizeCharacterDesign', reason: 'SDK' });
    }

    /** Buy from shop by slot and amount. */
    async sendShopBuy(slot: number, amount: number = 1): Promise<ActionResult> {
        return this.sendAction({ type: 'shopBuy', slot, amount, reason: 'SDK' });
    }

    /** Sell to shop by slot and amount. */
    async sendShopSell(slot: number, amount: number = 1): Promise<ActionResult> {
        return this.sendAction({ type: 'shopSell', slot, amount, reason: 'SDK' });
    }

    /** Close shop interface. */
    async sendCloseShop(): Promise<ActionResult> {
        return this.sendAction({ type: 'closeShop', reason: 'SDK' });
    }

    /** Close any modal interface. */
    async sendCloseModal(): Promise<ActionResult> {
        return this.sendAction({ type: 'closeModal', reason: 'SDK' });
    }

    /** Submit a numeric value to an open p_countdialog (Enter Amount) prompt. */
    async sendCountDialog(value: number): Promise<ActionResult> {
        return this.sendAction({ type: 'submitCountDialog', value, reason: 'SDK' });
    }

    // ============ Player Trading ============

    /**
     * Current player-to-player trade session state. Returns a closed-trade
     * default when no state has arrived or the connected client predates
     * trade support.
     */
    getTradeState(): TradeState {
        return this.state?.trade ?? {
            isOpen: false,
            screen: null,
            partner: null,
            myOffer: [],
            theirOffer: [],
            myAccepted: false,
            partnerAccepted: false
        };
    }

    /**
     * Send (or accept) a trade request to another player. There is no
     * separate "accept" packet: requesting a player who already requested
     * you is the acceptance, and opens the trade screen for both. Otherwise
     * the partner sees "<you> wishes to trade with you." and the trade opens
     * when they request back.
     */
    async sendTradeRequest(playerIndex: number): Promise<ActionResult> {
        return this.sendInteractPlayer(playerIndex, 4);
    }

    /**
     * Move items from your (trade-screen) side inventory into your offer.
     * `slot` is the inventory slot. Amounts 1/5/10 and -1 (All) map to the
     * game's offer buttons; any other amount uses Offer-X plus the count
     * dialog. Only valid while the offer screen is open.
     */
    async sendOfferItem(slot: number, amount: number = 1): Promise<ActionResult> {
        return this.sendTradeInvButton(TRADE_SIDE_INV_ID, slot, amount);
    }

    /**
     * Remove items from your offer back to your inventory. Same amount
     * semantics as {@link sendOfferItem}. Note: removing (or adding) items
     * resets both players' accepts server-side.
     */
    async sendRetractItem(slot: number, amount: number = 1): Promise<ActionResult> {
        return this.sendTradeInvButton(TRADE_MAIN_INV_ID, slot, amount);
    }

    private async sendTradeInvButton(componentId: number, slot: number, amount: number): Promise<ActionResult> {
        if (!Number.isInteger(amount) || amount === 0 || (amount < 0 && amount !== -1)) {
            return { success: false, message: `Invalid trade amount: ${amount}`, reason: 'invalid_amount' };
        }
        const option = amount === 1 ? 1
            : amount === 5 ? 2
            : amount === 10 ? 3
            : (amount === -1 || amount >= 0x7fffffff) ? 4
            : 5;
        const result = await this.sendClickComponentWithOption(componentId, option, slot);
        if (!result.success || option !== 5) return result;
        // Offer-X: the server opens a count dialog; this waits for it and submits.
        return this.sendCountDialog(amount);
    }

    /**
     * Accept the currently open trade screen (first or confirm). The trade
     * only advances when both players accept; an offer change resets accepts.
     */
    async sendAcceptTrade(): Promise<ActionResult> {
        const trade = this.getTradeState();
        if (!trade.isOpen) {
            return { success: false, message: 'No trade screen is open', reason: 'not_open' };
        }
        const componentId = trade.screen === 'confirm' ? TRADE_CONFIRM_ACCEPT_ID : TRADE_MAIN_ACCEPT_ID;
        return this.sendClickComponent(componentId);
    }

    /**
     * Decline the open trade (closes the screen; both sides get their items
     * back and the partner sees "Other player declined trade.").
     */
    async sendDeclineTrade(): Promise<ActionResult> {
        const trade = this.getTradeState();
        if (!trade.isOpen) {
            return { success: false, message: 'No trade screen is open', reason: 'not_open' };
        }
        return this.sendCloseModal();
    }

    /**
     * Wait for an incoming trade request ("X wishes to trade with you.").
     * Requests arrive as chat type {@link TRADE_REQUEST_CHAT_TYPE}, which the
     * default chat readers filter out. Returns the requester's name, or null
     * on timeout.
     *
     * @param opts.from Only accept requests from this sender (substring match).
     * @param opts.timeout Ms to wait (default 30000).
     */
    async waitForTradeRequest(opts: { from?: string; timeout?: number } = {}): Promise<string | null> {
        const message = await this.waitForChat({
            from: opts.from,
            types: [TRADE_REQUEST_CHAT_TYPE],
            matching: /wishes to trade/i,
            timeout: opts.timeout ?? 30000
        });
        return message?.sender ?? null;
    }

    /** Set combat style (0-3). */
    async sendSetCombatStyle(style: number): Promise<ActionResult> {
        return this.sendAction({ type: 'setCombatStyle', style, reason: 'SDK' });
    }

    // ============ Prayer ============

    /** Toggle a prayer on or off by name or index (0-14). */
    async sendTogglePrayer(prayer: PrayerName | number): Promise<ActionResult> {
        const index = typeof prayer === 'number' ? prayer : PRAYER_INDICES[prayer];
        if (index === undefined || index < 0 || index > 14) {
            return { success: false, message: `Invalid prayer: ${prayer}` };
        }
        return this.sendAction({ type: 'togglePrayer', prayerIndex: index, reason: 'SDK' });
    }

    /** Get current prayer state from world state. */
    getPrayerState(): PrayerState | null {
        return this.state?.prayers || null;
    }

    /** Check if a specific prayer is currently active. */
    isPrayerActive(prayer: PrayerName | number): boolean {
        const prayerState = this.state?.prayers;
        if (!prayerState) return false;
        const index = typeof prayer === 'number' ? prayer : PRAYER_INDICES[prayer];
        if (index === undefined || index < 0 || index >= prayerState.activePrayers.length) return false;
        return !!prayerState.activePrayers[index];
    }

    /** Get list of all currently active prayer names. */
    getActivePrayers(): PrayerName[] {
        const prayerState = this.state?.prayers;
        if (!prayerState) return [];
        return prayerState.activePrayers
            .map((active, i) => active ? PRAYER_NAMES[i] : null)
            .filter((name): name is PrayerName => name !== null);
    }

    /** Cast spell on NPC using spell component ID (OPNPCT). */
    async sendSpellOnNpc(npcIndex: number, spellComponent: number): Promise<ActionResult> {
        return this.sendAction({ type: 'spellOnNpc', npcIndex, spellComponent, reason: 'SDK' });
    }

    /**
     * Cast spell on another player using spell component ID (OPPLAYERT).
     *
     * `playerIndex` is a world slot from `nearbyPlayers`, a different space from
     * npc indices - use {@link sendSpellOnTarget} to avoid mixing them up.
     */
    async sendSpellOnPlayer(playerIndex: number, spellComponent: number): Promise<ActionResult> {
        return this.sendAction({ type: 'spellOnPlayer', playerIndex, spellComponent, reason: 'SDK' });
    }

    /**
     * Cast a spell on whatever the target is - npc or player - picking the right
     * packet from `target.kind`. This is the one to reach for in code that fights
     * both, e.g. `sdk.sendSpellOnTarget(sdk.findNearbyPlayer('Zezima'), Spells.WIND_STRIKE)`.
     */
    async sendSpellOnTarget(target: NearbyNpc | NearbyPlayer, spellComponent: number): Promise<ActionResult> {
        return target.kind === 'player'
            ? this.sendSpellOnPlayer(target.index, spellComponent)
            : this.sendSpellOnNpc(target.index, spellComponent);
    }

    /** Cast spell on inventory item. */
    async sendSpellOnItem(slot: number, spellComponent: number): Promise<ActionResult> {
        return this.sendAction({ type: 'spellOnItem', slot, spellComponent, reason: 'SDK' });
    }

    /** Cast spell on ground item (e.g., Telekinetic Grab). */
    async sendSpellOnGroundItem(x: number, z: number, itemId: number, spellComponent: number): Promise<ActionResult> {
        return this.sendAction({ type: 'spellOnGroundItem', x, z, itemId, spellComponent, reason: 'SDK' });
    }

    /** Switch to a UI tab by index. */
    async sendSetTab(tabIndex: number): Promise<ActionResult> {
        return this.sendAction({ type: 'setTab', tabIndex, reason: 'SDK' });
    }

    /**
     * Send a single chat message. The server caps public chat at {@link maxMessageLength}
     * chars (400 on rs-sdk servers) and runs a word filter; `result.data` reports
     * `{ sent, truncated, filtered, finalText }` so you know if your message was clipped
     * or censored. For longer text that shouldn't be silently truncated, use {@link say}.
     */
    async sendSay(message: string): Promise<ActionResult> {
        const chunks = chunkMessage(message, this.serverMaxMessageLength);
        let last: ActionResult = { success: true, message: 'nothing to say' };
        for (const chunk of chunks) {
            last = await this.transport.say(chunk);
            if (!last.success) return last;
        }
        return last;
    }

    /**
     * Server-configured max chat length, learned from the gateway handshake. Defaults
     * to 80 (the RS wire limit) until the bot session reports the server's value, which
     * a server operator can raise via `node.maxMessageLength` in world.json.
     */
    get maxMessageLength(): number {
        return this.serverMaxMessageLength;
    }

    /**
     * Send a message of any length, auto-split into chunks on word boundaries and sent
     * in order (so a multi-sentence plan isn't lost to the chat-length cap). Waits a
     * tick between chunks so they don't collide. Returns one ActionResult per chunk.
     *
     * @param text The full message to send.
     * @param opts.maxLen Max chars per chunk. Defaults to (and is capped at) the
     *   server-configured {@link maxMessageLength}.
     * @param opts.delayTicks Ticks to wait between chunks (default 1).
     */
    async say(text: string, opts: { maxLen?: number; delayTicks?: number } = {}): Promise<ActionResult[]> {
        const maxLen = Math.min(opts.maxLen ?? this.serverMaxMessageLength, this.serverMaxMessageLength);
        const delayTicks = opts.delayTicks ?? 1;
        const chunks = chunkMessage(text, maxLen);
        const results: ActionResult[] = [];
        for (let i = 0; i < chunks.length; i++) {
            results.push(await this.sendSay(chunks[i]!));
            if (i < chunks.length - 1 && delayTicks > 0) {
                await this.sendWait(delayTicks);
            }
        }
        return results;
    }

    /**
     * Send a single private message to another player by name. Delivered if the
     * target is online anywhere in the world - no friends-list setup needed. It
     * arrives in their chat as type 3 ("From <you>"), and echoes locally as
     * type 6 ("To <name>"). Same length cap and word filter as {@link sendSay};
     * the server accepts at most one social packet (say or PM) per tick, so
     * don't fire this back-to-back with public chat in the same tick.
     * For longer text, use {@link dm}.
     */
    async sendPrivateMessage(targetName: string, message: string): Promise<ActionResult> {
        return this.sendAction({ type: 'privateMessage', targetName, message, reason: 'SDK' });
    }

    /**
     * Send a private message of any length, auto-split into chunks like
     * {@link say}. Returns one ActionResult per chunk.
     *
     * @param targetName The recipient's username (max 12 chars).
     * @param text The full message to send.
     * @param opts.maxLen Max chars per chunk, capped at {@link maxMessageLength}.
     * @param opts.delayTicks Ticks to wait between chunks (default 1).
     */
    async dm(targetName: string, text: string, opts: { maxLen?: number; delayTicks?: number } = {}): Promise<ActionResult[]> {
        const maxLen = Math.min(opts.maxLen ?? this.serverMaxMessageLength, this.serverMaxMessageLength);
        const delayTicks = opts.delayTicks ?? 1;
        const chunks = chunkMessage(text, maxLen);
        const results: ActionResult[] = [];
        for (let i = 0; i < chunks.length; i++) {
            results.push(await this.sendPrivateMessage(targetName, chunks[i]!));
            if (i < chunks.length - 1 && delayTicks > 0) {
                await this.sendWait(delayTicks);
            }
        }
        return results;
    }

    /** Wait for specified number of game ticks. */
    async sendWait(ticks: number = 1): Promise<ActionResult> {
        return this.sendAction({ type: 'wait', ticks, reason: 'SDK' });
    }

    /** Deposit item to bank by slot. */
    async sendBankDeposit(slot: number, amount: number = 1): Promise<ActionResult> {
        // Amounts other than 1/5/10/All dispatch the "X" option; the client
        // executor waits for the server's count dialog and submits `amount`.
        return this.sendAction({ type: 'bankDeposit', slot, amount, reason: 'SDK' });
    }

    /** Withdraw item from bank by slot. */
    async sendBankWithdraw(slot: number, amount: number = 1): Promise<ActionResult> {
        return this.sendAction({ type: 'bankWithdraw', slot, amount, reason: 'SDK' });
    }

    // ============ Screenshot ============

    /**
     * Capture the client canvas as a PNG blob. The gateway screenshot round-trip
     * is gone; the transport reads the canvas the client renders into.
     */
    async screenshot(): Promise<Blob> {
        return this.transport.screenshot();
    }

    // ============ Local Pathfinding ============

    /** Find path to destination using local collision data. */
    findPath(
        destX: number,
        destZ: number,
        maxWaypoints: number = 500
    ): { success: boolean; waypoints: Array<{ x: number; z: number; level: number }>; reachedDestination?: boolean; error?: string } {
        const state = this.getState();
        if (!state?.player) {
            return { success: false, waypoints: [], error: 'No player state available' };
        }

        const { worldX: srcX, worldZ: srcZ, level } = state.player;

        // Only require source zone to be allocated - we need to know where we ARE
        // Destination zone may be unallocated (e.g., past a gate we haven't opened yet)
        // The pathfinder will find a partial path to the edge of known areas
        if (!pathfinding.isZoneAllocated(level, srcX, srcZ)) {
            return { success: false, waypoints: [], error: 'Source zone not allocated (no collision data for current position)' };
        }

        const destZoneAllocated = pathfinding.isZoneAllocated(level, destX, destZ);

        // 2048x2048 BFS grid handles any in-game distance in a single call.
        const waypoints = pathfinding.findLongPath(
            level,
            srcX,
            srcZ,
            destX,
            destZ,
            maxWaypoints,
            this.temporaryDoorBlocks.active()
        );

        // If no waypoints and destination zone isn't allocated, that's expected -
        // we just can't path there yet (might need to open a door first)
        if (waypoints.length === 0 && !destZoneAllocated) {
            // Return success with empty waypoints - caller should try raw walking toward destination
            return { success: true, waypoints: [], reachedDestination: false, error: 'Destination zone not allocated - try walking toward it' };
        }
        const lastWaypoint = waypoints[waypoints.length - 1];
        const reachedDestination = lastWaypoint !== undefined &&
            lastWaypoint.x === destX &&
            lastWaypoint.z === destZ;

        // Detect unreachable destinations: if the pathfinder couldn't reach the
        // destination and the remaining distance is still very large, the target
        // is likely on a different plane (underground areas share level 0 but use
        // Z offsets of +6400, making them allocated but disconnected from the surface).
        // The "just past a gate" case has a remaining distance of ~10-20 tiles, not hundreds.
        if (!reachedDestination && waypoints.length > 0) {
            const remainDist = Math.abs(lastWaypoint!.x - destX) + Math.abs(lastWaypoint!.z - destZ);
            if (remainDist > 100) {
                return { success: false, waypoints: [], error: `Destination (${destX}, ${destZ}) is unreachable — path ends ${remainDist} tiles away at (${lastWaypoint!.x}, ${lastWaypoint!.z}). The target may be underground or on a different plane that requires a ladder/stairs to access.` };
            }
        }

        return { success: true, waypoints, reachedDestination };
    }

    /**
     * Temporarily exclude a known door from this SDK instance's path queries.
     * The shared collision map is never mutated beyond the synchronous query.
     */
    blockDoorTemporarily(level: number, x: number, z: number, ttlMs: number = 30_000): boolean {
        const door = pathfinding.getDoorAt(level, x, z);
        if (!door) return false;
        this.temporaryDoorBlocks.block(door, ttlMs);
        return true;
    }

    /** Check this SDK session's non-expired temporary door evidence. */
    isDoorTemporarilyBlocked(level: number, x: number, z: number): boolean {
        return this.temporaryDoorBlocks.has(level, x, z);
    }

    /** Find path to destination (async alias for findPath). */
    async sendFindPath(
        destX: number,
        destZ: number,
        maxWaypoints: number = 500
    ): Promise<{ success: boolean; waypoints: Array<{ x: number; z: number; level: number }>; reachedDestination?: boolean; error?: string }> {
        return this.findPath(destX, destZ, maxWaypoints);
    }

    // ============ Plumbing: State Waiting ============

    /**
     * Wait for game state to be fully loaded and ready.
     * Ensures player position is valid (not 0,0), bot is in-game, and state is recent.
     *
     * @param timeout - Maximum time to wait in milliseconds (default: 15000)
     * @returns Promise that resolves when state is ready
     * @throws Error if timeout is reached
     *
     * @example
     * ```ts
     * await sdk.waitForReady();
     * // Now safe to access player position, NPCs, etc.
     * ```
     */
    async waitForReady(timeout: number = 15000): Promise<BotWorldState> {
        console.log('[BotSDK] Waiting for game state to be ready...');

        try {
            const state = await this.waitForCondition(s => {
                const validPosition = !!(s.player && s.player.worldX !== 0 && s.player.worldZ !== 0);
                const inGame = s.inGame;
                const hasEntities = (s.nearbyNpcs?.length ?? 0) > 0 || (s.nearbyLocs?.length ?? 0) > 0 || (s.groundItems?.length ?? 0) > 0;

                // Log progress for debugging
                if (!validPosition) {
                    console.log(`[BotSDK] Waiting - invalid position: (${s.player?.worldX}, ${s.player?.worldZ})`);
                } else if (!inGame) {
                    console.log('[BotSDK] Waiting - not in game');
                } else if (!hasEntities) {
                    console.log('[BotSDK] Waiting - no entities loaded yet');
                }

                return inGame && validPosition && hasEntities;
            }, timeout);

            console.log('[BotSDK] Game state ready!');
            return state;
        } catch (error) {
            console.error('[BotSDK] Timeout waiting for game state to be ready');
            throw new Error('Game state not ready within timeout');
        }
    }

    /**
     * Wait until the predicate passes on a state update and return that state.
     * THROWS `Error('waitForCondition timed out')` if the timeout expires -
     * wrap in try/catch (or `.catch(...)`) when a timeout is an expected
     * outcome rather than a fatal one.
     */
    async waitForCondition(
        predicate: (state: BotWorldState) => boolean,
        timeout: number = 30000
    ): Promise<BotWorldState> {
        if (this.state && predicate(this.state)) {
            return this.state;
        }

        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                unsubscribe();
                reject(new Error('waitForCondition timed out'));
            }, timeout);

            const unsubscribe = this.onStateUpdate((state) => {
                if (predicate(state)) {
                    clearTimeout(timeoutId);
                    unsubscribe();
                    resolve(state);
                }
            });
        });
    }

    /** Wait for next state update from server. */
    async waitForStateChange(timeout: number = 30000): Promise<BotWorldState> {
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                unsubscribe();
                reject(new Error('waitForStateChange timed out'));
            }, timeout);

            const unsubscribe = this.onStateUpdate((state) => {
                clearTimeout(timeoutId);
                unsubscribe();
                resolve(state);
            });
        });
    }

    /**
     * Wait for a specific number of server ticks (~300ms each).
     *
     * @param ticks - Number of server ticks to wait
     * @returns The state after waiting
     */
    async waitForTicks(ticks: number = 1): Promise<BotWorldState> {
        if (!this.state) {
            throw new Error('waitForTicks: no state available');
        }

        if (ticks <= 0) {
            return this.state;
        }

        const startTick = this.state.tick;
        const targetTick = startTick + ticks;

        return new Promise((resolve, reject) => {
            // Safety timeout: ticks * 1s + 5s buffer (server tick is ~300ms, so 1s is generous)
            const safetyTimeout = setTimeout(() => {
                unsubscribe();
                reject(new Error(`waitForTicks(${ticks}) safety timeout - no state updates received`));
            }, ticks * 1000 + 5000);

            const unsubscribe = this.onStateUpdate((state) => {
                if (state.tick >= targetTick) {
                    clearTimeout(safetyTimeout);
                    unsubscribe();
                    resolve(state);
                }
            });
        });
    }

    /**
     * Wait for the next state update from the server.
     * This is the most common waiting pattern - ensures fresh data after an action.
     *
     * State updates arrive once per server tick (~300ms) when PLAYER_INFO is received.
     *
     * @example
     * ```ts
     * await sdk.sendClickDialog(0);
     * await sdk.waitForStateUpdate();  // Wait for server to confirm
     * ```
     *
     * @returns The new state after the update
     */
    async waitForStateUpdate(): Promise<BotWorldState> {
        return this.waitForStateChange(5000);
    }



    // ============ Internal ============

    /**
     * Normalise a world state the way the gateway path used to before publishing it:
     * accumulate chat, fill the player worldX/worldZ aliases, mirror trade counts to
     * `amount`, and wrap skills so both `skills[0]` and `skills.Woodcutting` work.
     *
     * Works on a shallow copy: upstream owned the object it had just parsed, but the
     * local transport hands out the client's own per-cycle snapshot, shared with every
     * other reader. The skills `Proxy` in particular must not land on it — a proxied
     * array makes `structuredClone` throw DataCloneError, and the snapshot is posted
     * to the executor Worker (and later across an iframe) by exactly that route.
     */
    private ingestState(state: BotWorldState) {
        const s: BotWorldState = { ...state };

        // Accumulate chat into the deep history buffer. Must happen before state
        // listeners fire so waitForChat sees the new messages.
        if (s.gameMessages) {
            this.chatHistory.record(s.gameMessages);
        }

        // Players publish coordinates as x/z (NPCs/locs also carry
        // worldX/worldZ) - fill the aliases in so walkTo(p.worldX, ...)
        // can't silently become walkTo(undefined, undefined).
        if (s.nearbyPlayers) {
            for (const p of s.nearbyPlayers) {
                if (p.worldX === undefined) { p.worldX = p.x; p.worldZ = p.z; }
            }
        }

        // Trade offers publish counts as `count`; mirror to `amount` so
        // either spelling works (TradeResult item lists do the same).
        if (s.trade) {
            for (const list of [s.trade.myOffer, s.trade.theirOffer]) {
                if (!list) continue;
                for (const item of list) {
                    if (item.amount === undefined) item.amount = item.count;
                }
            }
        }

        // Wrap skills array with a Proxy so both state.skills[0] and state.skills.Woodcutting work
        if (s.skills && !(s.skills as { __named__?: boolean }).__named__) {
            const nameMap: Record<string, SkillState> = {};
            for (const skill of s.skills) {
                if (/^Stat\d+$/i.test(skill.name)) continue;
                nameMap[skill.name] = skill;
            }
            s.skills = new Proxy(s.skills, {
                get(target, prop, receiver) {
                    if (prop === '__named__') return true;
                    if (typeof prop === 'string' && prop in nameMap) {
                        return nameMap[prop];
                    }
                    return Reflect.get(target, prop, receiver);
                }
            }) as SkillState[];
        }

        this.state = s;
        this.stateReceivedAt = Date.now();
    }
}

// Re-export types for convenience
export * from './types';
