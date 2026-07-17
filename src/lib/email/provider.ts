// Pluggable email sending. Dev/default = MockProvider (logs, always succeeds).
// If EMAIL_PROVIDER_API_KEY is set, a real Resend-backed provider is used.
// Per-user mailbox OAuth (Gmail/Outlook) is deferred — see docs/02-stack-decision.

export type SendMessage = {
  from: string; // "Name <email@domain>"
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  /** Extra MIME headers, e.g. List-Unsubscribe / List-Unsubscribe-Post. */
  headers?: Record<string, string>;
};

export type SendResult = { id: string; status: "sent" | "failed"; error?: string };

export interface EmailProvider {
  readonly name: string;
  send(msg: SendMessage): Promise<SendResult>;
}

class MockProvider implements EmailProvider {
  readonly name = "mock";
  async send(msg: SendMessage): Promise<SendResult> {
    // No real delivery in dev — record intent so the engine + funnel work E2E.
    console.log(`[mock-email] → ${msg.to} · "${msg.subject}"`);
    return { id: `mock_${Math.round(performance.now())}_${msg.to}`, status: "sent" };
  }
}

class ResendProvider implements EmailProvider {
  readonly name = "resend";
  constructor(private apiKey: string) {}
  async send(msg: SendMessage): Promise<SendResult> {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: msg.from,
          to: msg.to,
          subject: msg.subject,
          html: msg.html,
          reply_to: msg.replyTo,
          headers: msg.headers,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        return { id: "", status: "failed", error: `${res.status}: ${text}` };
      }
      const data = (await res.json()) as { id: string };
      return { id: data.id, status: "sent" };
    } catch (e) {
      return { id: "", status: "failed", error: (e as Error).message };
    }
  }
}

// ---- Connected-mailbox providers (Gmail / Outlook via OAuth) ----------------
// These send AS the user's own account using the provider's native API. Unlike
// the global providers above they are per-mailbox: constructed with a live
// access token by sendViaMailbox() in ./send.ts, which owns token refresh.

/** RFC 2047 encode a header value if it contains non-ASCII characters. */
function encodeHeaderWord(value: string): string {
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

/** Gmail API — POSTs a base64url RFC 822 message to users.messages.send. */
export class GmailProvider implements EmailProvider {
  readonly name = "gmail";
  constructor(private accessToken: string) {}

  async send(msg: SendMessage): Promise<SendResult> {
    try {
      const headers: string[] = [
        `From: ${msg.from}`,
        `To: ${msg.to}`,
        `Subject: ${encodeHeaderWord(msg.subject)}`,
        "MIME-Version: 1.0",
        'Content-Type: text/html; charset="UTF-8"',
        "Content-Transfer-Encoding: base64",
      ];
      if (msg.replyTo) headers.push(`Reply-To: ${msg.replyTo}`);
      for (const [k, v] of Object.entries(msg.headers ?? {})) headers.push(`${k}: ${v}`);
      // Body base64 in 76-char lines per MIME; header/body separated by a blank line.
      const body = Buffer.from(msg.html, "utf8").toString("base64").replace(/(.{76})/g, "$1\r\n");
      const mime = `${headers.join("\r\n")}\r\n\r\n${body}`;
      const raw = Buffer.from(mime, "utf8").toString("base64url");

      const res = await fetch(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ raw }),
        },
      );
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return { id: "", status: "failed", error: `${res.status}: ${text.slice(0, 300)}` };
      }
      const data = (await res.json()) as { id?: string };
      return { id: data.id ?? "", status: "sent" };
    } catch (e) {
      return { id: "", status: "failed", error: (e as Error).message };
    }
  }
}

/** Microsoft Graph — POSTs a message object to /me/sendMail. */
export class OutlookProvider implements EmailProvider {
  readonly name = "outlook";
  constructor(private accessToken: string) {}

  async send(msg: SendMessage): Promise<SendResult> {
    try {
      // Graph only accepts custom internet headers whose name starts with "x-";
      // anything else (e.g. List-Unsubscribe) is rejected, so we drop them here
      // rather than fail the send.
      const internetMessageHeaders = Object.entries(msg.headers ?? {})
        .filter(([k]) => k.toLowerCase().startsWith("x-"))
        .map(([name, value]) => ({ name, value }));

      const message: Record<string, unknown> = {
        subject: msg.subject,
        body: { contentType: "HTML", content: msg.html },
        toRecipients: [{ emailAddress: { address: msg.to } }],
      };
      if (msg.replyTo) message.replyTo = [{ emailAddress: { address: msg.replyTo } }];
      if (internetMessageHeaders.length) message.internetMessageHeaders = internetMessageHeaders;

      // Graph forces "from" to the authenticated user — which is the mailbox
      // address — so we don't set it. sendMail returns 202 Accepted with no body.
      const res = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message, saveToSentItems: true }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return { id: "", status: "failed", error: `${res.status}: ${text.slice(0, 300)}` };
      }
      // Graph sendMail doesn't return a message id; synthesize one for our records.
      return { id: `graph_${msg.to}_${msg.subject.length}`, status: "sent" };
    } catch (e) {
      return { id: "", status: "failed", error: (e as Error).message };
    }
  }
}

export function getEmailProvider(): EmailProvider {
  const key = process.env.EMAIL_PROVIDER_API_KEY;
  return key ? new ResendProvider(key) : new MockProvider();
}

/** True when a real delivery provider (API key) is configured. */
export function isEmailDeliveryConfigured(): boolean {
  return !!process.env.EMAIL_PROVIDER_API_KEY;
}

/**
 * Default "from" identity for product emails, from EMAIL_FROM. Falls back to
 * Resend's shared test sender so dev works without a verified domain — note
 * that address only *delivers* to your own Resend account email. A mailbox's
 * own address, when the org has one, takes precedence over this at call sites.
 */
export function defaultFrom(): string {
  return process.env.EMAIL_FROM || "Handshake <onboarding@resend.dev>";
}
