# 07 — Design System

The reference for building new screens in Handshake. Everything here reflects
what's actually in the codebase (`src/app/globals.css`, `src/components/ui/*`,
and the shared composites in `src/components/*`). When you build a new screen,
compose from these pieces and follow these conventions so it feels native.

**Golden rule:** don't invent new tokens, colors, or one-off components. Reach
for an existing primitive or composite first. If nothing fits, extend the system
here so the next screen can reuse it.

---

## 1. Principles

- **Semantic tokens over raw colors.** Use `bg-card`, `text-muted-foreground`,
  `border`, etc. Raw Tailwind colors (`bg-sky-500`) are reserved for the
  decorative accent palette (§2.2) — never for text/surface defaults.
- **Calm, then a little delight.** Surfaces are quiet and legible; personality
  lives in empty states, the dashboard hero, and 404/error screens.
- **One control height.** Interactive controls in a row are `h-9` (or `h-8` for
  dense/table-footer controls). Never mix heights in the same toolbar.
- **Right-align table controls.** Search, filters, and sort live on the right of
  a table toolbar; contextual bulk actions sit on the left.
- **Every list has an empty state.** Use `EmptyState`; never ship a bare "No
  results."

---

## 2. Color

### 2.1 Semantic tokens

Defined as CSS variables in `globals.css` (`:root` + `.dark`) and exposed to
Tailwind via `@theme inline` as `--color-*`. Use the Tailwind utility, not the
raw variable.

| Token | Utility | Use |
|---|---|---|
| `--background` / `--foreground` | `bg-background` / `text-foreground` | Page base |
| `--card` / `--card-foreground` | `bg-card` / `text-card-foreground` | Cards, sidebar, header |
| `--popover` / `--popover-foreground` | `bg-popover` | Menus, selects, dialogs |
| `--primary` / `--primary-foreground` | `bg-primary` / `text-primary-foreground` | Primary actions, brand |
| `--secondary` / `--secondary-foreground` | `bg-secondary` | Secondary buttons, active nav |
| `--muted` / `--muted-foreground` | `bg-muted` / `text-muted-foreground` | Subdued text, fills |
| `--accent` / `--accent-foreground` | `bg-accent` | Hover states, subtle highlight |
| `--destructive` | `bg-destructive` / `text-destructive` | Delete/danger |
| `--border` / `--input` / `--ring` | `border`, `border-input`, `ring-ring` | Dividers, inputs, focus |
| `--chart-1…5` | `text-chart-1` … | Data-viz series (all brand-blue tints) |
| `--sidebar*` | `bg-sidebar` … | Sidebar-specific surfaces |

The brand hue is an indigo/blue (`--primary` ≈ `oklch(0.48 0.20 260)`). Dark mode
is automatic via the `.dark` class — **always use tokens so both themes work.**

### 2.2 Accent palette (decorative / categorical)

For stat cards, integration tiles, and icon chips that need visual variety, use
this fixed set of Tailwind hues. Always the `/15` background + `600`/`400` text
pairing so light/dark both read. Keep the mapping stable per concept.

```
sky     → bg-sky-500/15 text-sky-600 dark:text-sky-400
violet  → bg-violet-500/15 text-violet-600 dark:text-violet-400
emerald → bg-emerald-500/15 text-emerald-600 dark:text-emerald-400
amber   → bg-amber-500/15 text-amber-600 dark:text-amber-400
rose    → bg-rose-500/15 text-rose-600 dark:text-rose-400
teal    → bg-teal-500/15 text-teal-600 dark:text-teal-400
```

These are **decorative only** — class strings must be static (never
interpolated) so Tailwind keeps them.

### 2.3 Status colors

Use `Badge` variants (§4). Established mappings:

- **Campaign/Workflow status** — `draft`→`secondary`, `active`→`success`,
  `paused`→`warning`, `archived`→`outline`.
- **Lifecycle stage** (`LifecycleBadge`) — `new`→`secondary`,
  `contacted`→`default`, `qualified`→`warning`, `won`→`success`, `lost`→`destructive`.

---

## 3. Typography

