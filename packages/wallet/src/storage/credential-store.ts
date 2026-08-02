import type { VerifiableCredential } from "@breakchain/core";

/**
 * Contract for credential storage implementations.
 *
 * WalletCore depends on this interface rather than a specific
 * storage implementation (Memory, IndexedDB, etc.).
 */
export interface CredentialStore {
  /**
   * Store a credential.
   * If a credential with the same id already exists,
   * it should be replaced.
   */
  addCredential(credential: VerifiableCredential): Promise<void>;

  /**
   * Get a credential by its unique id.
   */
  getCredential(id: string): Promise<VerifiableCredential | null>;

  /**
   * Return all stored credentials.
   */
  getCredentials(): Promise<VerifiableCredential[]>;

  /**
   * Remove a credential by id.
   */
  removeCredential(id: string): Promise<void>;

  /**
   * Remove every credential from storage.
   */
  clear(): Promise<void>;
}