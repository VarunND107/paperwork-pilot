export interface EmailMessage {
  to: string;
  subject: string;
  /** Plain text. Reminders carry no HTML, tracking pixels or attachments. */
  text: string;
}

/**
 * The only thing the rest of the app knows about sending email. A real provider (SMTP, an email
 * API) is a new class implementing this interface plus one line in `createEmailProvider`.
 * `send` must throw if the message was not accepted, so the caller can retry later.
 */
export interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
}

/** Development provider: writes the email to the server log instead of sending it. */
export class ConsoleEmailProvider implements EmailProvider {
  constructor(private readonly log: (line: string) => void = (line) => console.info(line)) {}

  send(message: EmailMessage): Promise<void> {
    this.log(
      [
        '[email:console] (not sent: console provider)',
        `  To:      ${message.to}`,
        `  Subject: ${message.subject}`,
        ...message.text.split('\n').map((l) => `  | ${l}`),
      ].join('\n'),
    );
    return Promise.resolve();
  }
}

export function createEmailProvider(kind: 'console'): EmailProvider {
  switch (kind) {
    case 'console':
      return new ConsoleEmailProvider();
  }
}