Three fonts wired in `layout.tsx` as CSS variables:

- **Manrope** → `--font-heading` / `--font-sans` (headings, UI)
- **Lato** → `--font-body` (body copy)
- **IBM Plex Mono** → `--font-mono` (code, IDs, endpoints)

Base heading styles are set globally in `globals.css` (`h1`–`h6`). In practice
screens set their own sizes with utilities for consistency:

| Element | Classes |
|---|---|
| Page title | `text-2xl font-bold tracking-tight` |
| Page subtitle | `text-sm text-muted-foreground` |
| Section heading | `text-lg font-semibold tracking-tight` |
| Card title | `text-base` (inside `CardTitle`) |
| Body | default (`text-sm` is the workhorse) |
| Meta / hints | `text-xs text-muted-foreground` |
| IDs / endpoints | `font-mono text-xs` |
| Numbers in tables | add `tabular-nums` |

---

## 4. Spacing, radius, shadow, motion

**Spacing rhythm**
- App content padding: `<main>` is `p-6` (in `(app)/layout.tsx`).
- Vertical rhythm between page sections: `space-y-6`.
- Card inner padding: `p-6` (via `CardHeader`/`CardContent`) or `p-5` for compact
  tiles.
- Toolbar / control gaps: `gap-2`.

**Radius** — token `--radius: 0.625rem`. Scale: `rounded-md` (inputs/buttons),
`rounded-lg` (table container, list groups), `rounded-xl` (cards, icon chips),
`rounded-2xl` (hero, illustration badges).

**Shadow** — `shadow-sm` (cards at rest), `shadow-md` (hover lift),
`shadow-lg`/`shadow-xl` (hero, floating illustration badges). Colored glow for
brand elements: `shadow-lg shadow-primary/25`.

**Motion** — custom keyframes in `globals.css`, all disabled under
`prefers-reduced-motion`:

| Class | Effect | Use |
|---|---|---|
| `animate-hs-float` | gentle up/down bob | empty-state & status icons, hero orb |
| `animate-hs-wave` | handshake wave | brand handshake icons |
| `animate-hs-ping` | expanding ring | radiating ring behind empty-state icon |
| `animate-hs-pop` | scale-in | status screen title entrance |
| `animate-hs-twinkle` | sparkle pulse | the sparkle on empty states |

Hover transitions: `transition-colors` (default), `transition-all duration-200`
+ `group-hover:-translate-y-0.5 group-hover:shadow-md` for card lift.

---

## 5. App shell

`(app)/layout.tsx` provides the authenticated shell — don't rebuild it per page:

- **Sidebar** (`components/sidebar.tsx`) — `w-60`, `bg-card`, nav items highlight
  when `pathname === href || pathname.startsWith(href + "/")`. Add new top-level
  destinations to the `NAV` array there.
- **Header** — `h-14`, org switcher left, user email + sign out right.
- **Main** — `flex-1 overflow-y-auto p-6`. Your page renders here.

A page is therefore just the content: start with a `<div className="space-y-6">`
and a page header.

---

## 6. Primitives (`src/components/ui`)

All are shadcn-style, token-driven, `cn()`-composable.

- **Button** — `variant`: `default | destructive | outline | secondary | ghost |
  link`; `size`: `default (h-9) | sm (h-8) | lg (h-10) | icon (size-9)`.
  `asChild` to render as a `<Link>`. Icons render at `size-4` automatically.
  Also exports `buttonVariants({variant,size})` for styling `<Link>`s.
- **Input** — `h-9`, full width; constrain with `max-w-sm` in forms or a fixed
  width in toolbars.
- **Select** — `Select/SelectTrigger/SelectContent/SelectItem/SelectValue`;
  trigger is `h-9`.
- **Checkbox** — `checked: boolean | "indeterminate"`, `onCheckedChange`. Used by
  `DataTable` row selection.
- **Badge** — `variant`: `default | secondary | outline | success | warning |
  destructive`. See §2.3 for mappings.
- **Card** — `Card/CardHeader/CardTitle/CardDescription/CardContent/CardFooter`.
  `rounded-xl border bg-card shadow-sm`. Use `border-dashed bg-card/50
  shadow-none` for empty-state containers.
