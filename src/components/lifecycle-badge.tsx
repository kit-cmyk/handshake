import { Badge } from "@/components/ui/badge";
import { LIFECYCLE_LABELS, type LifecycleStage } from "@/lib/types";

const VARIANT: Record<
  LifecycleStage,
  "secondary" | "default" | "success" | "warning" | "destructive"
> = {
  new: "secondary",
  contacted: "default",
  qualified: "warning",
  won: "success",
  lost: "destructive",
};

export function LifecycleBadge({ stage }: { stage: LifecycleStage }) {
  return <Badge variant={VARIANT[stage]}>{LIFECYCLE_LABELS[stage]}</Badge>;
}
