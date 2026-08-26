import { Plus } from "lucide-react";
import { requireContext } from "@/lib/context";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { DESTINATIONS } from "@/lib/nav";
import { CompaniesTable } from "./companies-table";
import { CompanyDialog } from "./company-dialog";
import type { Company } from "@/lib/types";

export default async function CompaniesPage() {
  const { supabase, org } = await requireContext();

  const { data: companies } = await supabase
    .from("companies")
    .select("*")
    .eq("org_id", org.id)
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <PageHeader
        title={DESTINATIONS.companies.label}
        description={DESTINATIONS.companies.description}
        actions={
          <CompanyDialog
            trigger={
              <Button>
                <Plus className="size-4" /> Add company
              </Button>
            }
          />
        }
      />

      <CompaniesTable data={(companies ?? []) as Company[]} />
    </div>
  );
}
