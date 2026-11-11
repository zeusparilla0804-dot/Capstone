import { createHash } from 'node:crypto';

function deliveryError(code: 'ECONNECTION' | 'EAUTH' | 'EENVELOPE') {
  // Provider response bodies and fetch errors may contain recipients, content, or credentials.
  return Object.assign(new Error('Email provider delivery failed.'), { code });
}

export function createResendTransport(apiKey: string, fetcher: typeof fetch = fetch) {
  return {
    async sendMail(message: Record<string, unknown>): Promise<{ id: string }> {
      const sender = message.from as { name: string; address: string };
      const payload = {
        from: `${JSON.stringify(sender.name)} <${sender.address}>`,
        to: [message.to], subject: message.subject, text: message.text, html: message.html,
      };
      const body = JSON.stringify(payload);
      const headers: Record<string, string> = {
        Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json',
      };
      if (typeof message.idempotencyKey === 'string') {
        headers['Idempotency-Key'] = createHash('sha256').update(message.idempotencyKey).digest('hex');
      }
      let response: Response;
      try {
        response = await fetcher('https://api.resend.com/emails', {
          method: 'POST', headers, body, signal: AbortSignal.timeout(15_000), redirect: 'error',
        });
      } catch {
        throw deliveryError('ECONNECTION');
      }
      if (!response.ok) {
        if (response.status === 408 || response.status === 409 || response.status === 429 || response.status >= 500) throw deliveryError('ECONNECTION');
        throw deliveryError(response.status === 401 || response.status === 403 ? 'EAUTH' : 'EENVELOPE');
      }
      try {
        const result: unknown = await response.json();
        if (!result || typeof result !== 'object' || !('id' in result) || typeof result.id !== 'string' || !result.id) {
          throw deliveryError('ECONNECTION');
        }
        return { id: result.id };
      } catch {
        throw deliveryError('ECONNECTION');
      }
    },
  };
}
