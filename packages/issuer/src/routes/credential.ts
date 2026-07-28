import { Router, Request, Response } from 'express';
import { IssuerConfig } from '../config';
import { IssuerStore } from '../store';
import { IssuerKeyManager } from '../issuer-keys';
import { createCredential, issueSDJWT } from '@breakchain/credentials';
import { generateSalt } from '@breakchain/crypto';
import { v4 as uuidv4 } from 'uuid';

export function createCredentialRouter(config: IssuerConfig, store: IssuerStore, keyManager: IssuerKeyManager): Router {
  const router = Router();

  router.post('/api/credential', async (req: Request, res: Response) => {
    try {
      const tokenData = res.locals.tokenData;
      if (!tokenData) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const offer = store.getOfferById(tokenData.offer_id);
      if (!offer) {
        res.status(400).json({ error: 'Offer not found' });
        return;
      }

      const format = req.body.format || 'ldp_vc';
      const cNonce = generateSalt();
      const credId = `urn:uuid:${uuidv4()}`;

      let credentialResponse: any;

      if (format === 'ldp_vc') {
        const vc = createCredential({
          id: credId,
          issuer: keyManager.getDid(),
          subject: { id: offer.subject_did, ...offer.claims },
          types: ['VerifiableCredential', offer.credential_type]
        });
        
        const signedVc = await keyManager.signCredential(vc);
        
        credentialResponse = {
          format: 'ldp_vc',
          credential: JSON.stringify(signedVc),
          c_nonce: cNonce,
          c_nonce_expires_in: 300
        };
      } else if (format === 'sd-jwt') {
        const schema = config.credentialSchemas[offer.credential_type];
        const disclosureFrame = schema?.disclosureFrame || [];
        
        const sdJwtResult = await issueSDJWT({
          issuer: keyManager.getDid(),
          subject: offer.subject_did,
          claims: offer.claims,
          disclosureFrame,
          privateKey: keyManager.getPrivateKey()
        });

        credentialResponse = {
          format: 'sd-jwt',
          credential: sdJwtResult.compact,
          c_nonce: cNonce,
          c_nonce_expires_in: 300
        };
      } else {
        res.status(400).json({ error: 'Unsupported format' });
        return;
      }

      store.storeCredential({
        id: credId,
        issuer_did: keyManager.getDid(),
        subject_did: offer.subject_did,
        credential_type: offer.credential_type,
        format
      });

      res.json(credentialResponse);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