- **Dialog** — centered modal. Use for focused create/edit forms and
  confirmations.
- **Sheet** — side panel. Use for create/edit flows with more fields (invite
  teammate, add mailbox, campaign/segment builders).
- **DropdownMenu** — row actions (edit/delete) and overflow menus.
- **Table** — `Table/TableHeader/TableBody/TableRow/TableHead/TableCell`. Prefer
  `DataTable` (§7) over hand-rolling; use raw table only for tiny static lists.
- **Label**, **Textarea** — form building blocks.

**Dialog vs Sheet:** ≤3 fields or a confirm → Dialog; a multi-field form or a
builder → Sheet.

---

## 7. Composite components (`src/components`)

### `DataTable<TData>` — the standard table
Every list/data table uses this. It provides right-aligned toolbar, global
search, row selection + bulk-action bar, sortable headers, pagination, and a
rows-per-page selector.

```tsx
<DataTable
  columns={columns}                      // TanStack ColumnDef[]
  data={rows}
  getRowId={(r) => r.id}
  enableSelection                        // checkboxes + bulk bar
  enableSearch                           // right-aligned h-9 search box
  searchPlaceholder="Search contacts…"
  onRowClick={(r) => router.push(`/contacts/${r.id}`)}
  toolbar={<StatusFilterSelect />}       // right-aligned filters (h-9)
  bulkActions={({ rows, clear }) => (
    <BulkDeleteButton ids={rows.map(r => r.id)} action={deleteContact}
      onDone={clear} noun="contact" />
  )}
  emptyState={<EmptyState bare icon={Users} title="…" description="…" />}
  searchEmptyState={<EmptyState bare icon={SearchX} title="No matches" />}
/>
```

Conventions:
- Table wrapper is a client component (`"use client"`); the page (server) fetches
  and maps DB rows into a flat `Row` type it passes in.
- **Filters** are done parent-side (local `useState` → filter the array → pass to
  `DataTable`) and rendered via `toolbar`. Keep them `h-9`.
- Read-only tables (reports, history) still get `enableSelection` + search +
  pagination, just no `bulkActions`.

### `EmptyState`
Friendly empty state: animated gradient icon badge, title, optional description,
optional action slot. `bare` drops the dashed Card (for use inside a table cell
or an existing card).

```tsx
<EmptyState icon={Send} title="Your outbox is quiet"
  description="Build a sequence and start landing in inboxes.">
  <Button asChild><Link href="/campaigns/new"><Plus className="size-4"/> New campaign</Link></Button>
</EmptyState>
```

### `StatusScreen`
Full-height screen for 404 / error / crash pages. Presentational (no hooks) so
both server pages and client error boundaries can use it. `code` shows a big
ghosted number; `wave` swaps float for a handshake wave.

```tsx
<StatusScreen icon={Compass} code="404" title="This page wandered off"
  description="…">
  <Link href="/" className={buttonVariants()}><Home className="size-4"/> Take me home</Link>
</StatusScreen>
```

### `ConfirmDialog`
**Required for every destructive or irreversible action** (delete, remove,
revoke, merge). A controlled modal — pass the button/menu-item that opens it as
`trigger`, and the action as `onConfirm`. Handles its own open + pending state
and closes on success.

```tsx
<ConfirmDialog
  trigger={<Button variant="outline" size="sm"><Trash2 className="size-4"/> Delete</Button>}
  title="Delete contact?"
  description="This permanently deletes this contact and their activity. This can't be undone."
  onConfirm={async () => { await deleteContact(id); router.push("/contacts"); }}
/>
```

Inside a `DropdownMenu`, pass the trigger as a `DropdownMenuItem` with
`onSelect={(e) => e.preventDefault()}` so the menu doesn't close before the
dialog opens. Props: `confirmLabel` (default "Delete"), `pendingLabel`,
`variant` (default `destructive`). Never use `window.confirm`.

### `BulkDeleteButton`
Confirms via `ConfirmDialog`, loops a delete server action over selected ids,
refreshes. Plug into `DataTable`'s `bulkActions`.

