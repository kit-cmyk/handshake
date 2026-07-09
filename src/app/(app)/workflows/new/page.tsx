import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireContext } from "@/lib/context";
import { NewWorkflow } from "./new-workflow";
import type { Mailbox } from "@/lib/types";
import type { Segment } from "@/lib/segments";

export default async function NewWorkflowPage() {
  const { supabase, org } = await requireContext();

  const [
    { data: segments },
    { data: campaigns },
    { data: workflows },
    { data: mailboxes },
  ] = await Promise.all([
    supabase.from("segments").select("id, name").eq("org_id", org.id).order("name"),
    supabase
      .from("campaigns")
      .select("id, name")
      .eq("org_id", org.id)
      .neq("status", "archived")
      .order("name"),
    supabase
      .from("workflows")
      .select("id, name")
      .eq("org_id", org.id)
      .neq("status", "ended")
      .order("name"),
    supabase
      .from("mailboxes")
      .select("id, email, display_name")
      .eq("org_id", org.id)
      .eq("status", "active"),
  ]);

  const segmentOptions = ((segments ?? []) as Pick<Segment, "id" | "name">[]).map(
    (s) => ({ id: s.id, name: s.name })
  );
  const campaignOptions = ((campaigns ?? []) as { id: string; name: string }[]).map(
    (c) => ({ id: c.id, name: c.name })
  );
  const workflowOptions = ((workflows ?? []) as { id: string; name: string }[]).map(
    (w) => ({ id: w.id, name: w.name })
  );
  const mailboxOptions = ((mailboxes ?? []) as Mailbox[]).map((m) => ({
    id: m.id,
    name: m.display_name ? `${m.display_name} · ${m.email}` : m.email,
    email: m.email,
    displayName: m.display_name,
  }));

  return (
    <div className="space-y-6">
      <Link
        href="/workflows"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to workflows
      </Link>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">New workflow</h1>
        <p className="text-sm text-muted-foreground">
          Pick a trigger, then build the automation.
        </p>
      </div>
      <NewWorkflow
        segments={segmentOptions}
        campaigns={campaignOptions}
        workflows={workflowOptions}
        mailboxes={mailboxOptions}
      />
    </div>
  );
}
