"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireContext } from "@/lib/context";
import { DATASETS, findDataset, type Dataset } from "@/lib/data-erasure";

export type EraseState = {
  ok?: boolean;
  error?: string;
  message?: string;
  /** Which input the error belongs under, so forms can render it there. */
  field?: string;
};

const CAN_MANAGE = ["owner", "admin"];

/**
 * Runs a dataset's deletes in order and returns how many rows went. Throws on
 * the first failure so a half-finished sweep surfaces instead of reporting ok.
 */
async function eraseSteps(
  supabase: SupabaseClient,
  orgId: string,
  dataset: Dataset
): Promise<number> {
  let deleted = 0;
  for (const step of dataset.steps) {
    let q = supabase
      .from(step.table)
      .delete({ count: "exact" })
      .eq("org_id", orgId);
    for (const f of step.filters ?? []) {
      q = f.isNull ? q.is(f.column, null) : q.not(f.column, "is", null);
    }
    const { error, count } = await q;
    if (error) throw new Error(error.message);
    deleted += count ?? 0;
  }
  return deleted;
}

function records(n: number): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? "record" : "records"}`;
}

/**
 * Permanently deletes one category of workspace data. The client passes only
 * the dataset key — the org and the tables to touch are resolved server-side.
 */
export async function eraseDataset(key: string): Promise<EraseState> {
  const { supabase, org } = await requireContext();

  if (!CAN_MANAGE.includes(org.role))
    return { error: "Only workspace admins can delete data." };

  const dataset = findDataset(key);
  if (!dataset) return { error: "Unknown data category." };

  let deleted: number;
  try {
    deleted = await eraseSteps(supabase, org.id, dataset);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Delete failed." };
  }

  // Counts, badges, and list pages across the app all read these tables.
  revalidatePath("/", "layout");
  return {
    ok: true,
    message: `Deleted ${records(deleted)} from ${dataset.label}.`,
  };
}

/**
 * Empties the whole workspace: every category, in registry order so deals lose
 * their parties in the order the check constraint allows. The workspace itself,
 * its members, mailboxes, pipeline stages, and integrations are kept — this is
 * a reset, not an account closure.
 */
export async function eraseAllData(
  _prev: EraseState,
  fd: FormData
): Promise<EraseState> {
  const { supabase, org } = await requireContext();

  if (!CAN_MANAGE.includes(org.role))
    return { error: "Only workspace admins can delete data." };

  const typed = String(fd.get("confirm") ?? "").trim();
  if (typed.toLowerCase() !== org.name.trim().toLowerCase())
    return {
      error: `Type the workspace name (${org.name}) exactly to confirm.`,
      field: "confirm",
    };

  let deleted = 0;
  try {
    for (const dataset of DATASETS) {
      deleted += await eraseSteps(supabase, org.id, dataset);
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Delete failed." };
  }

  revalidatePath("/", "layout");
  return {
    ok: true,
    message: `Deleted ${records(deleted)}. ${org.name} is now empty.`,
  };
}
