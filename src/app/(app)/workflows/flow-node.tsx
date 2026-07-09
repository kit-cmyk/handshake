"use client";

import * as React from "react";
import {
  Handle,
  Position,
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type NodeProps,
  type EdgeProps,
} from "@xyflow/react";
import {
  Play,
  Mail,
  Clock,
  UserCog,
  ListPlus,
  Megaphone,
  ArrowRightLeft,
  GitBranch,
  Plus,
  AlertTriangle,
  Webhook,
  Flag,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { isTerminalAction, type ActionType, type NodeData } from "@/lib/workflows";

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

export type AddStepFn = (fromId: string, handle?: "true" | "false") => void;
export const AddStepContext = React.createContext<AddStepFn | null>(null);

/** Per-node display metadata resolved by the builder (needs segment names and
 *  live trigger state, so it can't be derived from node.data alone). */
export type NodeMeta = { description: string; incomplete: boolean };
export const NodeMetaContext = React.createContext<
  (id: string, data: NodeData) => NodeMeta
>(() => ({ description: "", incomplete: false }));

/** Whether a node (or a specific branch handle) already has an outgoing edge.
 *  When it does, the "+" lives on that edge instead of hugging the node. */
export const HasOutgoingContext = React.createContext<
  (id: string, handle?: "true" | "false") => boolean
>(() => false);

/** Round "+" affordance for adding the next step. Shared by nodes (for as-yet
 *  unwired handles) and edges (rendered at the line's midpoint). */
function AddButton({
  onClick,
  className,
  style,
}: {
  onClick: () => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <button
      type="button"
      aria-label="Add step"
      className={cn(
        "nodrag nopan flex size-5 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm transition-colors hover:bg-primary hover:text-primary-foreground",
        className
      )}
      style={style}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <Plus className="size-3" />
    </button>
  );
}

/** Single custom node for the whole graph. Branch nodes expose two source
 *  handles (true/false), each with its own + button when unwired. */
export function FlowNode({ id, data, selected }: NodeProps) {
  const d = data as NodeData;
  const requestAdd = React.useContext(AddStepContext);
  const meta = React.useContext(NodeMetaContext)(id, d);
  const hasOutgoing = React.useContext(HasOutgoingContext);
  const isTrigger = d.kind === "trigger";
  const isBranch = d.action === "branch";
  const isTerminal = isTerminalAction(d.action);
  const Icon: LucideIcon = isTrigger
    ? Play
    : d.action
      ? ACTION_ICON[d.action]
      : Play;

  return (
    <div
      className={cn(
        "relative min-w-44 rounded-md border bg-card px-3 py-2 text-sm shadow-sm",
        selected && "ring-2 ring-ring",
        meta.incomplete && !selected && "border-amber-500/70"
      )}
    >
      {!isTrigger && <Handle type="target" position={Position.Top} />}

      <div className="flex items-center gap-2">
        <Icon className="size-4 text-muted-foreground" />
        <span className="font-medium">{d.label}</span>
      </div>
      {meta.incomplete ? (
        <p className="mt-0.5 flex items-center gap-1 text-xs text-amber-600 dark:text-amber-500">
          <AlertTriangle className="size-3" />
          Needs setup
        </p>
      ) : meta.description ? (
        <p
          className="mt-0.5 max-w-[200px] truncate text-xs text-muted-foreground"
          title={meta.description}
        >
          {meta.description}
        </p>
      ) : (
        isTrigger && (
          <p className="mt-0.5 text-xs text-muted-foreground">Start</p>
        )
      )}

      {isBranch ? (
        <>
          <div className="mt-1 flex justify-between px-1 text-[10px] text-muted-foreground">
            <span>Yes</span>
            <span>No</span>
          </div>
          <Handle
            type="source"
            position={Position.Bottom}
            id="true"
            style={{ left: "25%" }}
          />
          <Handle
            type="source"
            position={Position.Bottom}
            id="false"
            style={{ left: "75%" }}
          />
          {requestAdd && !hasOutgoing(id, "true") && (
            <AddButton
              onClick={() => requestAdd(id, "true")}
              className="absolute z-10"
              style={{ left: "25%", bottom: -22, transform: "translateX(-50%)" }}
            />
          )}
          {requestAdd && !hasOutgoing(id, "false") && (
            <AddButton
              onClick={() => requestAdd(id, "false")}
              className="absolute z-10"
              style={{ left: "75%", bottom: -22, transform: "translateX(-50%)" }}
            />
          )}
        </>
      ) : isTerminal ? null : (
        <>
          <Handle type="source" position={Position.Bottom} />
          {requestAdd && !hasOutgoing(id) && (
            <AddButton
              onClick={() => requestAdd(id)}
              className="absolute z-10"
              style={{ left: "50%", bottom: -22, transform: "translateX(-50%)" }}
            />
          )}
        </>
      )}
    </div>
  );
}

/** Custom edge that draws the connector and floats the "+" add-step button at
 *  the line's midpoint, so it reads as "insert a step here". */
export function FlowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  source,
  sourceHandleId,
  markerEnd,
  style,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  const requestAdd = React.useContext(AddStepContext);
  const handle = (sourceHandleId as "true" | "false" | null) ?? undefined;

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
      {requestAdd && (
        <EdgeLabelRenderer>
          <div
            className="absolute"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "all",
            }}
          >
            <AddButton onClick={() => requestAdd(source, handle)} />
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const nodeTypes = { hs: FlowNode };
export const edgeTypes = { hs: FlowEdge };
