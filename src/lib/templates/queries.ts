// Server-side loading for the template library. Merges curated (code) templates
// with the org's own saved templates. Import only from server components /
// server actions — never from client code.

import type { SupabaseClient } from "@supabase/supabase-js";
import { CURATED_TEMPLATES, findCuratedTemplate } from "./curated";
import {
  isEmailTemplate,
  type Template,
  type TemplateContent,
  type TemplateKind,
} from "./types";

/** Lightweight email snippets for the rich editor's "Insert template" menu. */
export type EmailSnippet = {
  id: string;
  name: string;
  subject: string;
  body: string;
};

export async function loadEmailSnippets(
  supabase: SupabaseClient,
  orgId: string
): Promise<EmailSnippet[]> {
  const emails = (await loadTemplatesByKind(supabase, orgId, "email")).filter(
    isEmailTemplate
  );
  return emails.map((t) => ({
    id: t.id,
    name: t.name,
    subject: t.content.subject,
    body: t.content.body,
  }));
}

type TemplateRow = {
  id: string;
  kind: TemplateKind;
  name: string;
  description: string | null;
  content: TemplateContent;
  created_at: string;
};

function rowToTemplate(row: TemplateRow): Template {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    description: row.description ?? "",
    source: "org",
    createdAt: row.created_at,
    content: row.content,
  } as Template;
}

/** All templates (curated + org) of every kind, curated first. */
export async function loadTemplates(
  supabase: SupabaseClient,
  orgId: string
): Promise<Template[]> {
  const { data } = await supabase
    .from("templates")
    .select("id, kind, name, description, content, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  const org = ((data ?? []) as TemplateRow[]).map(rowToTemplate);
  return [...CURATED_TEMPLATES, ...org];
}

/** Templates of a single kind, curated first. */
export async function loadTemplatesByKind(
  supabase: SupabaseClient,
  orgId: string,
  kind: TemplateKind
): Promise<Template[]> {
  const all = await loadTemplates(supabase, orgId);
  return all.filter((t) => t.kind === kind);
}

/**
 * Resolve a single template by id — checks curated templates first (string
 * ids), then the org's saved templates (uuid ids). Returns null if not found or
 * the kind doesn't match the caller's expectation.
 */
export async function findTemplate(
  supabase: SupabaseClient,
  orgId: string,
  id: string,
  expectedKind?: TemplateKind
): Promise<Template | null> {
  const curated = findCuratedTemplate(id);
  if (curated) {
    return expectedKind && curated.kind !== expectedKind ? null : curated;
  }

  const { data } = await supabase
    .from("templates")
    .select("id, kind, name, description, content, created_at")
    .eq("org_id", orgId)
    .eq("id", id)
    .maybeSingle();

  if (!data) return null;
  const tpl = rowToTemplate(data as TemplateRow);
  return expectedKind && tpl.kind !== expectedKind ? null : tpl;
}
