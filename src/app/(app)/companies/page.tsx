import { Plus } from "lucide-react";
import { requireContext } from "@/lib/context";
import { Button } from "@/components/ui/button";
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Companies</h1>
          <p className="text-sm text-muted-foreground">
            Accounts you&apos;re targeting.
          </p>
        </div>
        <CompanyDialog
          trigger={
            <Button>
              <Plus className="size-4" /> Add company
            </Button>
          }
        />
      </div>

      <CompaniesTable data={(companies ?? []) as Company[]} />
    </div>
  );
}
