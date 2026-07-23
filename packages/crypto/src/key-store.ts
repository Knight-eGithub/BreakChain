import { generateEd25519KeyPair, publicKeyToMultibase } from './keys';
import { sign } from './signing';

export interface KeyStore {
  generateKeyPair(): Promise<{ id: string; publicKey: Uint8Array }>;
  sign(keyId: string, data: Uint8Array): Promise<Uint8Array>;
  getPublicKey(keyId: string): Promise<Uint8Array | null>;
  listKeyIds(): Promise<string[]>;
  deleteKey(keyId: string): Promise<boolean>;
  has(keyId: string): Promise<boolean>;
}

export class InMemoryKeyStore implements KeyStore {
  private keys = new Map<string, { publicKey: Uint8Array; privateKey: Uint8Array }>();

  async generateKeyPair(): Promise<{ id: string; publicKey: Uint8Array }> {
    const keyPair = generateEd25519KeyPair();
    const id = `did:key:${publicKeyToMultibase(keyPair.publicKey)}`;
    this.keys.set(id, keyPair);
    return { id, publicKey: keyPair.publicKey };
  }

  async sign(keyId: string, data: Uint8Array): Promise<Uint8Array> {
    const keyPair = this.keys.get(keyId);
    if (!keyPair) {
      throw new Error(`Key ${keyId} not found`);
    }
    return sign(keyPair.privateKey, data);
  }

  async getPublicKey(keyId: string): Promise<Uint8Array | null> {
    const keyPair = this.keys.get(keyId);
    return keyPair ? keyPair.publicKey : null;
  }

  async listKeyIds(): Promise<string[]> {
    return Array.from(this.keys.keys());
  }

  async deleteKey(keyId: string): Promise<boolean> {
    return this.keys.delete(keyId);
  }

  async has(keyId: string): Promise<boolean> {
    return this.keys.has(keyId);
  }
}
