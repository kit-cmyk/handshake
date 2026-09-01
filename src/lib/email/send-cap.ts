// The internal daily send cap for a mailbox.
//
// Every automated send goes through `reserveSendSlot` before it dispatches, so
// the app — not the provider — decides when a mailbox has sent enough for the
// day. That matters most for a connected Gmail/Outlook account: the provider
// enforces its own quota by *rejecting* messages, and a rejection mid-sequence
// is an outage (the contact never hears from us). Staying under our own,
// deliberately lower number turns that cliff into a scheduled pause.
//
// The counter itself lives in Postgres (`mailbox_send_counters`, migration
// 0026) and is moved only by two security-definer RPCs, so concurrent Inngest
// runs can't collectively overshoot the limit.

import type { SupabaseClient } from "@supabase/supabase-js";

export type CapTarget = { orgId: string; mailboxId: string; limit: number };

/**
 * Atomically claim one send slot for today. `true` = the caller may send.
 *
 * Fails OPEN: a counter error resolves true rather than blocking. A cap is a
 * reputation safeguard, not a correctness one, and silently withholding a
 * customer's campaign because a bookkeeping table was unreachable is the worse
 * failure of the two.
 */
export async function reserveSendSlot(
  db: SupabaseClient,
  { orgId, mailboxId, limit }: CapTarget,
): Promise<boolean> {
  if (!(limit > 0)) return true; // 0 / unset = uncapped
  const { data, error } = await db.rpc("reserve_mailbox_send", {
    p_org: orgId,
    p_mailbox: mailboxId,
    p_limit: limit,
  });
  if (error) return true;
  return data as boolean;
}

/**
 * Book a send that we chose not to gate — a human's inbox reply, or a mailbox
 * test. The provider counts these against the same daily quota, so leaving them
 * out would make our cap drift above the real one and hand the user a provider
 * rejection instead of our own orderly pause.
 *
 * Never throws and never blocks; the send has usually already happened.
 */
export async function recordSendUsage(
  db: SupabaseClient,
  { orgId, mailboxId }: Omit<CapTarget, "limit">,
): Promise<void> {
  try {
    await db.rpc("record_mailbox_send", { p_org: orgId, p_mailbox: mailboxId });
  } catch {
    // Bookkeeping only — a failure here must not surface to the sender.
  }
}

/** Whole minutes until the counter rolls over (00:00 UTC). At least 1. */
export function minutesUntilCounterReset(now: Date = new Date()): number {
  const startOfDay = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const nextDay = startOfDay + 24 * 60 * 60 * 1000;
  return Math.max(1, Math.ceil((nextDay - now.getTime()) / 60000));
}

/** Today's send count per mailbox id, for the mailboxes given. */
export async function sendsToday(
  db: SupabaseClient,
  orgId: string,
  mailboxIds: string[],
): Promise<Record<string, number>> {
  if (mailboxIds.length === 0) return {};
  const day = new Date().toISOString().slice(0, 10); // UTC date, matches the RPC
  const { data } = await db
    .from("mailbox_send_counters")
    .select("mailbox_id, count")
    .eq("org_id", orgId)
    .eq("day", day)
    .in("mailbox_id", mailboxIds);
  const out: Record<string, number> = {};
  for (const row of (data ?? []) as { mailbox_id: string; count: number }[]) {
    out[row.mailbox_id] = row.count;
  }
  return out;
}
