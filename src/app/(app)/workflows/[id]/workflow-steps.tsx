import {
  Play,
  Mail,
  Clock,
  UserCog,
  ListPlus,
  Megaphone,
  ArrowRightLeft,
  GitBranch,
  Webhook,
  Flag,
  type LucideIcon,
} from "lucide-react";
import type { ActionType } from "@/lib/workflows";

const ACTION_ICON: Record<ActionType, LucideIcon> = {
  send_email: Mail,
  wait: Clock,
  set_lifecycle: UserCog,
  add_to_segment: ListPlus,
  enroll_campaign: Megaphone,
  move_to_workflow: ArrowRightLeft,
  branch: GitBranch,
  webhook: Webhook,
  end_flow: Flag,
};

export type StepItem = {
  id: string;
  /** null = the trigger node. */
  action: ActionType | null;
  title: string;
  subtitle: string;
};

/**
 * Read-only summary of a workflow's steps in trigger-first traversal order —
 * the detail-page analogue of the campaign sequence view. The full editable
 * graph lives on the edit page.
 */
export function WorkflowSteps({ steps }: { steps: StepItem[] }) {
  if (!steps.length)
    return <p className="text-sm text-muted-foreground">No steps yet.</p>;

  return (
    <ol className="space-y-2">
      {steps.map((s, i) => {
        const Icon = s.action ? ACTION_ICON[s.action] : Play;
        return (
          <li
            key={s.id}
            className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm"
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full border bg-muted/40 text-xs font-medium tabular-nums">
              {s.action === null ? <Play className="size-3.5" /> : i}
            </span>
            <Icon className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0">
              <span className="font-medium">{s.title}</span>
              {s.subtitle && (
                <span className="ml-2 text-muted-foreground">{s.subtitle}</span>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
