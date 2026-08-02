import type { VerifiableCredential } from "@breakchain/core";
import type { CredentialStore } from "./credential-store";

/**
 * In-memory implementation of CredentialStore.
 *
 * Mainly used for:
 * - Unit tests
 * - Local development
 * - Temporary runtime storage
 */
export class InMemoryCredentialStore implements CredentialStore {
  /**
   * Internal credential storage.
   *
   * Key   -> Credential ID
   * Value -> Verifiable Credential
   */
  private readonly credentials = new Map<string, VerifiableCredential>();

  /**
   * Add or replace a credential.
   */
  async addCredential(
    credential: VerifiableCredential
  ): Promise<void> {
    this.credentials.set(credential.id, credential);
  }

  /**
   * Get a credential by ID.
   */
  async getCredential(
    id: string
  ): Promise<VerifiableCredential | null> {
    return this.credentials.get(id) ?? null;
  }

  /**
   * Return all stored credentials.
   */
  async getCredentials(): Promise<VerifiableCredential[]> {
    return Array.from(this.credentials.values());
  }

  /**
   * Remove a credential.
   */
  async removeCredential(id: string): Promise<void> {
    this.credentials.delete(id);
  }

  /**
   * Remove all credentials.
   */
  async clear(): Promise<void> {
    this.credentials.clear();
  }
}