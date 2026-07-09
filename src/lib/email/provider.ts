// Pluggable email sending. Dev/default = MockProvider (logs, always succeeds).
// If EMAIL_PROVIDER_API_KEY is set, a real Resend-backed provider is used.
// Per-user mailbox OAuth (Gmail/Outlook) is deferred — see docs/02-stack-decision.

export type SendMessage = {
  from: string; // "Name <email@domain>"
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
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
