import type { EmailMessage, EmailProvider } from '../email/provider.js';

/** Collects emails instead of sending them. `failFor` makes sends to some addresses throw. */
export class RecordingEmail implements EmailProvider {
  readonly sent: EmailMessage[] = [];
  failFor: (to: string) => boolean = () => false;

  send(message: EmailMessage): Promise<void> {
    if (this.failFor(message.to)) return Promise.reject(new Error('smtp is down'));
    this.sent.push(message);
    return Promise.resolve();
  }
}
