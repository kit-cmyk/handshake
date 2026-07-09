"use client";

import * as React from "react";
import { useActionState, useTransition } from "react";
import Papa from "papaparse";
import {
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Clock,
  Eye,
  Send,
  ChevronDown,
  AlertCircle,
  CheckCircle2,
  GripVertical,
  Monitor,
  Smartphone,
  Check,
  Users,
  UploadCloud,
  Search,
  ArrowRight,
  ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RichEmailEditor } from "@/components/rich-email-editor";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  renderTemplate,
  SAMPLE_MERGE,
  MERGE_TOKEN_GROUPS,
} from "@/lib/email/template";
import {
  LIFECYCLE_STAGES,
  LIFECYCLE_LABELS,
  type CampaignAudienceMode,
  type LifecycleStage,
} from "@/lib/types";
import { LifecycleBadge } from "@/components/lifecycle-badge";
import { DateTimePicker } from "@/components/ui/date-picker";
import { saveCampaign, sendTestEmail, type CampaignState } from "./actions";
import { CONTACT_FIELDS, validateRow, type MappedRow } from "../import/fields";
import { runImport, type ImportResult } from "../import/actions";
import { DataHealthCallout } from "@/components/data-health-callout";
import { cn } from "@/lib/utils";
import type { Campaign, CampaignStep } from "@/lib/types";

type Option = { id: string; name: string };
type SegmentOption = Option & { type?: "static" | "dynamic"; count?: number };
type ContactOption = {
  id: string;
  name: string;
  email: string;
  company: string | null;
  stage: LifecycleStage;
};
type Unit = "minutes" | "hours" | "days";
type Device = "desktop" | "mobile";
type ReplyRule = "inherit" | "stop" | "continue";
type SendMode = "immediate" | "scheduled" | "delay";
type StepDraft = {
  uid: string;
  id: string | null;
  subject: string;
  body: string;
  waitAmount: number;
  waitUnit: Unit;
  replyRule: ReplyRule;
};
const NONE = "none";
const SKIP = "__skip__";

const WIZARD_STEPS = [
  { n: 1, label: "Campaign" },
  { n: 2, label: "Audience" },
  { n: 3, label: "Sequence" },
  { n: 4, label: "Schedule" },
  { n: 5, label: "Review" },
] as const;