### Other composites
- **`LifecycleBadge`** — renders the correct `Badge` for a lifecycle stage.
- **`PagePlaceholder`** — "coming soon" stub for unbuilt modules.
- **`SettingsNav`** — the settings sub-nav pattern (see §8, Settings recipe).

---

## 8. Screen recipes

### List page (contacts, companies, campaigns, …)
```tsx
export default async function ThingsPage() {
  const { supabase, org } = await requireContext();
  const { data } = await supabase.from("things").select("*").eq("org_id", org.id);
  const rows = (data ?? []).map(toRow);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Things</h1>
          <p className="text-sm text-muted-foreground">What things are.</p>
        </div>
        <Button asChild><Link href="/things/new"><Plus className="size-4"/> New thing</Link></Button>
      </div>

      {rows.length
        ? <ThingsTable data={rows} />                    {/* DataTable inside */}
        : <EmptyState icon={Box} title="No things yet" description="…">
            <Button asChild><Link href="/things/new">New thing</Link></Button>
          </EmptyState>}
    </div>
  );
}
```

### Detail page
Back link → fetch → `notFound()` if missing (the `(app)/not-found.tsx` boundary
catches it) → header with actions → content cards.

```tsx
const { data: thing } = await supabase.from("things").select("*").eq("id", id).single();
if (!thing) notFound();
```

### Dashboard-style stat cards
Colored, clickable, hover-lift. Use the accent palette (§2.2):

```tsx
<Link href={s.href} className="group">
  <Card className="relative h-full overflow-hidden ring-1 ring-inset ring-sky-500/20
    transition-all duration-200 group-hover:-translate-y-0.5 group-hover:shadow-md">
    <div className="p-5">
      <span className="grid size-10 place-items-center rounded-xl bg-sky-500/15 text-sky-600 dark:text-sky-400">
        <Users className="size-5" />
      </span>
      <p className="mt-4 text-3xl font-bold tabular-nums">{value}</p>
      <p className="text-sm font-medium">{label}</p>
    </div>
  </Card>
</Link>
```

### Forms (server actions)
`useActionState` + a small inline `Status` (`text-destructive` for errors,
`text-green-600` for success). Inputs `max-w-sm`, submit `size="sm"`, disabled
while `pending`. See `settings/account-forms.tsx` for the canonical pattern.

### Settings-style section (layout + sub-nav)
For any area with several sub-pages: a `layout.tsx` renders the header + a
sticky left rail (`SettingsNav` pattern: `lg:grid-cols-[200px_minmax(0,1fr)]`,
horizontal scroll on mobile) and the index `page.tsx` redirects to the first
sub-page.

### Empty / error / 404
- **Empty data** → `EmptyState`.
- **Route/segment error** → an `error.tsx` (`"use client"`, uses
  `unstable_retry`) rendering `StatusScreen`.
- **Not found** → `notFound()` + the nearest `not-found.tsx` (`StatusScreen`).
- **Root crash** → `global-error.tsx` (self-contained html/body).

---

## 9. Conventions checklist

When a screen is done, confirm:

- [ ] Wrapped in `space-y-6`; header is `text-2xl font-bold tracking-tight` +
      `text-sm text-muted-foreground` subtitle.
- [ ] Only semantic tokens for text/surfaces; accent hues only for decoration.
- [ ] Works in light **and** dark (you used tokens, not raw grays).
- [ ] All row-of-controls are one height (`h-9`, or `h-8` for dense).
- [ ] Tables use `DataTable`; toolbar filters/search are right-aligned.
- [ ] Lists have an `EmptyState`; searches have a distinct search-empty state.
- [ ] Icons are `lucide-react` at `size-4` (buttons/nav) or `size-5`/`size-7`
      (chips/illustrations).
- [ ] Every destructive/irreversible action (delete, remove, revoke, merge) goes
      through `ConfirmDialog` — never `window.confirm`, never a one-click delete.
- [ ] Server pages fetch + map; interactivity lives in `"use client"` children.
- [ ] Copy has a light, human tone — especially empty/error states.
```
