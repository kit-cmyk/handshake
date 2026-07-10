import type { SupabaseClient } from "@supabase/supabase-js";
import { inngest } from "@/lib/inngest/client";
import {
  LIFECYCLE_STAGES,
  type DealStatus,
  type LifecycleStage,
} from "@/lib/types";

// Deal pipeline ⇄ contact lifecycle are two views of the same funnel. A deal's
// position in the pipeline drives its contact's lifecycle stage: move the deal
// forward and the contact follows. This is the one place that translation lives.

/**
 * Map a deal stage name (+ derived status) to the lifecycle stage a contact
 * should hold. Stage names are org-customizable, so we match case-insensitively
 * against the lifecycle vocabulary plus a few common non-lifecycle synonyms.
 * Returns null when a stage has no sensible lifecycle equivalent — callers then
 * leave the contact's lifecycle untouched rather than guessing.
 */
export function lifecycleForStage(
  stageName: string | null | undefined,
  status: DealStatus,
): LifecycleStage | null {
  // A won/lost deal pins the contact regardless of the stage's label.
  if (status === "won") return "won";
  if (status === "lost") return "lost";

  const name = (stageName ?? "").trim().toLowerCase();
  if (!name) return null;

  // Exact match against the lifecycle vocabulary (new/contacted/qualified/…).
  if (LIFECYCLE_STAGES.includes(name as LifecycleStage)) {
    return name as LifecycleStage;
  }

  // Common default/custom stage names that sit inside the funnel.
  const SYNONYMS: Record<string, LifecycleStage> = {
    lead: "new",
    "new lead": "new",
    open: "new",
    reached: "contacted",
    "in contact": "contacted",
    engaged: "contacted",
    proposal: "qualified",
    "proposal sent": "qualified",
    negotiation: "qualified",
    quoted: "qualified",
    demo: "qualified",
  };
  return SYNONYMS[name] ?? null;
}

/**
 * Resolve the lifecycle stage a deal on `stage` should give its contact. The
 * stage's configured `lifecycle_stage` (set in Settings → Pipeline) is the
 * source of truth; when unset, we fall back to matching the stage name. A
 * won/lost deal status still pins the contact regardless.
 */
export function targetLifecycle(
  stage: { name: string | null; lifecycle_stage: LifecycleStage | null } | null,
  status: DealStatus,
): LifecycleStage | null {
  if (status === "won") return "won";
  if (status === "lost") return "lost";
  return stage?.lifecycle_stage ?? lifecycleForStage(stage?.name, status);
}

/**
 * Bring a contact's lifecycle stage in line with the deal stage it just landed
 * on. No-ops when the deal has no contact, the stage doesn't map, or the
 * lifecycle already matches. On a real transition it emits `contact/stage.changed`
 * so lifecycle-triggered campaigns and workflows fire the same way they would
 * for a manual lifecycle edit. Best-effort: never throws into the deal path.
 */
export async function syncContactLifecycleFromDeal(
  client: SupabaseClient,
  orgId: string,
  contactId: string | null | undefined,
  stage: { name: string | null; lifecycle_stage: LifecycleStage | null } | null,
  status: DealStatus,
): Promise<void> {
  if (!contactId) return;

  const target = targetLifecycle(stage, status);
  if (!target) return;

  const { data: contact } = await client
    .from("contacts")
    .select("lifecycle_stage")
    .eq("id", contactId)
    .maybeSingle();

  const current = (contact?.lifecycle_stage as string | undefined) ?? null;
  // A contact with no lifecycle yet (e.g. imported without a stage) must still
  // adopt the deal's target — only skip when it already matches.
  if (current === target) return;

  const { error } = await client
    .from("contacts")
    .update({ lifecycle_stage: target })
    .eq("id", contactId);
  if (error) return;

  await inngest.send({
    name: "contact/stage.changed",
    data: { orgId, contactId, from: current, to: target },
  });
}
