"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { MoreHorizontal, Pencil, Copy, Trash2, Bookmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { duplicateCampaign, deleteCampaign } from "../actions";
import { saveCampaignAsTemplate } from "../../templates/actions";

/**
 * The campaign detail "Actions" menu: edit, duplicate, and delete grouped
 * behind a single CTA. Status/lifecycle transitions live in the separate status
 * dropdown ([[campaign-status-menu]]).
 */
export function CampaignActions({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = React.useState<string | null>(null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={pending}>
            Actions <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/campaigns/${campaignId}/edit`}>
              <Pencil /> Edit
            </Link>
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={() =>
              start(async () => {
                setErr(null);
                const res = await duplicateCampaign(campaignId);
                if (res.error) setErr(res.error);
                else if (res.id) router.push(`/campaigns/${res.id}`);
              })
            }
          >
            <Copy /> Duplicate
          </DropdownMenuItem>

          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              const name = window.prompt(
                "Save this campaign as a template. Template name:"
              );
              if (!name?.trim()) return;
              start(async () => {
                setErr(null);
                const res = await saveCampaignAsTemplate({
                  campaignId,
                  name: name.trim(),
                });
                if (res.error) setErr(res.error);
                else router.push("/templates");
              });
            }}
          >
            <Bookmark /> Save as template
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <ConfirmDialog
            trigger={
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={(e) => e.preventDefault()}
              >
                <Trash2 /> Delete
              </DropdownMenuItem>
            }
            title="Delete campaign?"
            description="This permanently deletes the campaign, its steps, and enrollment history, and stops any in-flight sequences. This can't be undone."
            onConfirm={async () => {
              const res = await deleteCampaign(campaignId);
              if (res.ok) router.push("/campaigns");
              else if (res.error) setErr(res.error);
            }}
          />
        </DropdownMenuContent>
      </DropdownMenu>
      {err && <p className="mt-1 text-sm text-destructive">{err}</p>}
    </>
  );
}
