import express from 'express';
import cors from 'cors';
import { IssuerConfig, createDefaultConfig } from './config';
import { IssuerStore } from './store';
import { IssuerKeyManager } from './issuer-keys';
import { createMetadataRouter } from './routes/metadata';
import { createOfferRouter } from './routes/offer';
import { createTokenRouter } from './routes/token';
import { createCredentialRouter } from './routes/credential';
import { createRevocationRouter } from './routes/revocation';
import { bearerAuth } from './middleware/auth';

export function createApp(config?: Partial<IssuerConfig>): { app: express.Application; store: IssuerStore; keyManager: IssuerKeyManager } {
  const finalConfig = { ...createDefaultConfig(), ...config };
  const app = express();
  const store = new IssuerStore(':memory:');
  const keyManager = new IssuerKeyManager();

  app.use(cors());
  app.use(express.json());

  app.use('/', createMetadataRouter(finalConfig, keyManager));
  app.use('/', createOfferRouter(finalConfig, store));
  app.use('/', createTokenRouter(store));
  
  const authMw = bearerAuth(store);
  const credRouter = createCredentialRouter(finalConfig, store, keyManager);
  app.use('/', (req, res, next) => {
    if (req.path === '/api/credential') {
      authMw(req, res, () => credRouter(req, res, next));
    } else {
      credRouter(req, res, next);
    }
  });

  app.use('/', createRevocationRouter(store));

  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  });

  return { app, store, keyManager };
}
