"use client";

import * as React from "react";
import { useActionState } from "react";
import { Plus, X, Users } from "lucide-react";
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
  type PreviewContact,
} from "./actions";
import { LifecycleBadge } from "@/components/lifecycle-badge";
import type { LifecycleStage } from "@/lib/types";
import {
  SEGMENT_FIELDS,
  OPERATORS_FOR_KIND,
  OPERATOR_LABELS,
  VALUELESS_OPS,
  fieldDef,
  type Operator,
  type Rule,
  type SegmentDefinition,
  type SegmentType,
  type Segment,
} from "@/lib/segments";

export function SegmentBuilder({ segment }: { segment?: Segment }) {
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

  const definition: SegmentDefinition = React.useMemo(
    () => ({
      match,
      rules: rules.map((r) =>
        VALUELESS_OPS.includes(r.op) ? { field: r.field, op: r.op } : r
      ),
    }),
    [match, rules]
  );

  // Debounced live preview (count + a sample of matching contacts).
  const [preview, setPreview] = React.useState<{
    count: number;
    total: number;
    sample: PreviewContact[];
  } | null>(null);
  const [previewing, startPreview] = React.useTransition();
  const defJson = JSON.stringify(definition);
  React.useEffect(() => {
    const t = setTimeout(() => {
      startPreview(async () => {
        setPreview(await previewSegment(defJson));
      });
    }, 350);
    return () => clearTimeout(t);
  }, [defJson]);

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
  function onFieldChange(i: number, field: string) {
    const kind = fieldDef(field)?.kind ?? "text";
    updateRule(i, { field, op: OPERATORS_FOR_KIND[kind][0], value: "" });
  }

  return (
    <form action={formAction} className="space-y-6">
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

          <div className="space-y-2">
            {rules.map((rule, i) => {
              const def = fieldDef(rule.field);
              const kind = def?.kind ?? "text";
              const showValue = !VALUELESS_OPS.includes(rule.op);
              return (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <Select
                    value={rule.field}
                    onValueChange={(v) => onFieldChange(i, v)}
                  >
                    <SelectTrigger className="w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SEGMENT_FIELDS.map((f) => (
                        <SelectItem key={f.key} value={f.key}>
                          {f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={rule.op}
                    onValueChange={(v) =>
                      updateRule(i, {
                        op: v as Operator,
                        value: VALUELESS_OPS.includes(v as Operator)
                          ? undefined
                          : (rule.value ?? ""),
                      })
                    }
                  >
                    <SelectTrigger className="w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {OPERATORS_FOR_KIND[kind].map((op) => (
                        <SelectItem key={op} value={op}>
                          {OPERATOR_LABELS[op]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {showValue &&
                    (kind === "enum" ? (
                      <Select
                        value={rule.value ?? ""}
                        onValueChange={(v) => updateRule(i, { value: v })}
                      >
                        <SelectTrigger className="w-44">
                          <SelectValue placeholder="Select…" />
                        </SelectTrigger>
                        <SelectContent>
                          {(def?.options ?? []).map((o) => (
                            <SelectItem key={o} value={o}>
                              {o}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        className="w-44"
                        value={rule.value ?? ""}
                        onChange={(e) => updateRule(i, { value: e.target.value })}
                        placeholder="value"
                      />
                    ))}

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={() => removeRule(i)}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              );
            })}
          </div>

          <Button type="button" variant="outline" size="sm" onClick={addRule}>
            <Plus className="size-4" /> Add condition
          </Button>

          {rules.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No conditions — this segment will include all contacts.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Matching contacts</CardTitle>
            <p className="text-sm text-muted-foreground">
              {previewing && !preview ? (
                "Calculating…"
              ) : preview ? (
                <>
                  <span className="font-semibold text-foreground">
                    {preview.count}
                  </span>{" "}
                  of {preview.total} contacts match
                </>
              ) : (
                "Calculating…"
              )}
            </p>
          </div>
          <Users className="size-5 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {preview && preview.count > 0 ? (
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
              {preview ? "No contacts match yet — adjust the filter above." : ""}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3">
        {state.error && (
          <span className="text-sm text-destructive">{state.error}</span>
        )}
        <Button type="submit" disabled={pending || !name.trim()}>
          {pending ? "Saving…" : segment ? "Save segment" : "Create segment"}
        </Button>
      </div>
    </form>
  );
}