function toReplyRule(v: boolean | null | undefined): ReplyRule {
  return v === true ? "stop" : v === false ? "continue" : "inherit";
}
function replyRuleToValue(r: ReplyRule): boolean | null {
  return r === "stop" ? true : r === "continue" ? false : null;
}
function newUid() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}
function stripHtml(html: string): string {
  if (typeof document === "undefined") return html.replace(/<[^>]*>/g, "").trim();
  const el = document.createElement("div");
  el.innerHTML = html;
  return (el.textContent ?? "").trim();
}
function minutesToParts(minutes: number): { amount: number; unit: Unit } {
  if (minutes > 0 && minutes % 1440 === 0)
    return { amount: minutes / 1440, unit: "days" };
  if (minutes > 0 && minutes % 60 === 0)
    return { amount: minutes / 60, unit: "hours" };
  return { amount: minutes, unit: "minutes" };
}
function partsToMinutes(amount: number, unit: Unit): number {
  const a = Math.max(0, amount);
  return unit === "days" ? a * 1440 : unit === "hours" ? a * 60 : a;
}
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
function formatWait(amount: number, unit: Unit): string {
  if (amount <= 0) return "immediately";
  return `${amount} ${amount === 1 ? unit.slice(0, -1) : unit}`;
}
function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function CampaignWizard({
  campaign,
  steps: initialSteps,
  segments,
  mailboxes,
  contacts,
  initialContactIds,
  defaultTestEmail,
}: {
  campaign?: Campaign;
  steps?: CampaignStep[];
  segments: SegmentOption[];
  mailboxes: Option[];
  contacts: ContactOption[];
  initialContactIds?: string[];
  defaultTestEmail?: string | null;
}) {
  const [state, formAction, pending] = useActionState<CampaignState, FormData>(
    saveCampaign,
    {}
  );

  const [step, setStep] = React.useState(1);

  // ---- Step 1: campaign + sender -------------------------------------------
  const [name, setName] = React.useState(campaign?.name ?? "");
  const [mailboxId, setMailboxId] = React.useState(campaign?.mailbox_id ?? NONE);

  // ---- Step 2: audience -----------------------------------------------------
  const [audienceMode, setAudienceMode] = React.useState<CampaignAudienceMode>(
    campaign?.audience_mode ?? "segment"
  );
  const [segmentId, setSegmentId] = React.useState(
    campaign?.audience_mode === "segment" || !campaign
      ? campaign?.segment_id ?? NONE
      : NONE
  );
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(
    new Set(initialContactIds ?? [])
  );
  const [contactSearch, setContactSearch] = React.useState("");

  // Advanced audience options.
  const [excludeId, setExcludeId] = React.useState(
    campaign?.exclude_segment_id ?? NONE
  );
  const [stopOnReply, setStopOnReply] = React.useState(
    campaign?.stop_on_reply ?? true
  );

  // ---- Step 3: sequence -----------------------------------------------------
  const [steps, setSteps] = React.useState<StepDraft[]>(
    initialSteps?.length
      ? initialSteps.map((s) => {
          const p = minutesToParts(s.wait_minutes);
          return {
            uid: newUid(),
            id: s.id,
            subject: s.subject ?? "",
            body: s.body ?? "",
            waitAmount: p.amount,
            waitUnit: p.unit,
            replyRule: toReplyRule(s.stop_on_reply),
          };
        })
      : [
          {
            uid: newUid(),
            id: null,
            subject: "",
            body: "",
            waitAmount: 0,
            waitUnit: "minutes",
            replyRule: "inherit",
          },
        ]
  );
  const [testEmail, setTestEmail] = React.useState(defaultTestEmail ?? "");
  const [preview, setPreview] = React.useState<Set<string>>(new Set());
  const [device, setDevice] = React.useState<Device>("desktop");
  const [testMsg, setTestMsg] = React.useState<{
    uid: string;
    text: string;
    ok: boolean;
  } | null>(null);
  const [testing, startTest] = useTransition();
  const [dragUid, setDragUid] = React.useState<string | null>(null);

  // ---- Step 4: review side sheet -------------------------------------------
  const [reviewStep, setReviewStep] = React.useState<StepDraft | null>(null);

  // ---- Step 5: sending time -------------------------------------------------
  const [sendMode, setSendMode] = React.useState<SendMode>(
    campaign?.scheduled_at
      ? "scheduled"
      : (campaign?.send_delay_minutes ?? 0) > 0
        ? "delay"
        : "immediate"
  );
  const [scheduledAt, setScheduledAt] = React.useState(
    toLocalInput(campaign?.scheduled_at ?? null)
  );
  const delayInit = minutesToParts(campaign?.send_delay_minutes ?? 0);
  const [delayAmount, setDelayAmount] = React.useState(
    delayInit.amount > 0 ? delayInit.amount : 1
  );
  const [delayUnit, setDelayUnit] = React.useState<Unit>(
    delayInit.amount > 0 ? delayInit.unit : "days"
  );

  const tzLabel = Intl.DateTimeFormat().resolvedOptions().timeZone;

  // ---- Sequence helpers -----------------------------------------------------
  function updateStep(uid: string, patch: Partial<StepDraft>) {
    setSteps((ss) => ss.map((s) => (s.uid === uid ? { ...s, ...patch } : s)));
  }
  function addStep() {
    setSteps((ss) => [
      ...ss,
      {
        uid: newUid(),
        id: null,
        subject: "",
        body: "",
        waitAmount: 1,
        waitUnit: "days",
        replyRule: "inherit",
      },
    ]);
  }
  function removeStep(uid: string) {
    setSteps((ss) => ss.filter((s) => s.uid !== uid));
  }
  function move(i: number, dir: -1 | 1) {
    setSteps((ss) => {
      const j = i + dir;
      if (j < 0 || j >= ss.length) return ss;
      const next = [...ss];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }
  function reorder(fromUid: string, toUid: string) {
    if (fromUid === toUid) return;
    setSteps((ss) => {
      const from = ss.findIndex((s) => s.uid === fromUid);
      const to = ss.findIndex((s) => s.uid === toUid);
      if (from === -1 || to === -1) return ss;
      const next = [...ss];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }
  function togglePreview(uid: string) {
    setPreview((p) => {
      const n = new Set(p);
      if (n.has(uid)) n.delete(uid);
      else n.add(uid);
      return n;
    });
  }
  function insertToken(uid: string, token: string) {
    setSteps((ss) =>
      ss.map((s) =>
        s.uid === uid ? { ...s, subject: `${s.subject}{{${token}}}` } : s
      )
    );
  }
  function runTest(s: StepDraft) {
    setTestMsg(null);
    startTest(async () => {
      const res = await sendTestEmail({
        subject: s.subject,
        body: s.body,
        toEmail: testEmail,
        mailboxId: mailboxId === NONE ? null : mailboxId,
      });
      setTestMsg({
        uid: s.uid,
        text: res.error ?? `Test sent to ${testEmail}.`,
        ok: !res.error,
      });
    });
  }

  // ---- Derived --------------------------------------------------------------
  const selectedSegment = segments.find((s) => s.id === segmentId);
  const selectedMailbox = mailboxes.find((m) => m.id === mailboxId);
  const stepValidFlags = steps.map(
    (s) => !!s.subject.trim() && !!stripHtml(s.body)
  );
  const allStepsValid = stepValidFlags.every(Boolean);

  const audienceCount =
    audienceMode === "segment"
      ? selectedSegment?.count ?? 0
      : selectedIds.size;

  const serializedSteps = steps.map((s) => ({
    id: s.id,
    subject: s.subject,
    body: s.body,
    wait_minutes: partsToMinutes(s.waitAmount, s.waitUnit),
    stop_on_reply: replyRuleToValue(s.replyRule),
  }));

  const stepComplete = (n: number): boolean => {
    switch (n) {
      case 1:
        return !!name.trim();
      case 2:
        return audienceMode === "segment"
          ? segmentId !== NONE
          : selectedIds.size > 0;
      case 3:
        return allStepsValid;
      case 4:
        return sendMode !== "scheduled" || !!scheduledAt;
      case 5:
        return true;
      default:
        return false;
    }
  };
  const priorComplete = (n: number) =>
    WIZARD_STEPS.slice(0, n - 1).every((s) => stepComplete(s.n));
  const canSubmit =
    !pending && [1, 2, 3, 4].every((n) => stepComplete(n));
  // New campaigns and existing drafts can be saved half-finished; live
  // campaigns must go through the full flow. Saving requires only a name.
  const isDraft = !campaign || campaign.status === "draft";

  function goNext() {
    if (step < 5 && stepComplete(step) && priorComplete(step + 1))
      setStep(step + 1);
  }
  function goBack() {
    if (step > 1) setStep(step - 1);
  }

  // Hidden-input values.
  const audienceSegmentValue =
    audienceMode === "segment" && segmentId !== NONE ? segmentId : "";
  const contactIdsValue =
    audienceMode === "segment" ? "[]" : JSON.stringify([...selectedIds]);
  const scheduledValue = sendMode === "scheduled" ? scheduledAt : "";
  const sendDelayValue =
    sendMode === "delay" ? partsToMinutes(delayAmount, delayUnit) : 0;

  return (
    <form
      action={formAction}
      className="space-y-6"
      onKeyDown={(e) => {
        // Enter in a single-line field shouldn't submit mid-wizard.
        const el = e.target as HTMLElement;
        if (e.key === "Enter" && el.tagName === "INPUT" && step !== 5)
          e.preventDefault();
      }}
    >
      {campaign && <input type="hidden" name="id" value={campaign.id} />}
      <input type="hidden" name="name" value={name} />
      <input type="hidden" name="mailbox_id" value={mailboxId === NONE ? "" : mailboxId} />
      <input type="hidden" name="audience_mode" value={audienceMode} />
      <input type="hidden" name="segment_id" value={audienceSegmentValue} />
      <input type="hidden" name="contact_ids" value={contactIdsValue} />
      <input type="hidden" name="exclude_segment_id" value={excludeId === NONE ? "" : excludeId} />
      <input type="hidden" name="stop_on_reply" value={stopOnReply ? "1" : "0"} />
      <input type="hidden" name="scheduled_at" value={scheduledValue} />
      <input type="hidden" name="send_delay_minutes" value={sendDelayValue} />
      <input type="hidden" name="steps" value={JSON.stringify(serializedSteps)} />

      {/* Step indicator */}
      <ol className="flex flex-wrap items-center gap-2">
        {WIZARD_STEPS.map((s, i) => {
          const done = stepComplete(s.n) && s.n < step;
          const active = s.n === step;
          const reachable = s.n === 1 || priorComplete(s.n);
          return (
            <li key={s.n} className="flex items-center gap-2">
              <button
                type="button"
                disabled={!reachable}
                onClick={() => reachable && setStep(s.n)}
                className={cn(
                  "flex items-center gap-2 rounded-full px-3 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : reachable
                      ? "text-foreground hover:bg-muted"
                      : "cursor-not-allowed text-muted-foreground"
                )}
              >
                <span
                  className={cn(
                    "flex size-5 items-center justify-center rounded-full border text-xs",
                    active
                      ? "border-primary-foreground"
                      : done
                        ? "border-green-600 bg-green-600 text-white"
                        : "border-muted-foreground/40"
                  )}
                >
                  {done ? <Check className="size-3" /> : s.n}
                </span>
                {s.label}
              </button>
              {i < WIZARD_STEPS.length - 1 && (
                <span className="text-muted-foreground/40">/</span>
              )}
            </li>
          );
        })}
      </ol>

      {/* ---- Step 1: Campaign + sender ------------------------------------ */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Campaign details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name-input">Campaign name</Label>
              <Input
                id="name-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Q3 dentists outreach"
              />
            </div>
            <div className="space-y-2">
              <Label>Send from</Label>
              <Select value={mailboxId} onValueChange={setMailboxId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a mailbox" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Default sender</SelectItem>
                  {mailboxes.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {selectedMailbox
                  ? `Sender name and email come from "${selectedMailbox.name}".`
                  : "The default sender has no daily send cap. Choose a mailbox to throttle large sends and protect deliverability."}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ---- Step 2: Audience --------------------------------------------- */}
      {step === 2 && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Who should this go to?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                {(
                  [
                    { key: "segment", title: "Choose a segment", desc: "Target an existing segment." },
                    { key: "contacts", title: "Select contacts", desc: "Hand-pick from your CRM." },
                    { key: "import", title: "Import via CSV", desc: "Upload and enroll a list." },
                  ] as { key: CampaignAudienceMode; title: string; desc: string }[]
                ).map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setAudienceMode(opt.key)}
                    className={cn(
                      "rounded-lg border p-4 text-left transition-colors",
                      audienceMode === opt.key
                        ? "border-primary bg-primary/5"
                        : "hover:bg-muted/40"
                    )}
                  >
                    <p className="text-sm font-semibold">{opt.title}</p>
                    <p className="text-xs text-muted-foreground">{opt.desc}</p>
                  </button>
                ))}
              </div>

              {audienceMode === "segment" && (
                <div className="space-y-2">
                  <Label>Segment</Label>
                  <Select value={segmentId} onValueChange={setSegmentId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a segment" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>No segment</SelectItem>
                      {segments.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                          {s.type ? ` · ${s.type}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedSegment && (
                    <p className="text-xs text-muted-foreground">
                      {selectedSegment.count ?? 0} contact
                      {(selectedSegment.count ?? 0) === 1 ? "" : "s"} in this
                      segment.
                    </p>
                  )}
                </div>
              )}

              {audienceMode === "contacts" && (
                <ContactPicker
                  contacts={contacts}
                  selectedIds={selectedIds}
                  setSelectedIds={setSelectedIds}
                  search={contactSearch}
                  setSearch={setContactSearch}
                />
              )}

              {audienceMode === "import" && (
                <CsvAudience
                  selectedIds={selectedIds}
                  setSelectedIds={setSelectedIds}
                />
              )}
            </CardContent>
          </Card>

          <details className="rounded-lg border px-4 py-3">
            <summary className="cursor-pointer text-sm font-medium">
              Advanced options
            </summary>
            <div className="mt-4 space-y-4">
              <div className="space-y-2">
                <Label>Exclude segment</Label>
                <Select value={excludeId} onValueChange={setExcludeId}>
                  <SelectTrigger className="sm:w-72">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>None</SelectItem>
                    {segments.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4"
                  checked={stopOnReply}
                  onChange={(e) => setStopOnReply(e.target.checked)}
                />
                <span>
                  <span className="font-medium">Stop on reply</span>
                  <span className="block text-muted-foreground">
                    End a contact’s sequence as soon as they reply.
                  </span>
                </span>
              </label>
            </div>
          </details>
        </div>
      )}

      {/* ---- Step 3: Sequence --------------------------------------------- */}
      {step === 3 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
            <CardTitle className="text-base">Sequence</CardTitle>
            <div className="flex items-center gap-2">
              <Label htmlFor="test-email" className="text-xs text-muted-foreground">
                Test to
              </Label>
              <Input
                id="test-email"
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="you@example.com"
                className="h-8 w-44"
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {steps.map((s, i) => {
              const isPreview = preview.has(s.uid);
              const invalid = !stepValidFlags[i];
              return (
                <div
                  key={s.uid}
                  className={cn(
                    "rounded-lg border p-4",
                    dragUid === s.uid && "opacity-50"
                  )}
                  onDragOver={(e) => {
                    if (dragUid) e.preventDefault();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragUid) reorder(dragUid, s.uid);
                    setDragUid(null);
                  }}
                >
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        draggable
                        onDragStart={() => setDragUid(s.uid)}
                        onDragEnd={() => setDragUid(null)}
                        className="cursor-grab text-muted-foreground active:cursor-grabbing"
                        aria-label="Drag to reorder"
                        title="Drag to reorder"
                      >
                        <GripVertical className="size-4" />
                      </span>
                      <span className="text-sm font-semibold">Step {i + 1}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button type="button" variant="ghost" size="icon" className="size-7" onClick={() => move(i, -1)} disabled={i === 0}>
                        <ArrowUp className="size-4" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="size-7" onClick={() => move(i, 1)} disabled={i === steps.length - 1}>
                        <ArrowDown className="size-4" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="size-7" onClick={() => removeStep(s.uid)} disabled={steps.length === 1}>
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <Clock className="size-4 text-muted-foreground" />
                    {i === 0 ? (
                      <span className="text-sm text-muted-foreground">
                        Send immediately on enrollment
                      </span>
                    ) : (
                      <>
                        <span className="text-sm text-muted-foreground">Wait</span>
                        <Input
                          type="number"
                          className="w-20"
                          value={s.waitAmount}
                          min={0}
                          onChange={(e) =>
                            updateStep(s.uid, {
                              waitAmount: Math.max(0, Number(e.target.value) || 0),
                            })
                          }
                        />
                        <Select
                          value={s.waitUnit}
                          onValueChange={(v) => updateStep(s.uid, { waitUnit: v as Unit })}
                        >
                          <SelectTrigger className="h-9 w-28">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="minutes">minutes</SelectItem>
                            <SelectItem value="hours">hours</SelectItem>
                            <SelectItem value="days">days</SelectItem>
                          </SelectContent>
                        </Select>
                        <span className="text-sm text-muted-foreground">after previous step</span>
                      </>
                    )}
                  </div>

                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className="text-sm text-muted-foreground">On reply</span>
                    <Select
                      value={s.replyRule}
                      onValueChange={(v) => updateStep(s.uid, { replyRule: v as ReplyRule })}
                    >
                      <SelectTrigger className="h-9 w-56">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="inherit">
                          Use campaign default{stopOnReply ? " (stop)" : " (keep sending)"}
                        </SelectItem>
                        <SelectItem value="stop">Stop the sequence</SelectItem>
                        <SelectItem value="continue">Keep sending</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {isPreview ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-end gap-1">
                        <Button type="button" variant={device === "desktop" ? "secondary" : "ghost"} size="sm" onClick={() => setDevice("desktop")}>
                          <Monitor className="size-4" /> Desktop
                        </Button>
                        <Button type="button" variant={device === "mobile" ? "secondary" : "ghost"} size="sm" onClick={() => setDevice("mobile")}>
                          <Smartphone className="size-4" /> Mobile
                        </Button>
                      </div>
                      <div className="mx-auto rounded-md border bg-background shadow-sm transition-all" style={{ maxWidth: device === "mobile" ? 390 : 640 }}>
                        <div className="border-b px-3 py-2 text-sm">
                          <span className="text-muted-foreground">Subject: </span>
                          <span className="font-medium">
                            {renderTemplate(s.subject, SAMPLE_MERGE) || "(no subject)"}
                          </span>
                        </div>
                        <div
                          className="prose prose-sm max-w-none px-3 py-3"
                          dangerouslySetInnerHTML={{
                            __html: renderTemplate(s.body, SAMPLE_MERGE) || "<p class='text-muted-foreground'>(empty body)</p>",
                          }}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Input
                          placeholder="Subject line"
                          value={s.subject}
                          onChange={(e) => updateStep(s.uid, { subject: e.target.value })}
                          className={invalid && !s.subject.trim() ? "border-destructive" : ""}
                        />
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button type="button" variant="outline" size="sm">
                              Insert field <ChevronDown className="size-3" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {MERGE_TOKEN_GROUPS.map((g, gi) => (
                              <React.Fragment key={g.group}>
                                {gi > 0 && <DropdownMenuSeparator />}
                                <DropdownMenuLabel>{g.group}</DropdownMenuLabel>
                                {g.tokens.map((t) => (
                                  <DropdownMenuItem key={t.token} onClick={() => insertToken(s.uid, t.token)}>
                                    {t.label}
                                    <span className="ml-1 text-muted-foreground">{`{{${t.token}}}`}</span>
                                  </DropdownMenuItem>
                                ))}
                              </React.Fragment>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      <RichEmailEditor value={s.body} onChange={(html) => updateStep(s.uid, { body: html })} />
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <Button type="button" variant="ghost" size="sm" onClick={() => togglePreview(s.uid)}>
                      <Eye className="size-4" /> {isPreview ? "Edit" : "Preview"}
                    </Button>
                    <Button type="button" variant="ghost" size="sm" disabled={testing || !testEmail.trim() || invalid} onClick={() => runTest(s)}>
                      <Send className="size-4" /> Send test
                    </Button>
                    {invalid && (
                      <span className="inline-flex items-center gap-1 text-xs text-destructive">
                        <AlertCircle className="size-3" /> Needs a subject and body
                      </span>
                    )}
                    {testMsg?.uid === s.uid && (
                      <span className={`inline-flex items-center gap-1 text-xs ${testMsg.ok ? "text-green-600" : "text-destructive"}`}>
                        {testMsg.ok ? <CheckCircle2 className="size-3" /> : <AlertCircle className="size-3" />}
                        {testMsg.text}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
            <Button type="button" variant="outline" size="sm" onClick={addStep}>
              <Plus className="size-4" /> Add step
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ---- Step 5: Review ----------------------------------------------- */}
      {step === 5 && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Review campaign</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <SummaryRow label="Name" value={name || "—"} />
              <SummaryRow
                label="Send from"
                value={selectedMailbox?.name ?? "Default sender"}
              />
              <SummaryRow
                label="Audience"
                value={
                  audienceMode === "segment"
                    ? `Segment: ${selectedSegment?.name ?? "none"} (${audienceCount})`
                    : `${audienceCount} ${audienceMode === "import" ? "imported" : "selected"} contact${audienceCount === 1 ? "" : "s"}`
                }
              />
              <SummaryRow
                label="Stop on reply"
                value={stopOnReply ? "Yes" : "No"}
              />
              <SummaryRow
                label="Sending"
                value={
                  sendMode === "immediate"
                    ? "Immediately on enrollment"
                    : sendMode === "scheduled"
                      ? scheduledAt
                        ? `Scheduled for ${new Date(scheduledAt).toLocaleString()}`
                        : "Scheduled (no time set)"
                      : `${formatWait(delayAmount, delayUnit)} after enrollment`
                }
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Sequence · {steps.length} email{steps.length === 1 ? "" : "s"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-2">
                {steps.map((s, i) => (
                  <li
                    key={s.uid}
                    className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
                  >
                    <span className="min-w-0">
                      <span className="font-medium">Step {i + 1}</span>
                      {i > 0 && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          · waits {formatWait(s.waitAmount, s.waitUnit)}
                        </span>
                      )}
                      <span className="ml-2 truncate text-muted-foreground">
                        {renderTemplate(s.subject, SAMPLE_MERGE) || "(no subject)"}
                      </span>
                    </span>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setReviewStep(s)}>
                      <Eye className="size-4" /> Review email
                    </Button>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>

          <Sheet open={!!reviewStep} onOpenChange={(o) => !o && setReviewStep(null)}>
            <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
              <SheetHeader>
                <SheetTitle>Email preview</SheetTitle>
                <SheetDescription>
                  Rendered with sample data ({SAMPLE_MERGE.first_name} at{" "}
                  {SAMPLE_MERGE.company}).
                </SheetDescription>
              </SheetHeader>
              {reviewStep && (
                <div className="mt-4 rounded-md border">
                  <div className="border-b px-3 py-2 text-sm">
                    <span className="text-muted-foreground">Subject: </span>
                    <span className="font-medium">
                      {renderTemplate(reviewStep.subject, SAMPLE_MERGE) || "(no subject)"}
                    </span>
                  </div>
                  <div
                    className="prose prose-sm max-w-none px-3 py-3"
                    dangerouslySetInnerHTML={{
                      __html: renderTemplate(reviewStep.body, SAMPLE_MERGE) || "<p>(empty body)</p>",
                    }}
                  />
                </div>
              )}
            </SheetContent>
          </Sheet>
        </div>
      )}

      {/* ---- Step 4: Sending time ----------------------------------------- */}
      {step === 4 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">When should sending start?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {(
              [
                { key: "immediate", title: "Immediately", desc: "Send the first email as soon as a contact is enrolled." },
                { key: "scheduled", title: "Scheduled time", desc: "Hold the first email until a specific date and time." },
                { key: "delay", title: "After a delay", desc: "Wait a set time after each contact is enrolled." },
              ] as { key: SendMode; title: string; desc: string }[]
            ).map((opt) => (
              <label
                key={opt.key}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-lg border p-4",
                  sendMode === opt.key && "border-primary bg-primary/5"
                )}
              >
                <input
                  type="radio"
                  name="send_mode_radio"
                  className="mt-1 size-4"
                  checked={sendMode === opt.key}
                  onChange={() => setSendMode(opt.key)}
                />
                <div className="flex-1 space-y-2">
                  <div>
                    <p className="text-sm font-medium">{opt.title}</p>
                    <p className="text-xs text-muted-foreground">{opt.desc}</p>
                  </div>
                  {opt.key === "scheduled" && sendMode === "scheduled" && (
                    <div className="space-y-1">
                      <DateTimePicker
                        value={scheduledAt}
                        onChange={setScheduledAt}
                        className="w-64"
                      />
                      <p className="text-xs text-muted-foreground">
                        Times are in {tzLabel}. A time in the past sends immediately.
                      </p>
                    </div>
                  )}
                  {opt.key === "delay" && sendMode === "delay" && (
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={1}
                        value={delayAmount}
                        onChange={(e) => setDelayAmount(Math.max(0, Number(e.target.value) || 0))}
                        className="w-24"
                      />
                      <Select value={delayUnit} onValueChange={(v) => setDelayUnit(v as Unit)}>
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="minutes">minutes</SelectItem>
                          <SelectItem value="hours">hours</SelectItem>
                          <SelectItem value="days">days</SelectItem>
                        </SelectContent>
                      </Select>
                      <span className="text-sm text-muted-foreground">after enrollment</span>
                    </div>
                  )}
                </div>
              </label>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ---- Footer nav --------------------------------------------------- */}
      <div className="flex items-center justify-between gap-3">
        <Button type="button" variant="outline" onClick={goBack} disabled={step === 1}>
          <ArrowLeft className="size-4" /> Back
        </Button>
        <div className="flex items-center gap-3">
          {state.error && (
            <span className="text-sm text-destructive">{state.error}</span>
          )}
          {step < 5 ? (
            <>
              {isDraft && (
                <Button
                  type="submit"
                  variant="outline"
                  disabled={pending || !name.trim()}
                  title="Save your progress and finish this campaign later"
                >
                  {pending ? "Saving…" : "Save draft"}
                </Button>
              )}
              <Button type="button" onClick={goNext} disabled={!stepComplete(step)}>
                Next <ArrowRight className="size-4" />
              </Button>
            </>
          ) : (
            <Button type="submit" disabled={!canSubmit}>
              {pending ? "Saving…" : campaign ? "Save campaign" : "Create campaign"}
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b pb-2 last:border-0 last:pb-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

// ---- Step 2: contact picker -------------------------------------------------
function ContactPicker({
  contacts,
  selectedIds,
  setSelectedIds,
  search,
  setSearch,
}: {
  contacts: ContactOption[];
  selectedIds: Set<string>;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  search: string;
  setSearch: (v: string) => void;
}) {
  const [stage, setStage] = React.useState<LifecycleStage | "all">("all");
  const [company, setCompany] = React.useState<string>("all");

  const companies = React.useMemo(
    () =>
      [...new Set(contacts.map((c) => c.company).filter((x): x is string => !!x))].sort(
        (a, b) => a.localeCompare(b)
      ),
    [contacts]
  );

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return contacts.filter((c) => {
      if (stage !== "all" && c.stage !== stage) return false;
      if (company !== "all" && c.company !== company) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        (c.company ?? "").toLowerCase().includes(q)
      );
    });
  }, [contacts, search, stage, company]);

  const hasFilters = stage !== "all" || company !== "all" || !!search.trim();
  const allFilteredSelected =
    filtered.length > 0 && filtered.every((c) => selectedIds.has(c.id));

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function toggleAll() {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (allFilteredSelected) filtered.forEach((c) => n.delete(c.id));
      else filtered.forEach((c) => n.add(c.id));
      return n;
    });
  }

  if (!contacts.length)
    return (
      <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
        No contacts with an email address yet. Import some, or use the CSV
        option.
      </p>
    );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search contacts…"
            className="pl-8"
          />
        </div>
        <Select value={stage} onValueChange={(v) => setStage(v as LifecycleStage | "all")}>
          <SelectTrigger className="h-9 w-40">
            <SelectValue placeholder="All stages" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All stages</SelectItem>
            {LIFECYCLE_STAGES.map((s) => (
              <SelectItem key={s} value={s}>
                {LIFECYCLE_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {companies.length > 0 && (
          <Select value={company} onValueChange={setCompany}>
            <SelectTrigger className="h-9 w-48">
              <SelectValue placeholder="All companies" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All companies</SelectItem>
              {companies.map((co) => (
                <SelectItem key={co} value={co}>
                  {co}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Badge variant="secondary">
          <Users className="mr-1 size-3" /> {selectedIds.size} selected
        </Badge>
      </div>

      <div className="max-h-80 overflow-y-auto rounded-md border">
        <button
          type="button"
          onClick={toggleAll}
          disabled={filtered.length === 0}
          className="flex w-full items-center gap-3 border-b px-3 py-2 text-left text-sm hover:bg-muted/40 disabled:opacity-50"
        >
          <Checkbox checked={allFilteredSelected} />
          <span className="font-medium">
            {allFilteredSelected ? "Deselect" : "Select"} all
            {hasFilters ? " matching" : ""} ({filtered.length})
          </span>
        </button>
        {filtered.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => toggle(c.id)}
            className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted/40"
          >
            <Checkbox checked={selectedIds.has(c.id)} />
            <span className="min-w-0 flex-1">
              <span className="font-medium">{c.name}</span>
              <span className="ml-2 text-muted-foreground">{c.email}</span>
            </span>
            {c.company && (
              <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                {c.company}
              </span>
            )}
            <LifecycleBadge stage={c.stage} />
          </button>
        ))}
        {!filtered.length && (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            No contacts match these filters.
          </p>
        )}
      </div>
    </div>
  );
}

// ---- Step 2: CSV import audience -------------------------------------------
function CsvAudience({
  selectedIds,
  setSelectedIds,
}: {
  selectedIds: Set<string>;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
}) {
  const [phase, setPhase] = React.useState<"upload" | "map" | "done">("upload");
  const [filename, setFilename] = React.useState("");
  const [headers, setHeaders] = React.useState<string[]>([]);
  const [rows, setRows] = React.useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = React.useState<Record<string, string>>({});
  const [dedupe, setDedupe] = React.useState<"skip" | "update" | "create">("skip");
  const [parseError, setParseError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<ImportResult | null>(null);
  const [pending, startImport] = useTransition();

  function handleFile(file: File) {
    setParseError(null);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const cols = (res.meta.fields ?? []).filter(Boolean);
        if (!cols.length) {
          setParseError("No columns detected. Is the first row a header?");
          return;
        }
        const guess: Record<string, string> = {};
        for (const f of CONTACT_FIELDS) {
          const targets = [normalize(f.key), normalize(f.label)];
          const hit = cols.find((h) => targets.includes(normalize(h)));
          if (hit) guess[f.key] = hit;
        }
        setHeaders(cols);
        setRows(res.data.filter((r) => Object.keys(r).length > 0));
        setMapping(guess);
        setFilename(file.name);
        setPhase("map");
      },
      error: (err) => setParseError(err.message),
    });
  }

  const mappedRows = React.useMemo<MappedRow[]>(() => {
    const active = Object.entries(mapping).filter(([, h]) => h && h !== SKIP);
    return rows.map((row) => {
      const out: MappedRow = {};
      for (const [k, h] of active) out[k] = row[h] ?? "";
      return out;
    });
  }, [rows, mapping]);

  const validCount = React.useMemo(
    () => mappedRows.filter((r) => !validateRow("contacts", r)).length,
    [mappedRows]
  );

  function doImport() {
    startImport(async () => {
      const res = await runImport("contacts", mappedRows, {
        dedupe,
        source: "campaign-csv",
        filename,
      });
      setResult(res);
      if (res.ok) {
        setSelectedIds((prev) => {
          const n = new Set(prev);
          res.contactIds.forEach((id) => n.add(id));
          return n;
        });
        setPhase("done");
      }
    });
  }

  if (phase === "upload")
    return (
      <div className="space-y-3">
        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-10 text-center hover:bg-muted/40">
          <UploadCloud className="size-7 text-muted-foreground" />
          <span className="text-sm font-medium">Click to choose a CSV file</span>
          <span className="text-xs text-muted-foreground">First row must be column headers</span>
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
        </label>
        {parseError && <p className="text-sm text-destructive">{parseError}</p>}
      </div>
    );

  if (phase === "map")
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Map columns · {filename}</p>
          <button
            type="button"
            onClick={() => setPhase("upload")}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Choose a different file
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {CONTACT_FIELDS.map((f) => (
            <div key={f.key} className="flex items-center gap-3">
              <Label className="w-36 shrink-0 text-sm">
                {f.label}
                {f.hint && <span className="ml-1 text-xs text-muted-foreground">({f.hint})</span>}
              </Label>
              <Select
                value={mapping[f.key] ?? SKIP}
                onValueChange={(v) => setMapping((m) => ({ ...m, [f.key]: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="— skip —" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SKIP}>— skip —</SelectItem>
                  {headers.map((h) => (
                    <SelectItem key={h} value={h}>
                      {h}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3 border-t pt-4">
          <div className="space-y-2">
            <Label>On duplicate (email)</Label>
            <Select value={dedupe} onValueChange={(v) => setDedupe(v as typeof dedupe)}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="skip">Skip existing</SelectItem>
                <SelectItem value="update">Update existing</SelectItem>
                <SelectItem value="create">Create anyway</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="success">{validCount} valid</Badge>
            {mappedRows.length - validCount > 0 && (
              <Badge variant="destructive">{mappedRows.length - validCount} with errors</Badge>
            )}
            <Button type="button" onClick={doImport} disabled={pending || validCount === 0}>
              {pending ? "Importing…" : `Import & add ${validCount}`}
            </Button>
          </div>
        </div>
      </div>
    );

  // phase === "done"
  const r = result!;
  return (
    <div className="space-y-3">
      {r.error ? (
        <p className="text-sm text-destructive">{r.error}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <CheckCircle2 className="size-5 text-green-600" />
            <Badge variant="success">{r.created} created</Badge>
            <Badge variant="default">{r.updated} updated</Badge>
            <Badge variant="secondary">{r.skipped} skipped</Badge>
            {r.errored > 0 && <Badge variant="destructive">{r.errored} errored</Badge>}
            <span className="text-sm text-muted-foreground">
              · {selectedIds.size} added to audience
            </span>
          </div>
          <DataHealthCallout summary={r.issues} />
        </>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          setPhase("upload");
          setResult(null);
        }}
      >
        Import another file
      </Button>
    </div>
  );
}
