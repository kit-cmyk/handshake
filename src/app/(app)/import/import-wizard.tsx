"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import {
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  FIELDS,
  validateRow,
  type Target,
  type FieldDef,
  type MappedRow,
  type DedupeMode,
} from "./fields";
import { runImport, type ImportResult } from "./actions";
import { DataHealthCallout } from "@/components/data-health-callout";

const SKIP = "__skip__";

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Example values for the downloadable template, keyed by field key.
const TEMPLATE_SAMPLE: Record<string, string> = {
  first_name: "Jane",
  last_name: "Doe",
  email: "jane@example.com",
  phone: "+1 555 010 1234",
  title: "Owner",
  company_name: "Acme Co",
  lifecycle_stage: "new",
  lead_source: "Referral",
  address: "123 Main St",
  address_line2: "Suite 200",
  postal_code: "62704",
  country: "United States",
  name: "Acme Co",
  industry: "Software",
  category: "SaaS",
  website: "https://acme.co",
  domain: "acme.co",
  city: "Springfield",
  region: "IL",
  employee_count: "50",
  annual_revenue: "5000000",
  linkedin_url: "https://linkedin.com/company/acme",
};

/** Build and download a CSV template (header labels + one example row). */
function downloadTemplate(target: Target) {
  const cols = FIELDS[target];
  const csv = Papa.unparse({
    fields: cols.map((f) => f.label),
    data: [cols.map((f) => TEMPLATE_SAMPLE[f.key] ?? "")],
  });
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${target}-import-template.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Best-effort auto-map CSV headers to target fields. */
function guessMapping(
  headers: string[],
  fields: FieldDef[]
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const f of fields) {
    const targets = [normalize(f.key), normalize(f.label)];
    const hit = headers.find((h) => targets.includes(normalize(h)));
    if (hit) map[f.key] = hit;
  }
  return map;
}

