import { requireContext } from "@/lib/context";
import { loadTemplates } from "@/lib/templates/queries";
import { PageHeader } from "@/components/page-header";
import { DESTINATIONS } from "@/lib/nav";
import { TemplatesBrowser } from "./templates-browser";

export default async function TemplatesPage() {
  const { supabase, org } = await requireContext();
  const templates = await loadTemplates(supabase, org.id);

  return (
    <div className="space-y-6">
      <PageHeader
        title={DESTINATIONS.templates.label}
        description={DESTINATIONS.templates.description}
      />
      <TemplatesBrowser templates={templates} />
    </div>
  );
}
