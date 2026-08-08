import type { VerifiableCredential } from '@breakchain/core';
import { InMemoryKeyStore } from '@breakchain/crypto';

/**
 * MockWallet — in-browser wallet using real SDK packages.
 *
 * Uses InMemoryKeyStore from @breakchain/crypto for key management,
 * stores credentials in a simple array for the demo.
 */
export class MockWallet {
  private keyStore = new InMemoryKeyStore();
  private did: string | null = null;
  private credentials: VerifiableCredential[] = [];

  async initialize(): Promise<string> {
    const { id } = await this.keyStore.generateKeyPair();
    this.did = id;
    return this.did;
  }

  getDid(): string {
    if (!this.did) throw new Error('Wallet not initialized');
    return this.did;
  }

  async addCredential(vc: VerifiableCredential): Promise<void> {
    // Avoid duplicates
    if (!this.credentials.find(c => c.id === vc.id)) {
      this.credentials.push(vc);
    }
  }

  async getCredentials(): Promise<VerifiableCredential[]> {
    return [...this.credentials];
  }

  async removeCredential(id: string): Promise<boolean> {
    const idx = this.credentials.findIndex(c => c.id === id);
    if (idx >= 0) {
      this.credentials.splice(idx, 1);
      return true;
    }
    return false;
  }

  getKeyStore(): InMemoryKeyStore {
    return this.keyStore;
  }
}
