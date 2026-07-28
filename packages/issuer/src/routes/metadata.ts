import { Router, Request, Response } from 'express';
import { IssuerConfig } from '../config';
import { IssuerKeyManager } from '../issuer-keys';

export function createMetadataRouter(config: IssuerConfig, keyManager: IssuerKeyManager): Router {
  const router = Router();

  router.get('/.well-known/openid-credential-issuer', (req: Request, res: Response) => {
    const configurationsSupported: Record<string, any> = {};
    for (const [key, schema] of Object.entries(config.credentialSchemas)) {
      let scope = 'identity';
      if (key === 'DriverLicense') scope = 'driving';
      if (key === 'Diploma') scope = 'education';
      configurationsSupported[key] = { format: 'ldp_vc', scope };
    }

    res.json({
      credential_issuer: config.issuerUrl,
      credential_endpoint: `${config.issuerUrl}/api/credential`,
      token_endpoint: `${config.issuerUrl}/api/token`,
      credential_configurations_supported: configurationsSupported
    });
  });

  router.get('/.well-known/did.json', (req: Request, res: Response) => {
    res.json(keyManager.getDIDDocument());
  });

  return router;
}
