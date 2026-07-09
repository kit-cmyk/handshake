import { Inngest } from "inngest";

/**
 * Central Inngest client. All durable jobs (campaign sends, workflow runs,
 * segment re-evaluation, lead scraping) are registered against this app id.
 */
export const inngest = new Inngest({ id: "handshake" });
