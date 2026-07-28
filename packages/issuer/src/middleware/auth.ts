import { Request, Response, NextFunction } from 'express';
import { IssuerStore } from '../store';

export function bearerAuth(store: IssuerStore) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or invalid Authorization header' });
      return;
    }
    const token = authHeader.substring(7);
    const tokenData = store.getToken(token);
    if (!tokenData || tokenData.used || tokenData.expires_at < Date.now()) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }
    res.locals.tokenData = tokenData;
    next();
  };
}
