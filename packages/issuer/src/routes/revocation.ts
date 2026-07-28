import { Router, Request, Response } from 'express';
import { IssuerStore } from '../store';

export function createRevocationRouter(store: IssuerStore): Router {
  const router = Router();

  router.get('/api/credentials', (req: Request, res: Response) => {
    res.json(store.listCredentials());
  });

  router.get('/api/credentials/:id/status', (req: Request, res: Response) => {
    const status = store.getCredentialStatus(req.params.id);
    if (!status) {
      res.status(404).json({ error: 'Credential not found' });
      return;
    }
    res.json(status);
  });

  router.post('/api/credentials/:id/revoke', (req: Request, res: Response) => {
    const success = store.revokeCredential(req.params.id, req.body.reason);
    if (!success) {
      res.status(404).json({ error: 'Credential not found' });
      return;
    }
    res.json({ success: true });
  });

  return router;
}
