/**
 * SDK configuration and wallet adapter types
 */
import { VerifiablePresentation, VerifiableCredential } from './credentials';
import { PresentationDefinition, CredentialOffer } from './protocols';

export interface SDKConfig {
  walletAdapterType?: 'http' | 'postMessage' | 'extension' | 'deepLink';
  /** Application client ID for production deployments */
  clientId?: string;
  walletUrl?: string;
  walletOrigin?: string;
  issuerUrl?: string;
  verificationMode?: 'local' | 'remote';
  revocationCheck?: boolean;
  defaultProofMode?: 'zkp' | 'sd-jwt' | 'plain';
  timeout?: number;
}

export interface WalletSession {
  sessionId: string;
  walletDid?: string;
  connected: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * Adapter pattern for wallet communication
 */
export interface WalletAdapter {
  /** The type of wallet adapter (e.g. 'http', 'postMessage', 'extension', 'deepLink') */
  readonly type: string;
  
  /** Connect to the wallet */
  connect(config: SDKConfig): Promise<WalletSession>;
  
  /** Request a presentation from the wallet */
  sendPresentationRequest(session: WalletSession, request: PresentationDefinition, challenge: string): Promise<VerifiablePresentation>;
  
  /** Optional: Request credential issuance from the wallet */
  requestCredentialIssuance?(session: WalletSession, offer: CredentialOffer): Promise<VerifiableCredential>;
  
  /** Disconnect from the wallet */
  disconnect(session: WalletSession): Promise<void>;
}
