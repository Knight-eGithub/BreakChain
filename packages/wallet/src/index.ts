// @breakchain/wallet — Reference Wallet for the Breakchain ZKP Credential Ecosystem

export { WalletCore } from './wallet-core';
export type { WalletCoreOptions } from './wallet-core';

export { IssuanceClient } from './issuance-client';
export type { IssuanceClientOptions, IssuanceResult } from './issuance-client';

export { PresentationEngine } from './presentation-engine';
export type { PresentationMode, PresentationRequest, PresentationResponse } from './presentation-engine';

export { createWalletApp } from './wallet-server';
export type { WalletServerConfig } from './wallet-server';
