"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { deleteCompany } from "../actions";

export function DeleteCompanyButton({ id }: { id: string }) {
  const router = useRouter();

  return (
    <ConfirmDialog
      trigger={
        <Button variant="outline" size="sm">
          <Trash2 className="size-4" /> Delete
        </Button>
      }
      title="Delete company?"
      description="This permanently deletes this company. Contacts and deals linked to it will be unlinked. This can't be undone."
      onConfirm={async () => {
        const res = await deleteCompany(id);
        if (res.ok) router.push("/companies");
      }}
    />
  );
}
