/**
 * Wallet HTTP Server — Express-based simulator for the reference wallet.
 *
 * Endpoints:
 * - POST /api/receive-offer    — Accept a credential offer and run the issuance flow
 * - POST /api/presentation-request — Process a presentation request and return a VP
 * - GET  /api/credentials      — List all stored credentials
 * - GET  /api/identity         — Get the wallet's DID and metadata
 */
import express from 'express';
import cors from 'cors';
import type { ProverBackend } from '@breakchain/core';
import { WalletCore } from './wallet-core';
import type { WalletCoreOptions } from './wallet-core';
import { IssuanceClient } from './issuance-client';
import type { IssuanceClientOptions } from './issuance-client';
import { PresentationEngine } from './presentation-engine';
import type { PresentationRequest } from './presentation-engine';

export interface WalletServerConfig {
  /** Port to listen on. Default: 3002 */
  port?: number;
  /** Default issuer URL. Default: http://localhost:3001 */
  issuerUrl?: string;
  /** Wallet core options */
  walletOptions?: WalletCoreOptions;
  /** Prover backend for ZKP mode */
  proverBackend?: ProverBackend;
  /** Custom fetch function for testing */
  fetchFn?: typeof fetch;
}

/**
 * Creates the wallet Express app and all associated services.
 * Returns the app, wallet core, issuance client, and presentation engine
 * for programmatic use and testing.
 */
export function createWalletApp(config?: WalletServerConfig): {
  app: express.Application;
  walletCore: WalletCore;
  issuanceClient: IssuanceClient;
  presentationEngine: PresentationEngine;
} {
  const walletCore = new WalletCore(config?.walletOptions);
  const issuerUrl = config?.issuerUrl || 'http://localhost:3001';

  const issuanceClient = new IssuanceClient(walletCore, {
    issuerUrl,
    fetchFn: config?.fetchFn,
  });

  const presentationEngine = new PresentationEngine(walletCore, config?.proverBackend);

  const app = express();
  app.use(cors());
  app.use(express.json());

  /**
   * GET /api/identity — Returns the wallet's DID and status.
   */
  app.get('/api/identity', (_req, res) => {
    try {
      const did = walletCore.getDid();
      res.json({
        did,
        credentialCount: walletCore.getCredentialCount(),
        initialized: true,
      });
    } catch {
      res.json({ did: null, credentialCount: 0, initialized: false });
    }
  });

  /**
   * GET /api/credentials — Lists all stored credentials.
   */
  app.get('/api/credentials', async (_req, res) => {
    try {
      const credentials = await walletCore.getCredentials();
      res.json({
        count: credentials.length,
        credentials: credentials.map((vc, i) => ({
          index: i,
          id: vc.id,
          type: vc.type,
          issuer: vc.issuer,
          issuanceDate: vc.issuanceDate,
          hasProof: !!vc.proof,
        })),
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  /**
   * POST /api/receive-offer — Accepts a credential offer and runs the full issuance flow.
   *
   * Body: { offer: CredentialOffer, format?: 'ldp_vc' | 'sd-jwt' }
   * Or: { credential_type: string, claims: Record, format?: string }
   *   (shorthand that requests an offer from the issuer first)
   */
  app.post('/api/receive-offer', async (req, res) => {
    try {
      const { offer, credential_type, claims, format } = req.body;

      let result;
      if (offer) {
        // Direct offer processing
        result = await issuanceClient.processOffer(offer, format || 'ldp_vc');
      } else if (credential_type && claims) {
        // Shorthand: request an offer from the issuer, then process it
        const subjectDid = walletCore.getDid();
        result = await issuanceClient.requestIssuance(
          credential_type,
          subjectDid,
          claims,
          format || 'ldp_vc'
        );
      } else {
        res.status(400).json({ error: 'Must provide either `offer` or `credential_type` + `claims`' });
        return;
      }

      if (result.success) {
        res.json({
          success: true,
          credentialId: result.credential?.id,
          format: result.format,
          credentialCount: walletCore.getCredentialCount(),
        });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  /**
   * POST /api/presentation-request — Processes a presentation request and returns a VP.
   *
   * Body: PresentationRequest (see presentation-engine.ts)
   */
  app.post('/api/presentation-request', async (req, res) => {
    try {
      const request: PresentationRequest = req.body;

      if (!request.presentationDefinition) {
        res.status(400).json({ error: 'Missing presentationDefinition' });
        return;
      }

      if (!request.challenge) {
        res.status(400).json({ error: 'Missing challenge' });
        return;
      }

      const response = await presentationEngine.processRequest(request);

      if (response.success) {
        res.json(response);
      } else {
        res.status(400).json(response);
      }
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Global error handler
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[Wallet Server Error]', err);
    res.status(500).json({ error: 'Internal Server Error' });
  });

  return { app, walletCore, issuanceClient, presentationEngine };
}
