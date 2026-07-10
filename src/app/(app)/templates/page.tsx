import { requireContext } from "@/lib/context";
import { loadTemplates } from "@/lib/templates/queries";
import { TemplatesBrowser } from "./templates-browser";

export default async function TemplatesPage() {
  const { supabase, org } = await requireContext();
  const templates = await loadTemplates(supabase, org.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Templates</h1>
        <p className="text-sm text-muted-foreground">
          Reusable starting points for emails, campaigns, and workflows. Pick a
          curated template or one your team saved.
        </p>
      </div>
      <TemplatesBrowser templates={templates} />
    </div>
  );
}
