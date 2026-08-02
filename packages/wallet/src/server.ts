/**
 * Standalone wallet server entry point.
 * Run with: npx ts-node packages/wallet/src/server.ts
 */
import { createWalletApp } from './wallet-server';

const PORT = parseInt(process.env.WALLET_PORT || '3002', 10);
const ISSUER_URL = process.env.ISSUER_URL || 'http://localhost:3001';

async function main() {
  const { app, walletCore } = createWalletApp({
    port: PORT,
    issuerUrl: ISSUER_URL,
  });

  // Initialize the wallet (generate DID)
  const did = await walletCore.initialize();
  console.log(`[Wallet] Initialized with DID: ${did}`);

  app.listen(PORT, () => {
    console.log(`[Wallet] Reference wallet server running at http://localhost:${PORT}`);
    console.log(`[Wallet] Issuer URL: ${ISSUER_URL}`);
    console.log(`[Wallet] Endpoints:`);
    console.log(`  GET  /api/identity             — Wallet DID`);
    console.log(`  GET  /api/credentials           — List credentials`);
    console.log(`  POST /api/receive-offer         — Accept credential offer`);
    console.log(`  POST /api/presentation-request  — Process presentation request`);
  });
}

main().catch(console.error);
