// @breakchain/sdk — Developer-facing API for the Breakchain ZKP Credential Ecosystem
//
// Primary API:
//   const sdk = new BreakchainSDK(config);
//   await sdk.connectWallet();
//   const result = await sdk.requestProof({ claims: [...], mode: 'zkp' });
//   const verification = await sdk.verifyPresentation(vp);
//   await sdk.disconnect();

export { BreakchainSDK } from './sdk';
export type { RequestProofOptions } from './sdk';

export { HttpWalletAdapter } from './http-wallet-adapter';
export type { WalletPresentationRequestBody } from './http-wallet-adapter';

export { PresentationRequestBuilder } from './request-builder';
export type { RequestBuilderOptions } from './request-builder';

export { VerificationEngine } from './verification-engine';
export type { VerificationEngineOptions } from './verification-engine';

export { PostMessageWalletAdapter } from './postmessage-wallet-adapter';

export { DeepLinkWalletAdapter } from './deeplink-wallet-adapter';
export type { DeepLinkCallbacks, DeepLinkAdapterOptions } from './deeplink-wallet-adapter';

// Re-export key types from core for consumer convenience
export type {
  SDKConfig,
  WalletAdapter,
  WalletSession,
  ClaimRequest,
  ProofResult,
  VerificationResult,
  VerifiablePresentation,
  VerifiableCredential,
  PresentationDefinition,
  ProverBackend,
} from '@breakchain/core';
