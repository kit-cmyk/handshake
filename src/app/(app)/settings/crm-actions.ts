"use server";

import { revalidatePath } from "next/cache";
import { requireContext } from "@/lib/context";
import { runCrmSync } from "@/lib/crm/sync";
import {
  buildTokenFields,
  readTokenFields,
  type CrmConnectionConfig,
} from "@/lib/crm/connection";
import { crmLabel, crmMeta, isCrmProviderType } from "@/lib/crm/providers";

// Server actions for the CRM cards. The live OAuth connect flow runs through the
// /api/crm/<provider>/connect + /callback routes (needs redirects + a CSRF
// cookie). These actions cover everything else: saving token-auth credentials,
// demo-mode connect, sync-now, pause, and disconnect.

export type CrmState = {
  ok?: boolean;
  error?: string;
  message?: string;
};

const CAN_MANAGE = ["owner", "admin"];

/** Read the stored config for a provider (server-side only). */
async function loadConfig(
  supabase: Awaited<ReturnType<typeof requireContext>>["supabase"],
  orgId: string,
  type: string,
): Promise<CrmConnectionConfig> {
  const { data } = await supabase
    .from("org_integrations")
    .select("config")
    .eq("org_id", orgId)
    .eq("type", type)
    .maybeSingle();
  return (data?.config ?? {}) as CrmConnectionConfig;
}

/**
 * Connect / update a token-auth CRM (HubSpot, Pipedrive, Salesforce, Zoho) from
 * the credential form. Secret fields are encrypted at rest; a blank secret on
 * re-edit keeps the stored value. Saving with no usable credentials drops into
 * demo mode so the flow is still exercisable.
 */
export async function saveCrmIntegration(
  _prev: CrmState,
  fd: FormData,
): Promise<CrmState> {
  const { supabase, org } = await requireContext();
  if (!CAN_MANAGE.includes(org.role))
    return { error: "Only workspace admins can change integrations." };

  const type = String(fd.get("type") ?? "");
  if (!isCrmProviderType(type)) return { error: "Unknown CRM." };
  const meta = crmMeta(type);
  if (meta.auth !== "token")
    return { error: `${meta.label} connects with OAuth, not a pasted token.` };

  const existing = await loadConfig(supabase, org.id, type);
  const input: Record<string, string> = {};
  for (const f of meta.fields) input[f.key] = String(fd.get(f.key) ?? "");
  const fields = buildTokenFields(type, input, existing.fields ?? {});

  const live = readTokenFields(type, { fields }) !== null;
  const config: CrmConnectionConfig = live ? { fields } : { mock: true };

  const { error } = await supabase.from("org_integrations").upsert(
    { org_id: org.id, type, config, enabled: true },
    { onConflict: "org_id,type" },
  );
  if (error) return { error: error.message };

  revalidatePath("/settings/integrations");
  return {
    ok: true,
    message: live
      ? `${meta.label} connected. Run a sync to pull your contacts.`
      : `${meta.label} saved in demo mode — add credentials for a live sync.`,
  };
}

/**
 * Connect an OAuth provider in demo mode — no OAuth app / credentials. Sync then
 * produces deterministic sample contacts so the flow is usable without an
 * external account.
 */
export async function connectCrmMock(type: string): Promise<CrmState> {
  const { supabase, org } = await requireContext();
  if (!CAN_MANAGE.includes(org.role))
    return { error: "Only workspace admins can change integrations." };
  if (!isCrmProviderType(type)) return { error: "Unknown CRM." };

  const config: CrmConnectionConfig = { mock: true };
  const { error } = await supabase.from("org_integrations").upsert(
    { org_id: org.id, type, config, enabled: true },
    { onConflict: "org_id,type" },
  );
  if (error) return { error: error.message };

  revalidatePath("/settings/integrations");
  return {
    ok: true,
    message: `${crmLabel(type)} connected in demo mode — run a sync to pull sample contacts.`,
  };
}

/** Pull contacts from the connected CRM now (synchronous, bounded). */
export async function syncCrmNow(type: string): Promise<CrmState> {
  const { supabase, org, userId } = await requireContext();
  if (!CAN_MANAGE.includes(org.role))
    return { error: "Only workspace admins can run a sync." };
  if (!isCrmProviderType(type)) return { error: "Unknown CRM." };

  const { data } = await supabase
    .from("org_integrations")
    .select("config")
    .eq("org_id", org.id)
    .eq("type", type)
    .maybeSingle();
  if (!data) return { error: `Connect ${crmLabel(type)} first, then sync.` };

  const res = await runCrmSync(supabase, {
    orgId: org.id,
    userId,
    type,
    config: (data.config ?? {}) as CrmConnectionConfig,
    trigger: "manual",
  });

  revalidatePath("/settings/integrations");
  revalidatePath("/contacts");

  if (!res.ok) return { error: res.error ?? "Sync failed." };

  const modeNote = res.mode === "mock" ? " (demo data)" : "";
  return {
    ok: true,
    message:
      `Synced ${crmLabel(type)}${modeNote}: ${res.created} added, ` +
      `${res.updated} updated, ${res.skipped} skipped` +
      (res.errored ? `, ${res.errored} errored` : "") +
      ".",
  };
}

/** Pause/resume scheduled syncing without dropping the stored credentials. */
export async function toggleCrmIntegration(
  type: string,
  enabled: boolean,
): Promise<CrmState> {
  const { supabase, org } = await requireContext();
  if (!CAN_MANAGE.includes(org.role))
    return { error: "Only workspace admins can change integrations." };
  if (!isCrmProviderType(type)) return { error: "Unknown CRM." };

  const { error } = await supabase
    .from("org_integrations")
    .update({ enabled })
    .eq("org_id", org.id)
    .eq("type", type);
  if (error) return { error: error.message };

  revalidatePath("/settings/integrations");
  return {
    ok: true,
    message: enabled ? "Scheduled sync resumed." : "Scheduled sync paused.",
  };
}

/** Remove the CRM connection and its stored (encrypted) credentials. */
export async function disconnectCrmIntegration(type: string): Promise<CrmState> {
  const { supabase, org } = await requireContext();
  if (!CAN_MANAGE.includes(org.role))
    return { error: "Only workspace admins can change integrations." };
  if (!isCrmProviderType(type)) return { error: "Unknown CRM." };

  const { error } = await supabase
    .from("org_integrations")
    .delete()
    .eq("org_id", org.id)
    .eq("type", type);
  if (error) return { error: error.message };

  revalidatePath("/settings/integrations");
  return { ok: true, message: `${crmLabel(type)} disconnected.` };
}
