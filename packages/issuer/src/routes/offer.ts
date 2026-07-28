import { Router, Request, Response } from 'express';
import { IssuerConfig } from '../config';
import { IssuerStore } from '../store';
import { generateSalt } from '@breakchain/crypto';

export function createOfferRouter(config: IssuerConfig, store: IssuerStore): Router {
  const router = Router();

  router.post('/api/credential-offer', (req: Request, res: Response) => {
    try {
      const { credential_type, subject_did, claims } = req.body;
      if (!credential_type || !subject_did || !claims) {
        res.status(400).json({ error: 'Missing required fields' });
        return;
      }
      
      if (!config.credentialSchemas[credential_type]) {
        res.status(400).json({ error: 'Unknown credential_type' });
        return;
      }

      const preAuthCode = generateSalt();
      store.createOffer({
        pre_auth_code: preAuthCode,
        credential_type,
        subject_did,
        claims
      });

      res.json({
        credential_issuer: config.issuerUrl,
        credential_configuration_ids: [credential_type],
        grants: {
          "urn:ietf:params:oauth:grant-type:pre-authorized_code": {
            "pre-authorized_code": preAuthCode,
            "user_pin_required": false
          }
        }
      });
    } catch (e) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
