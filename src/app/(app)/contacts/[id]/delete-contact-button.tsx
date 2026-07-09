"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { deleteContact } from "../actions";

export function DeleteContactButton({ id }: { id: string }) {
  const router = useRouter();

  return (
    <ConfirmDialog
      trigger={
        <Button variant="outline" size="sm">
          <Trash2 className="size-4" /> Delete
        </Button>
      }
      title="Delete contact?"
      description="This permanently deletes this contact and their activity. This can't be undone."
      onConfirm={async () => {
        const res = await deleteContact(id);
        if (res.ok) router.push("/contacts");
      }}
    />
  );
}
