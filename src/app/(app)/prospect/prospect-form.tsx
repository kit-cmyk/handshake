"use client";

import * as React from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useActionState, useTransition } from "react";
import {
  Search,
  Star,
  Globe,
  Phone,
  MapPin,
  Mail,
  List,
  Map as MapIcon,
  Building2,
  Plus,
  Check,
  TriangleAlert,
  Users,
  ExternalLink,
  Briefcase,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  searchLeads,
  importLeads,
  searchContacts,
  importContacts,
  type SearchState,
  type ImportState,
  type ContactSearchState,
  type ContactImportState,
} from "./actions";

// Leaflet touches `window`, so load the map client-only.
const ProspectMap = dynamic(() => import("./prospect-map"), {
  ssr: false,
  loading: () => (
    <div className="h-80 w-full animate-pulse rounded-lg border bg-muted/40" />
  ),
});

const RATING_OPTIONS = [
  { value: "0", label: "Any rating" },
  { value: "3", label: "3.0+" },
  { value: "3.5", label: "3.5+" },
  { value: "4", label: "4.0+" },
  { value: "4.5", label: "4.5+" },
];

type Mode = "companies" | "people";

export function ProspectForm() {
  const [mode, setMode] = React.useState<Mode>("companies");

  return (
    <div className="space-y-4">
      <div className="flex w-fit rounded-md border p-0.5">
        <ModeButton
          active={mode === "companies"}
          onClick={() => setMode("companies")}
          icon={Building2}
          label="Companies"
        />
        <ModeButton
          active={mode === "people"}
          onClick={() => setMode("people")}
          icon={Users}
          label="People"
        />
      </div>

      {mode === "companies" ? <CompanySearch /> : <PeopleSearch />}
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-sm font-medium ${
        active
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      <Icon className="size-4" /> {label}
    </button>
  );
}

// ---- Company search ---------------------------------------------------------

function CompanySearch() {
  const router = useRouter();
  const [state, formAction, searching] = useActionState<SearchState, FormData>(
    searchLeads,
    {}
  );
  const [useRadius, setUseRadius] = React.useState(true);
  const [view, setView] = React.useState<"list" | "map">("list");
  const [importing, startImport] = useTransition();

  const results = React.useMemo(() => state.results ?? [], [state.results]);
  const jobKey = state.jobId ?? "";
  const importable = results.filter((r) => !r.existing);

  // Selection is keyed by the search (jobId) so a new search resets to
  // "all importable selected" without needing a state-syncing effect.
  const [sel, setSel] = React.useState<{ key: string; ids: Set<string> }>({
    key: "__none__",
    ids: new Set(),
  });
  const selectedIds =
    sel.key === jobKey ? sel.ids : new Set(importable.map((r) => r.placeId));

  // Import result, also keyed to the current search so it clears on re-search.
  const [imp, setImp] = React.useState<{ key: string; res: ImportState }>({
    key: "__none__",
    res: {},
  });
  const importResult = imp.key === jobKey ? imp.res : null;

  React.useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  function toggle(id: string) {
    const ids = new Set(selectedIds);
    if (ids.has(id)) ids.delete(id);
    else ids.add(id);
    setSel({ key: jobKey, ids });
  }

  function toggleAll() {
    const allSelected = importable.every((r) => selectedIds.has(r.placeId));
    setSel({
      key: jobKey,
      ids: allSelected ? new Set() : new Set(importable.map((r) => r.placeId)),
    });
  }

  function doImport() {
    const chosen = results.filter((r) => selectedIds.has(r.placeId));
    if (!chosen.length) return;
    startImport(async () => {
      const res = await importLeads(state.jobId ?? null, chosen);
      setImp({ key: jobKey, res });
      router.refresh();
    });
  }

  const mapHits = results
    .filter((r) => r.lat != null && r.lng != null)
    .map((r) => ({
      name: r.name,
      rating: r.rating,
      address: r.address,
      lat: r.lat as number,
      lng: r.lng as number,
    }));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Find local businesses by conditions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="category">Industry / category</Label>
                <Input
                  id="category"
                  name="category"
                  placeholder="e.g. Dentist, Plumber, Law firm"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="location">Location</Label>
                <Input
                  id="location"
                  name="location"
                  placeholder="e.g. Austin, TX"
                  required
                />
              </div>
            </div>

            {/* Conditions */}
            <div className="grid gap-4 rounded-lg border bg-muted/30 p-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    name="use_radius"
                    checked={useRadius}
                    onChange={(e) => setUseRadius(e.target.checked)}
                  />
                  <MapPin className="size-4" /> Search within radius
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    id="radius_km"
                    name="radius_km"
                    type="number"
                    defaultValue={10}
                    min={1}
                    max={100}
                    disabled={!useRadius}
                    className="w-24"
                  />
                  <span className="text-sm text-muted-foreground">km radius</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="min_rating" className="flex items-center gap-1">
                  <Star className="size-4" /> Minimum rating
                </Label>
                <select
                  id="min_rating"
                  name="min_rating"
                  defaultValue="0"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {RATING_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2 sm:col-span-2">
                <span className="text-sm font-medium">Must have</span>
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="has_website" />
                    <Globe className="size-4" /> Website
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="has_phone" />
                    <Phone className="size-4" /> Phone
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="has_email" />
                    <Mail className="size-4" /> Email
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="open_now" />
                    Open now
                  </label>
                </div>
                <p className="text-xs text-muted-foreground">
                  Email isn&apos;t in Google&apos;s data — we visit each site to
                  find one, so this filter makes the search slower.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-2">
                <Label htmlFor="limit">Max results</Label>
                <Input
                  id="limit"
                  name="limit"
                  type="number"
                  defaultValue={20}
                  min={1}
                  max={60}
                  className="w-28"
                />
              </div>
              <label className="flex items-center gap-2 pb-2 text-sm">
                <input type="checkbox" name="enrich" defaultChecked />
                Find emails (visit websites)
              </label>
              <Button type="submit" disabled={searching} className="ml-auto">
                <Search className="size-4" />
                {searching ? "Searching…" : "Search leads"}
              </Button>
            </div>

            {state.error && (
              <p className="text-sm text-destructive">{state.error}</p>
            )}
          </form>
        </CardContent>
      </Card>

      {state.ok && state.mock && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <p>
            <strong>Sample data.</strong> These are placeholder businesses, not
            real leads — set <code>GOOGLE_PLACES_API_KEY</code> to search live
            data. Don’t import these into a real workspace.
          </p>
        </div>
      )}

      {state.ok && results.length > 0 && (
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
            <CardTitle className="text-base">
              {results.length} found · {importable.length} new
            </CardTitle>
            <div className="flex items-center gap-2">
              <div className="flex rounded-md border p-0.5">
                <button
                  type="button"
                  onClick={() => setView("list")}
                  className={`flex items-center gap-1 rounded-sm px-2 py-1 text-xs font-medium ${
                    view === "list"
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <List className="size-3.5" /> List
                </button>
                <button
                  type="button"
                  onClick={() => setView("map")}
                  className={`flex items-center gap-1 rounded-sm px-2 py-1 text-xs font-medium ${
                    view === "map"
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <MapIcon className="size-3.5" /> Map
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {view === "map" ? (
              <ProspectMap
                center={state.center ?? null}
                radiusMeters={state.radiusMeters ?? null}
                hits={mapHits}
              />
            ) : (
              <>
                <div className="flex items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={
                        importable.length > 0 &&
                        importable.every((r) => selectedIds.has(r.placeId))
                      }
                      onChange={toggleAll}
                      disabled={importable.length === 0}
                    />
                    Select all new ({importable.length})
                  </label>
                  <Button
                    size="sm"
                    onClick={doImport}
                    disabled={importing || selectedIds.size === 0}
                  >
                    <Plus className="size-4" />
                    {importing
                      ? "Adding…"
                      : `Add ${selectedIds.size} to Companies`}
                  </Button>
                </div>

                <ul className="max-h-96 divide-y overflow-auto rounded-lg border">
                  {results.map((r) => {
                    const checked = selectedIds.has(r.placeId);
                    return (
                      <li
                        key={r.placeId}
                        className="flex items-center gap-3 px-3 py-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          className="shrink-0"
                          checked={!r.existing && checked}
                          disabled={r.existing}
                          onChange={() => toggle(r.placeId)}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{r.name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {r.address ?? "—"}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                          {r.rating != null && (
                            <span className="flex items-center gap-0.5">
                              <Star className="size-3 fill-amber-400 text-amber-400" />
                              {r.rating}
                            </span>
                          )}
                          {r.website && <Globe className="size-3" />}
                          {r.email && <Mail className="size-3" />}
                          {r.existing && (
                            <Badge variant="secondary" className="gap-1">
                              <Check className="size-3" /> In CRM
                            </Badge>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}

            {importResult?.ok && (
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="success">
                  {importResult.imported} added to Companies
                </Badge>
                {(importResult.contacts ?? 0) > 0 && (
                  <Badge variant="default">
                    {importResult.contacts} contacts
                  </Badge>
                )}
                {(importResult.skipped ?? 0) > 0 && (
                  <Badge variant="secondary">
                    {importResult.skipped} already existed
                  </Badge>
                )}
                <Button variant="outline" size="sm" asChild className="ml-auto">
                  <Link href="/companies">
                    <Building2 className="size-4" /> View in Companies
                  </Link>
                </Button>
              </div>
            )}
            {importResult?.error && (
              <p className="text-sm text-destructive">{importResult.error}</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---- People search ----------------------------------------------------------

function contactLabel(r: {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
}) {
  const full = [r.firstName, r.lastName].filter(Boolean).join(" ").trim();
  return full || r.email || "Unnamed contact";
}

function PeopleSearch() {
  const router = useRouter();
  const [state, formAction, searching] = useActionState<
    ContactSearchState,
    FormData
  >(searchContacts, {});
  const [importing, startImport] = useTransition();

  const results = React.useMemo(() => state.results ?? [], [state.results]);
  const jobKey = state.jobId ?? "";
  const importable = results.filter((r) => !r.existing);

  const [sel, setSel] = React.useState<{ key: string; ids: Set<string> }>({
    key: "__none__",
    ids: new Set(),
  });
  const selectedIds =
    sel.key === jobKey ? sel.ids : new Set(importable.map((r) => r.externalId));

  const [imp, setImp] = React.useState<{ key: string; res: ContactImportState }>(
    { key: "__none__", res: {} }
  );
  const importResult = imp.key === jobKey ? imp.res : null;

  React.useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  function toggle(id: string) {
    const ids = new Set(selectedIds);
    if (ids.has(id)) ids.delete(id);
    else ids.add(id);
    setSel({ key: jobKey, ids });
  }

  function toggleAll() {
    const allSelected = importable.every((r) => selectedIds.has(r.externalId));
    setSel({
      key: jobKey,
      ids: allSelected
        ? new Set()
        : new Set(importable.map((r) => r.externalId)),
    });
  }

  function doImport() {
    const chosen = results.filter((r) => selectedIds.has(r.externalId));
    if (!chosen.length) return;
    startImport(async () => {
      const res = await importContacts(state.jobId ?? null, chosen);
      setImp({ key: jobKey, res });
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Find people by role and company
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="title">Role / job title</Label>
                <Input
                  id="title"
                  name="title"
                  placeholder="e.g. VP Sales, Owner, Office Manager"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="people_location">Location</Label>
                <Input
                  id="people_location"
                  name="location"
                  placeholder="e.g. Austin, TX"
                />
              </div>
            </div>

            <div className="grid gap-4 rounded-lg border bg-muted/30 p-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="company" className="flex items-center gap-1">
                  <Building2 className="size-4" /> Company or domain
                </Label>
                <Input
                  id="company"
                  name="company"
                  placeholder="e.g. Acme Co or acme.com"
                />
                <p className="text-xs text-muted-foreground">
                  Anchor the search to a company. We&apos;ll link matches to that
                  company if it already exists in your CRM.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="seniority">Seniority</Label>
                <Input
                  id="seniority"
                  name="seniority"
                  placeholder="e.g. Director, C-level"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="department">Department</Label>
                <Input
                  id="department"
                  name="department"
                  placeholder="e.g. Sales, Operations"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-2">
                <Label htmlFor="people_limit">Max results</Label>
                <Input
                  id="people_limit"
                  name="limit"
                  type="number"
                  defaultValue={20}
                  min={1}
                  max={60}
                  className="w-28"
                />
              </div>
              <label className="flex items-center gap-2 pb-2 text-sm">
                <input type="checkbox" name="has_email" defaultChecked />
                <Mail className="size-4" /> Must have email
              </label>
              <Button type="submit" disabled={searching} className="ml-auto">
                <Search className="size-4" />
                {searching ? "Searching…" : "Search people"}
              </Button>
            </div>

            {state.error && (
              <p className="text-sm text-destructive">{state.error}</p>
            )}
          </form>
        </CardContent>
      </Card>

      {state.ok && results.length > 0 && (
        <Card>
          <CardHeader className="space-y-0">
            <CardTitle className="text-base">
              {results.length} found · {importable.length} new
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={
                    importable.length > 0 &&
                    importable.every((r) => selectedIds.has(r.externalId))
                  }
                  onChange={toggleAll}
                  disabled={importable.length === 0}
                />
                Select all new ({importable.length})
              </label>
              <Button
                size="sm"
                onClick={doImport}
                disabled={importing || selectedIds.size === 0}
              >
                <Plus className="size-4" />
                {importing ? "Adding…" : `Add ${selectedIds.size} to Contacts`}
              </Button>
            </div>

            <ul className="max-h-96 divide-y overflow-auto rounded-lg border">
              {results.map((r) => {
                const checked = selectedIds.has(r.externalId);
                return (
                  <li
                    key={r.externalId}
                    className="flex items-center gap-3 px-3 py-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      className="shrink-0"
                      checked={!r.existing && checked}
                      disabled={r.existing}
                      onChange={() => toggle(r.externalId)}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{contactLabel(r)}</p>
                      <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                        {r.title && (
                          <>
                            <Briefcase className="size-3 shrink-0" /> {r.title}
                          </>
                        )}
                        {r.title && r.companyName && " · "}
                        {r.companyName}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                      {r.email && <Mail className="size-3" />}
                      {r.phone && <Phone className="size-3" />}
                      {r.linkedinUrl && <ExternalLink className="size-3" />}
                      {r.existing && (
                        <Badge variant="secondary" className="gap-1">
                          <Check className="size-3" /> In CRM
                        </Badge>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>

            {importResult?.ok && (
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="success">
                  {importResult.imported} added to Contacts
                </Badge>
                {(importResult.linked ?? 0) > 0 && (
                  <Badge variant="default">
                    {importResult.linked} linked to a company
                  </Badge>
                )}
                {(importResult.skipped ?? 0) > 0 && (
                  <Badge variant="secondary">
                    {importResult.skipped} already existed
                  </Badge>
                )}
                <Button variant="outline" size="sm" asChild className="ml-auto">
                  <Link href="/contacts">
                    <Users className="size-4" /> View in Contacts
                  </Link>
                </Button>
              </div>
            )}
            {importResult?.error && (
              <p className="text-sm text-destructive">{importResult.error}</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
