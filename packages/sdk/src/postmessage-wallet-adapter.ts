/**
 * PostMessageWalletAdapter — Communicates with a wallet via window.postMessage.
 *
 * Use this adapter when the wallet is a browser extension or an iframe
 * on the same page. Messages follow the breakchain: namespace protocol.
 *
 * Protocol Messages:
 *   breakchain:connect            → { type, origin }
 *   breakchain:connected          ← { type, did, sessionId }
 *   breakchain:presentation-request → { type, presentationDefinition, challenge, mode?, circuitId?, claimRequests? }
 *   breakchain:presentation-response ← { type, success, presentation?, error? }
 *   breakchain:disconnect         → { type, sessionId }
 */
import type {
  WalletAdapter,
  WalletSession,
  SDKConfig,
  PresentationDefinition,
  VerifiablePresentation,
} from '@breakchain/core';
import { WalletConnectionError, WalletDeniedError, TimeoutError } from '@breakchain/core';
import { generateSalt } from '@breakchain/crypto';

export class PostMessageWalletAdapter implements WalletAdapter {
  readonly type = 'postMessage' as const;

  async connect(config: SDKConfig): Promise<WalletSession> {
    const targetOrigin = config.walletOrigin || '*';
    const timeout = config.timeout || 30000;

    return new Promise<WalletSession>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new TimeoutError(`Wallet connection timed out after ${timeout}ms`));
      }, timeout);

      const handler = (event: MessageEvent) => {
        if (targetOrigin !== '*' && event.origin !== targetOrigin) return;
        const data = event.data;
        if (data?.type !== 'breakchain:connected') return;

        cleanup();
        resolve({
          sessionId: data.sessionId || generateSalt(),
          walletDid: data.did,
          connected: true,
          metadata: { origin: event.origin, adapterType: 'postMessage' },
        });
      };

      const cleanup = () => {
        clearTimeout(timer);
        if (typeof window !== 'undefined') {
          window.removeEventListener('message', handler);
        }
      };

      if (typeof window === 'undefined') {
        reject(new WalletConnectionError('PostMessage adapter requires a browser environment'));
        return;
      }

      window.addEventListener('message', handler);
      window.postMessage({ type: 'breakchain:connect', origin: window.location.origin }, targetOrigin);
    });
  }

  async sendPresentationRequest(
    session: WalletSession,
    request: PresentationDefinition,
    challenge: string,
  ): Promise<VerifiablePresentation> {
    const targetOrigin = (session.metadata?.origin as string) || '*';
    const timeout = 120000; // 2 minutes for proof generation

    return new Promise<VerifiablePresentation>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new TimeoutError('Presentation request timed out'));
      }, timeout);

      const handler = (event: MessageEvent) => {
        if (targetOrigin !== '*' && event.origin !== targetOrigin) return;
        const data = event.data;
        if (data?.type !== 'breakchain:presentation-response') return;

        cleanup();
        if (!data.success || !data.presentation) {
          reject(new WalletDeniedError(data.error || 'Wallet denied the presentation request'));
          return;
        }
        resolve(data.presentation);
      };

      const cleanup = () => {
        clearTimeout(timer);
        if (typeof window !== 'undefined') {
          window.removeEventListener('message', handler);
        }
      };

      if (typeof window === 'undefined') {
        reject(new WalletConnectionError('PostMessage adapter requires a browser environment'));
        return;
      }

      window.addEventListener('message', handler);
      window.postMessage({
        type: 'breakchain:presentation-request',
        sessionId: session.sessionId,
        presentationDefinition: request,
        challenge,
      }, targetOrigin);
    });
  }

  async disconnect(session: WalletSession): Promise<void> {
    if (typeof window !== 'undefined') {
      const targetOrigin = (session.metadata?.origin as string) || '*';
      window.postMessage({ type: 'breakchain:disconnect', sessionId: session.sessionId }, targetOrigin);
    }
  }
}
