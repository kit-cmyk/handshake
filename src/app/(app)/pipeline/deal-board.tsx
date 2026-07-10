"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, MoveRight, Pencil, Trash2, MoreHorizontal, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DealDialog } from "./deal-dialog";
import { DealSheet } from "./deal-sheet";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { moveDeal, deleteDeal } from "./actions";
import type { DealPriority, DealWithRelations, Stage } from "@/lib/types";
import { contactName, DEAL_PRIORITY_LABELS } from "@/lib/types";

const PRIORITY_VARIANT: Record<
  DealPriority,
  "secondary" | "warning" | "destructive"
> = {
  low: "secondary",
  medium: "warning",
  high: "destructive",
};

type Option = { id: string; name: string };
type ContactOption = { id: string; name: string; companyId: string | null };

function money(v: number | null): string {
  if (v == null) return "";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(v);
}

export function DealBoard({
  pipelineId,
  stages,
  deals,
  companies,
  contacts,
}: {
  pipelineId: string;
  stages: Stage[];
  deals: DealWithRelations[];
  companies: Option[];
  contacts: ContactOption[];
}) {
  const router = useRouter();

  // Local copy so a dropped card jumps to its new column immediately; the prop
  // is the source of truth once router.refresh() lands. Re-sync when the prop
  // changes by adjusting during render (React's recommended pattern).
  const [board, setBoard] = React.useState(deals);
  const [prevDeals, setPrevDeals] = React.useState(deals);
  if (deals !== prevDeals) {
    setPrevDeals(deals);
    setBoard(deals);
  }

  const [draggingId, setDraggingId] = React.useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = React.useState<string | null>(null);
  const [activeDealId, setActiveDealId] = React.useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = React.useState(false);

  const byStage = React.useMemo(() => {
    const map: Record<string, DealWithRelations[]> = {};
    for (const s of stages) map[s.id] = [];
    for (const d of board) (map[d.stage_id] ??= []).push(d);
    return map;
  }, [stages, board]);

  async function handleDrop(stageId: string) {
    const id = draggingId;
    setDraggingId(null);
    setDragOverStage(null);
    if (!id) return;
    const deal = board.find((d) => d.id === id);
    if (!deal || deal.stage_id === stageId) return;

    setBoard((prev) =>
      prev.map((d) => (d.id === id ? { ...d, stage_id: stageId } : d))
    );
    await moveDeal(id, stageId);
    router.refresh();
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {stages.map((stage) => {
        const items = byStage[stage.id] ?? [];
        const total = items.reduce((sum, d) => sum + (d.value ?? 0), 0);
        const isDropTarget = dragOverStage === stage.id;
        return (
          <div key={stage.id} className="flex min-w-56 flex-1 basis-0 flex-col">
            <div className="mb-2 flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">{stage.name}</span>
                <span className="text-xs text-muted-foreground">
                  {items.length}
                </span>
              </div>
              <span className="text-xs text-muted-foreground">
                {money(total)}
              </span>
            </div>

            <div
              className={`flex-1 space-y-2 rounded-lg border p-2 transition-colors ${
                isDropTarget
                  ? "border-primary/40 bg-primary/10 ring-2 ring-primary/40"
                  : "border-border/60 bg-muted/40"
              }`}
              onDragOver={(e) => {
                if (!draggingId) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (dragOverStage !== stage.id) setDragOverStage(stage.id);
              }}
              onDragLeave={(e) => {
                // Only clear when the pointer truly leaves the column.
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setDragOverStage((s) => (s === stage.id ? null : s));
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                void handleDrop(stage.id);
              }}
            >
              {items.map((deal) => (
                <div
                  key={deal.id}
                  draggable
                  onDragStart={(e) => {
                    setDraggingId(deal.id);
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", deal.id);
                  }}
                  onDragEnd={() => {
                    setDraggingId(null);
                    setDragOverStage(null);
                  }}
                  onClick={() => {
                    setActiveDealId(deal.id);
                    setSheetOpen(true);
                  }}
                  className={`cursor-pointer rounded-md border bg-card p-3 shadow-sm active:cursor-grabbing ${
                    draggingId === deal.id ? "opacity-50" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium leading-tight">
                      {deal.title}
                    </p>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-6 shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DealDialog
                          pipelineId={pipelineId}
                          stages={stages}
                          companies={companies}
                          contacts={contacts}
                          deal={deal}
                          trigger={
                            <DropdownMenuItem
                              onSelect={(e) => e.preventDefault()}
                            >
                              <Pencil className="size-4" /> Edit
                            </DropdownMenuItem>
                          }
                        />
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel className="flex items-center gap-1 text-xs">
                          <MoveRight className="size-3" /> Move to
                        </DropdownMenuLabel>
                        {stages
                          .filter((s) => s.id !== deal.stage_id)
                          .map((s) => (
                            <DropdownMenuItem
                              key={s.id}
                              onSelect={async () => {
                                await moveDeal(deal.id, s.id);
                                router.refresh();
                              }}
                            >
                              {s.name}
                            </DropdownMenuItem>
                          ))}
                        <DropdownMenuSeparator />
                        <ConfirmDialog
                          trigger={
                            <DropdownMenuItem
                              className="text-destructive"
                              onSelect={(e) => e.preventDefault()}
                            >
                              <Trash2 className="size-4" /> Delete
                            </DropdownMenuItem>
                          }
                          title="Delete deal?"
                          description={`This permanently deletes “${deal.title}”. This can't be undone.`}
                          onConfirm={async () => {
                            await deleteDeal(deal.id);
                            router.refresh();
                          }}
                        />
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="mt-1.5 flex items-center gap-2">
                    {deal.value != null && (
                      <span className="text-sm font-semibold text-foreground">
                        {money(deal.value)}
                      </span>
                    )}
                    <Badge variant={PRIORITY_VARIANT[deal.priority]}>
                      {DEAL_PRIORITY_LABELS[deal.priority]}
                    </Badge>
                  </div>

                  {deal.contacts && (
                    <p className="mt-1.5 text-sm">
                      {contactName(deal.contacts)}
                    </p>
                  )}
                  {deal.contacts?.email && (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Mail className="size-3 shrink-0" />
                      <span className="truncate">{deal.contacts.email}</span>
                    </p>
                  )}
                  {deal.companies && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {deal.companies.name}
                    </p>
                  )}
                </div>
              ))}

              <DealDialog
                pipelineId={pipelineId}
                stages={stages}
                companies={companies}
                contacts={contacts}
                defaultStageId={stage.id}
                trigger={
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-muted-foreground"
                  >
                    <Plus className="size-4" /> Add deal
                  </Button>
                }
              />
            </div>
          </div>
        );
      })}

      {activeDealId && (
        <DealSheet
          key={activeDealId}
          dealId={activeDealId}
          open={sheetOpen}
          onOpenChange={setSheetOpen}
        />
      )}
    </div>
  );
}
