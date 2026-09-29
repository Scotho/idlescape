// The vendored rs-sdk game API, bound to a Transport. `sdk` is the raw protocol layer
// (one method per action); `bot` is the porcelain that observes the resulting effect.
import { BotSDK } from '../vendor/rs-sdk/sdk/index';
import { BotActions } from '../vendor/rs-sdk/sdk/actions';
import type { Transport } from './types';

export function createLocalSdk(transport: Transport): { sdk: BotSDK; bot: BotActions } {
  const sdk = new BotSDK(transport);
  return { sdk, bot: new BotActions(sdk) };
}
