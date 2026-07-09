"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { deleteDeal } from "../actions";

export function DeleteDealButton({ id }: { id: string }) {
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={
        <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
          <Trash2 className="size-4" /> Delete
        </Button>
      }
      title="Delete deal?"
      description="This permanently deletes the deal and its timeline. This can't be undone."
      onConfirm={async () => {
        await deleteDeal(id);
        router.push("/pipeline");
      }}
    />
  );
}
