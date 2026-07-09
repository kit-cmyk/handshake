"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import {
  UploadCloud,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  CONTACT_FIELDS,
  validateRow,
  type FieldDef,
  type MappedRow,
  type DedupeMode,
} from "../import/fields";
import { importSegmentFromCsv, type SegmentImportResult } from "./actions";

const SKIP = "__skip__";

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Best-effort auto-map CSV headers to contact fields. */
function guessMapping(
  headers: string[],
  fields: FieldDef[],
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const f of fields) {
    const targets = [normalize(f.key), normalize(f.label)];
    const hit = headers.find((h) => targets.includes(normalize(h)));
    if (hit) map[f.key] = hit;
  }
  return map;
}

export function SegmentImportSheet({ trigger }: { trigger: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [step, setStep] = React.useState<"upload" | "map" | "result">("upload");
  const [name, setName] = React.useState("");
  const [filename, setFilename] = React.useState("");
  const [headers, setHeaders] = React.useState<string[]>([]);
  const [rawRows, setRawRows] = React.useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = React.useState<Record<string, string>>({});
  const [dedupe, setDedupe] = React.useState<DedupeMode>("skip");
  const [result, setResult] = React.useState<SegmentImportResult | null>(null);
  const [pending, setPending] = React.useState(false);
  const [parseError, setParseError] = React.useState<string | null>(null);

  function reset() {
    setStep("upload");
    setName("");
    setFilename("");
    setHeaders([]);
    setRawRows([]);
    setMapping({});
    setDedupe("skip");
    setResult(null);
    setParseError(null);
  }

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
        setMapping(guessMapping(cols, CONTACT_FIELDS));
        setFilename(file.name);
        if (!name.trim()) setName(file.name.replace(/\.csv$/i, ""));
        setStep("map");
      },
      error: (err) => setParseError(err.message),
    });
  }

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
      if (validateRow("contacts", r)) invalid++;
      else valid++;
    }
    return { valid, invalid };
  }, [mappedRows]);

  const mappedFieldKeys = CONTACT_FIELDS.map((f) => f.key).filter(
    (k) => mapping[k] && mapping[k] !== SKIP,
  );

  async function doImport() {
    setPending(true);
    try {
      const res = await importSegmentFromCsv(name, mappedRows, {
        dedupe,
        source: "csv",
        filename,
      });
      setResult(res);
      setStep("result");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Import a CSV as a segment</SheetTitle>
        </SheetHeader>

        {/* ---- Step: upload ------------------------------------------------ */}
        {step === "upload" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="seg-name">Segment name</Label>
              <Input
                id="seg-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Conference leads — 2026"
              />
            </div>

            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-12 text-center hover:bg-muted/40">
              <UploadCloud className="size-8 text-muted-foreground" />
              <span className="text-sm font-medium">Click to choose a CSV file</span>
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
            <p className="text-xs text-muted-foreground">
              Contacts are matched by email and created if new, then grouped into
              a static segment. You&apos;ll map columns and review before saving.
            </p>
            {parseError && (
              <p className="text-sm text-destructive">{parseError}</p>
            )}
          </div>
        )}

        {/* ---- Step: map --------------------------------------------------- */}
        {step === "map" && (
          <div className="space-y-4">
            <button
              onClick={reset}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-4" /> Choose a different file
            </button>

            <div className="space-y-2">
              <Label htmlFor="seg-name-2">Segment name</Label>
              <Input
                id="seg-name-2"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name this segment"
              />
            </div>

            <div>
              <p className="mb-2 text-sm font-medium">Map columns · {filename}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {CONTACT_FIELDS.map((f) => (
                  <div key={f.key} className="flex items-center gap-3">
                    <Label className="w-36 shrink-0 text-xs">
                      {f.label}
                      {f.hint && (
                        <span className="ml-1 text-muted-foreground">
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
            </div>

            <div className="flex items-end gap-4 border-t pt-4">
              <div className="space-y-2">
                <Label>On duplicate (email)</Label>
                <Select
                  value={dedupe}
                  onValueChange={(v) => setDedupe(v as DedupeMode)}
                >
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="skip">
                      Keep existing (add to segment)
                    </SelectItem>
                    <SelectItem value="update">Update existing</SelectItem>
                    <SelectItem value="create">Create anyway</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2 text-xs">
                <Badge variant="success">{validation.valid} valid</Badge>
                {validation.invalid > 0 && (
                  <Badge variant="destructive">
                    {validation.invalid} with errors
                  </Badge>
                )}
              </div>
            </div>

            {mappedFieldKeys.length > 0 && (
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {mappedFieldKeys.map((k) => (
                        <TableHead key={k}>
                          {CONTACT_FIELDS.find((f) => f.key === k)?.label}
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
                disabled={pending || !name.trim() || validation.valid === 0}
              >
                {pending
                  ? "Importing…"
                  : `Import ${validation.valid} contact${validation.valid === 1 ? "" : "s"}`}
              </Button>
            </div>
          </div>
        )}

        {/* ---- Step: result ------------------------------------------------ */}
        {step === "result" && result && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-base font-semibold">
              {result.error ? (
                <>
                  <AlertCircle className="size-5 text-destructive" /> Import failed
                </>
              ) : (
                <>
                  <CheckCircle2 className="size-5 text-green-600" /> Segment
                  created
                </>
              )}
            </div>

            {result.error ? (
              <p className="text-sm text-destructive">{result.error}</p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">
                    {result.memberCount}
                  </span>{" "}
                  contact{result.memberCount === 1 ? "" : "s"} added to the
                  segment.
                </p>
                {result.import && (
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="success">
                      {result.import.created} created
                    </Badge>
                    <Badge variant="default">
                      {result.import.updated} updated
                    </Badge>
                    <Badge variant="secondary">
                      {result.import.skipped} matched existing
                    </Badge>
                    {result.import.errored > 0 && (
                      <Badge variant="destructive">
                        {result.import.errored} errored
                      </Badge>
                    )}
                  </div>
                )}
              </>
            )}

            <div className="flex gap-2">
              <Button variant="outline" onClick={reset}>
                Import another
              </Button>
              {result.segmentId && (
                <Button asChild onClick={() => setOpen(false)}>
                  <Link href={`/segments/${result.segmentId}`}>
                    View segment
                  </Link>
                </Button>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
