// DID Resolution — did:key and did:web methods
export {
  generateDidKey,
  didKeyToPublicKey,
  resolveDidKey,
  resolveDidKeyFull,
} from './did-key';

export {
  didWebToUrl,
  resolveDidWeb,
  resolveDidWebFull,
} from './did-web';

export {
  createResolver,
  detectMethod,
  extractPublicKeyFromDoc,
} from './resolver';

export type { DIDResolver } from './resolver';