export function ImportWizard() {
  const router = useRouter();
  const [step, setStep] = React.useState<"upload" | "map" | "result">("upload");
  const [target, setTarget] = React.useState<Target>("contacts");
  const [filename, setFilename] = React.useState("");
  const [headers, setHeaders] = React.useState<string[]>([]);
  const [rawRows, setRawRows] = React.useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = React.useState<Record<string, string>>({});
  const [dedupe, setDedupe] = React.useState<DedupeMode>("skip");
  const [source, setSource] = React.useState("csv");
  const [result, setResult] = React.useState<ImportResult | null>(null);
  const [pending, setPending] = React.useState(false);
  const [parseError, setParseError] = React.useState<string | null>(null);

  const fields = FIELDS[target];

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
        setHeaders(cols);
        setRawRows(res.data.filter((r) => Object.keys(r).length > 0));
        setMapping(guessMapping(cols, FIELDS[target]));
        setFilename(file.name);
        setStep("map");
      },
      error: (err) => setParseError(err.message),
    });
  }

  // Map raw rows → field-keyed rows using the current mapping.
  const mappedRows = React.useMemo<MappedRow[]>(() => {
    const active = Object.entries(mapping).filter(([, h]) => h && h !== SKIP);
    return rawRows.map((row) => {
      const out: MappedRow = {};
      for (const [fieldKey, header] of active) out[fieldKey] = row[header] ?? "";
      return out;
    });
  }, [rawRows, mapping]);

  const validation = React.useMemo(() => {
    let valid = 0;
    let invalid = 0;
    for (const r of mappedRows) {
      if (validateRow(target, r)) invalid++;
      else valid++;
    }
    return { valid, invalid };
  }, [mappedRows, target]);

  const requiredMissing = fields
    .filter((f) => f.required && (!mapping[f.key] || mapping[f.key] === SKIP))
    .map((f) => f.label);

  const mappedFieldKeys = fields
    .map((f) => f.key)
    .filter((k) => mapping[k] && mapping[k] !== SKIP);

  async function doImport() {
    setPending(true);
    try {
      const res = await runImport(target, mappedRows, {
        dedupe,
        source,
        filename,
      });
      setResult(res);
      setStep("result");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  function reset() {
    setStep("upload");
    setHeaders([]);
    setRawRows([]);
    setMapping({});
    setResult(null);
    setFilename("");
  }

  // ---- Step: upload ----------------------------------------------------------
  if (step === "upload") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upload a CSV</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="max-w-xs flex-1 space-y-2">
              <Label>Import into</Label>
              <Select
                value={target}
                onValueChange={(v) => setTarget(v as Target)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="contacts">Contacts</SelectItem>
                  <SelectItem value="companies">Companies</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => downloadTemplate(target)}
            >
              <Download className="size-4" /> Download template
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Not sure how to format your file? Download the {target} template,
            fill it in, and upload it below. You&apos;ll map columns and review
            data-quality issues before anything is saved.
          </p>

          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-12 text-center hover:bg-muted/40">
            <UploadCloud className="size-8 text-muted-foreground" />
            <span className="text-sm font-medium">
              Click to choose a CSV file
            </span>
            <span className="text-xs text-muted-foreground">
              First row must be column headers
            </span>
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

          {parseError && (
            <p className="text-sm text-destructive">{parseError}</p>
          )}
        </CardContent>
      </Card>
    );
  }

  // ---- Step: map -------------------------------------------------------------
  if (step === "map") {
    return (
      <div className="space-y-4">
        <button
          onClick={reset}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Choose a different file
        </button>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Map columns · {filename}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {fields.map((f) => (
                <div key={f.key} className="flex items-center gap-3">
                  <Label className="w-40 shrink-0">
                    {f.label}
                    {f.required && <span className="text-destructive"> *</span>}
                    {f.hint && (
                      <span className="ml-1 text-xs text-muted-foreground">
                        ({f.hint})
                      </span>
                    )}
                  </Label>
                  <Select
                    value={mapping[f.key] ?? SKIP}
                    onValueChange={(v) =>
                      setMapping((m) => ({ ...m, [f.key]: v }))
                    }
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

            <div className="flex flex-wrap items-end gap-4 border-t pt-4">
              <div className="space-y-2">
                <Label>On duplicate ({target === "contacts" ? "email" : "domain"})</Label>
                <Select
                  value={dedupe}
                  onValueChange={(v) => setDedupe(v as DedupeMode)}
                >
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
              <div className="space-y-2">
                <Label htmlFor="source">Source label</Label>
                <Input
                  id="source"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  className="w-40"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle className="text-base">Preview</CardTitle>
            <div className="flex gap-2 text-xs">
              <Badge variant="success">{validation.valid} valid</Badge>
              {validation.invalid > 0 && (
                <Badge variant="destructive">
                  {validation.invalid} with errors
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {requiredMissing.length > 0 && (
              <p className="text-sm text-destructive">
                Map required field(s): {requiredMissing.join(", ")}
              </p>
            )}
            {mappedFieldKeys.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Map at least one column to preview.
              </p>
            ) : (
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {mappedFieldKeys.map((k) => (
                        <TableHead key={k}>
                          {fields.find((f) => f.key === k)?.label}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mappedRows.slice(0, 5).map((r, i) => (
                      <TableRow key={i}>
                        {mappedFieldKeys.map((k) => (
                          <TableCell key={k}>{r[k] || "—"}</TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {mappedRows.length} rows in file
              </p>
              <Button
                onClick={doImport}
                disabled={
                  pending ||
                  requiredMissing.length > 0 ||
                  validation.valid === 0
                }
              >
                {pending
                  ? "Importing…"
                  : `Import ${validation.valid} row${validation.valid === 1 ? "" : "s"}`}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ---- Step: result ----------------------------------------------------------
  const r = result!;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {r.error ? (
            <>
              <AlertCircle className="size-5 text-destructive" /> Import failed
            </>
          ) : (
            <>
              <CheckCircle2 className="size-5 text-green-600" /> Import complete
            </>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {r.error ? (
          <p className="text-sm text-destructive">{r.error}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Badge variant="success">{r.created} created</Badge>
            <Badge variant="default">{r.updated} updated</Badge>
            <Badge variant="secondary">{r.skipped} skipped</Badge>
            {r.errored > 0 && (
              <Badge variant="destructive">{r.errored} errored</Badge>
            )}
          </div>
        )}

        {!r.error && <DataHealthCallout summary={r.issues} />}

        {r.errors.length > 0 && (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">Row</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {r.errors.slice(0, 50).map((e, i) => (
                  <TableRow key={i}>
                    <TableCell>{e.row || "—"}</TableCell>
                    <TableCell className="text-destructive">
                      {e.message}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="outline" onClick={reset}>
            Import another file
          </Button>
          <Button asChild>
            <Link href={`/${target}`}>View {target}</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
