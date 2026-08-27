"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Plus, X, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  saveSegment,
  previewSegment,
  type SegmentState,
  type SegmentPreview,
} from "./actions";
import { SegmentRuleFields } from "@/components/segment-rule-editor";
import { LifecycleBadge } from "@/components/lifecycle-badge";
import type { LifecycleStage } from "@/lib/types";
import {
  VALUELESS_OPS,
  MULTI_VALUE_OPS,
  definitionErrors,
  type Rule,
  type SegmentDefinition,
  type SegmentType,
  type Segment,
} from "@/lib/segments";

/** Strip the fields an operator doesn't use, so the saved JSON stays clean. */
function normalizeRule(r: Rule): Rule {
  if (VALUELESS_OPS.includes(r.op)) return { field: r.field, op: r.op };
  if (MULTI_VALUE_OPS.includes(r.op))
    return { field: r.field, op: r.op, values: r.values ?? [] };
  return { field: r.field, op: r.op, value: r.value ?? "" };
}

export function SegmentBuilder({
  segment,
  /** Explicit member count for a static segment, so the wipe warning is specific. */
  memberCount,
  onSaved,
}: {
  segment?: Segment;
  memberCount?: number;
  onSaved?: (id: string) => void;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<SegmentState, FormData>(
    saveSegment,
    {}
  );
  const [name, setName] = React.useState(segment?.name ?? "");
  const [type, setType] = React.useState<SegmentType>(segment?.type ?? "dynamic");
  const [match, setMatch] = React.useState<"all" | "any">(
    segment?.definition?.match ?? "all"
  );
  const [rules, setRules] = React.useState<Rule[]>(
    segment?.definition?.rules ?? []
  );
  // Validation messages stay hidden until the first save attempt, so a
  // half-typed rule isn't shouting at you while you build it.
  const [submitted, setSubmitted] = React.useState(false);

  const definition: SegmentDefinition = React.useMemo(
    () => ({ match, rules: rules.map(normalizeRule) }),
    [match, rules]
  );

  const ruleProblems = React.useMemo(
    () => definitionErrors(definition),
    [definition]
  );
  const hasProblems = ruleProblems.some((e) => e.length > 0);

  // Editing a filterless static list (a CSV import, or a hand-built list) and
  // adding a rule replaces its membership with whatever the rule matches. The
  // save action can't tell that apart from any other edit, so warn here.
  const startedAsExplicitList =
    !!segment &&
    segment.type === "static" &&
    (segment.definition?.rules ?? []).length === 0;
  const willReplaceList = startedAsExplicitList && rules.length > 0;

  // Debounced live preview (count + a sample of matching contacts).
  const [preview, setPreview] = React.useState<SegmentPreview | null>(null);
  const [previewing, setPreviewing] = React.useState(false);
  const defJson = JSON.stringify(definition);
  // Only the newest request may write state: the debounce narrows the window
  // but a slow earlier call could still land last and show a stale count.
  const requestSeq = React.useRef(0);

  React.useEffect(() => {
    // An unfinished rule has nothing meaningful to preview — wait for it.
    if (hasProblems) return;
    const seq = ++requestSeq.current;
    const t = setTimeout(async () => {
      setPreviewing(true);
      const result = await previewSegment(defJson);
      // A superseded request must not write: it would show a count for a
      // filter the user has already edited past.
      if (seq !== requestSeq.current) return;
      setPreview(result);
      setPreviewing(false);
    }, 350);
    return () => clearTimeout(t);
  }, [defJson, hasProblems]);

  // Save succeeded: hand control back to the sheet (close + navigate).
  React.useEffect(() => {
    if (state.ok && state.id) {
      if (onSaved) onSaved(state.id);
      else router.push(`/segments/${state.id}`);
    }
  }, [state.ok, state.id, onSaved, router]);

  function addRule() {
    setRules((rs) => [
      ...rs,
      { field: "lifecycle_stage", op: "equals", value: "" },
    ]);
  }
  function removeRule(i: number) {
    setRules((rs) => rs.filter((_, idx) => idx !== i));
  }
  function updateRule(i: number, patch: Partial<Rule>) {
    setRules((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        setSubmitted(true);
        if (hasProblems) e.preventDefault();
      }}
      className="space-y-6"
    >
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="definition" value={defJson} />
      {segment && <input type="hidden" name="id" value={segment.id} />}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Segment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                name="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Qualified dentists in Austin"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as SegmentType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dynamic">
                    Dynamic — auto-updates as contacts match
                  </SelectItem>
                  <SelectItem value="static">
                    Static — a fixed snapshot of today&apos;s matches
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filter</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2 text-sm">
            <span>Contacts match</span>
            <Select value={match} onValueChange={(v) => setMatch(v as "all" | "any")}>
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">all</SelectItem>
                <SelectItem value="any">any</SelectItem>
              </SelectContent>
            </Select>
            <span>of these conditions:</span>
          </div>

          <div className="space-y-3">
            {rules.map((rule, i) => (
              <div key={i} className="flex items-start gap-2">
                <SegmentRuleFields
                  rule={rule}
                  onChange={(patch) => updateRule(i, patch)}
                  showErrors={submitted}
                  idPrefix={`rule-${i}`}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0"
                  onClick={() => removeRule(i)}
                  aria-label={`Remove condition ${i + 1}`}
                >
                  <X className="size-4" />
                </Button>
              </div>
            ))}
          </div>

          <Button type="button" variant="outline" size="sm" onClick={addRule}>
            <Plus className="size-4" /> Add condition
          </Button>

          {rules.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {startedAsExplicitList
                ? "No conditions — this segment keeps the exact list of people already in it."
                : "No conditions — this segment will include all contacts."}
            </p>
          )}

          {willReplaceList && (
            <div className="flex gap-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
              <p>
                This segment currently holds a fixed list
                {typeof memberCount === "number"
                  ? ` of ${memberCount} contact${memberCount === 1 ? "" : "s"}`
                  : ""}
                . Saving with conditions replaces that list with whatever the
                filter matches — anyone not matching is dropped.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Matching contacts</CardTitle>
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              {hasProblems ? (
                "Finish every condition to see matches."
              ) : preview?.error ? (
                <span className="text-destructive">{preview.error}</span>
              ) : (
                <>
                  {preview ? (
                    <>
                      <span className="font-semibold text-foreground">
                        {preview.count}
                      </span>{" "}
                      of {preview.total} contacts match
                    </>
                  ) : (
                    "Calculating…"
                  )}
                  {previewing && !hasProblems && (
                    <Loader2
                      className="size-3.5 animate-spin"
                      aria-label="Recalculating"
                    />
                  )}
                </>
              )}
            </p>
          </div>
          <Users className="size-5 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {preview && !preview.error && preview.count > 0 ? (
            <>
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>Stage</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.sample.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {c.email ?? "—"}
                        </TableCell>
                        <TableCell>{c.company ?? "—"}</TableCell>
                        <TableCell>
                          <LifecycleBadge stage={c.stage as LifecycleStage} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {preview.count > preview.sample.length && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Showing first {preview.sample.length} of {preview.count} matches.
                </p>
              )}
            </>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {hasProblems
                ? ""
                : preview && !preview.error
                  ? "No contacts match yet — adjust the filter above."
                  : ""}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3">
        {(state.error || (submitted && hasProblems)) && (
          <span className="text-sm text-destructive">
            {state.error ?? "Finish configuring every condition."}
          </span>
        )}
        <Button type="submit" disabled={pending || !name.trim()}>
          {pending ? "Saving…" : segment ? "Save segment" : "Create segment"}
        </Button>
      </div>
    </form>
  );
}
