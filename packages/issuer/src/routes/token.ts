import { Router, Request, Response } from 'express';
import { IssuerStore } from '../store';
import { generateSalt } from '@breakchain/crypto';

export function createTokenRouter(store: IssuerStore): Router {
  const router = Router();

  router.post('/api/token', (req: Request, res: Response) => {
    try {
      const grantType = req.body.grant_type;
      const preAuthCode = req.body['pre-authorized_code'];
      
      if (grantType !== 'urn:ietf:params:oauth:grant-type:pre-authorized_code' || !preAuthCode) {
        res.status(400).json({ error: 'Invalid grant_type or missing pre-authorized_code' });
        return;
      }

      const offer = store.getOffer(preAuthCode);
      if (!offer || offer.consumed) {
        res.status(400).json({ error: 'Invalid or consumed pre-authorized_code' });
        return;
      }

      const accessToken = generateSalt();
      const cNonce = generateSalt();
      
      store.consumeOffer(preAuthCode);
      store.createToken({
        access_token: accessToken,
        offer_id: offer.id!,
        c_nonce: cNonce,
        expires_at: Date.now() + 3600 * 1000 // 1 hour
      });

      res.json({
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: 3600,
        c_nonce: cNonce,
        c_nonce_expires_in: 300
      });
    } catch (e) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
