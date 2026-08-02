import express from "express";
import cors from "cors";

import { InMemoryKeyStore } from "@breakchain/crypto";

import { WalletCore } from "./wallet-core";
import { InMemoryCredentialStore } from "./storage/memory-store";
import { IssuanceClient } from "./issuance-client";
import { PresentationEngine } from "./presentation-engine";

const app = express();

app.use(cors());
app.use(express.json());

const keyStore = new InMemoryKeyStore();
const credentialStore = new InMemoryCredentialStore();

const wallet = new WalletCore(
  keyStore,
  credentialStore
);

let issuanceClient: IssuanceClient;
let presentationEngine: PresentationEngine;

/**
 * Initialize wallet once
 */
(async () => {
  const did = await wallet.initialize();

  issuanceClient = new IssuanceClient(
    wallet,
    keyStore
  );

  presentationEngine = new PresentationEngine(
    keyStore,
    did
  );

  console.log("Wallet DID:", did);
})();

app.post("/api/receive-offer", async (req, res) => {
  try {
    const { offerUrl } = req.body;

    if (!offerUrl) {
      return res.status(400).json({
        error: "offerUrl is required",
      });
    }

    const credential =
      await issuanceClient.processOffer(
        offerUrl
      );

    res.json({
      success: true,
      credential,
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Unknown error",
    });

  }
});    


app.get("/api/credentials", async (_, res) => {

  try {

    const credentials =
      await wallet.getCredentials();

    res.json(credentials);

  } catch (error) {

    res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "Unknown error",
    });

  }

});



app.post(
  "/api/presentation-request",
  async (req, res) => {

    try {

      const {
        definition,
        challenge,
        mode,
      } = req.body;

      const credentials =
        await wallet.findCredentials(
          definition.input_descriptors
        );

      const presentation =
        await presentationEngine.createPresentation(
          credentials,
          definition,
          challenge,
          mode
        );

      res.json(presentation);

    } catch (error) {

      res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : "Unknown error",
      });

    }

  }
);   

const PORT = 3002;

app.listen(PORT, () => {
  console.log(
    `Wallet server running on http://localhost:${PORT}`
  );
});