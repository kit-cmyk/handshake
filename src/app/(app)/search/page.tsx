import Link from "next/link";
import { Users, Building2, Handshake, SearchX } from "lucide-react";
import { requireContext } from "@/lib/context";
import { EmptyState } from "@/components/empty-state";
import { contactName } from "@/lib/types";

type SearchResult = {
  href: string;
  title: string;
  subtitle?: string;
};

type Group = {
  label: string;
  icon: typeof Users;
  results: SearchResult[];
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const raw = (q ?? "").trim();
  // Neutralize characters that would break PostgREST's or() filter syntax.
  const term = raw.replace(/[,%()*:]/g, " ").trim();

  const { supabase, org } = await requireContext();

  const groups: Group[] = [];
  let total = 0;

  if (term) {
    const like = `%${term}%`;
    const [contacts, companies, deals] = await Promise.all([
      supabase
        .from("contacts")
        .select("id, first_name, last_name, email, title")
        .eq("org_id", org.id)
        .or(
          `first_name.ilike.${like},last_name.ilike.${like},email.ilike.${like}`
        )
        .limit(8),
      supabase
        .from("companies")
        .select("id, name, domain")
        .eq("org_id", org.id)
        .ilike("name", like)
        .limit(8),
      supabase
        .from("deals")
        .select("id, title")
        .eq("org_id", org.id)
        .ilike("title", like)
        .limit(8),
    ]);

    const contactRows = (contacts.data ?? []) as {
      id: string;
      first_name: string | null;
      last_name: string | null;
      email: string | null;
      title: string | null;
    }[];
    const companyRows = (companies.data ?? []) as {
      id: string;
      name: string;
      domain: string | null;
    }[];
    const dealRows = (deals.data ?? []) as { id: string; title: string }[];

    if (contactRows.length)
      groups.push({
        label: "Contacts",
        icon: Users,
        results: contactRows.map((c) => ({
          href: `/contacts/${c.id}`,
          title: contactName(c),
          subtitle: c.title ?? c.email ?? undefined,
        })),
      });

    if (companyRows.length)
      groups.push({
        label: "Companies",
        icon: Building2,
        results: companyRows.map((c) => ({
          href: `/companies/${c.id}`,
          title: c.name,
          subtitle: c.domain ?? undefined,
        })),
      });

    if (dealRows.length)
      groups.push({
        label: "Deals",
        icon: Handshake,
        results: dealRows.map((d) => ({
          href: `/pipeline/${d.id}`,
          title: d.title,
        })),
      });

    total = groups.reduce((n, g) => n + g.results.length, 0);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Search</h1>
        {raw && (
          <p className="text-sm text-muted-foreground">
            {total} result{total === 1 ? "" : "s"} for &ldquo;{raw}&rdquo;
          </p>
        )}
      </div>

      {!raw ? (
        <EmptyState
          icon={SearchX}
          title="Search your workspace"
          description="Find contacts, companies, and deals by name or email."
        />
      ) : total === 0 ? (
        <EmptyState
          icon={SearchX}
          title="No matches"
          description={`Nothing matched “${raw}”. Try a different term.`}
        />
      ) : (
        <div className="space-y-6">
          {groups.map((group) => {
            const Icon = group.icon;
            return (
              <section key={group.label} className="space-y-2">
                <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Icon className="size-4" /> {group.label}
                </h2>
                <ul className="divide-y overflow-hidden rounded-lg border bg-card">
                  {group.results.map((r, i) => (
                    <li key={`${r.href}-${i}`}>
                      <Link
                        href={r.href}
                        className="flex flex-col px-4 py-3 transition-colors hover:bg-accent"
                      >
                        <span className="text-sm font-medium">{r.title}</span>
                        {r.subtitle && (
                          <span className="text-xs text-muted-foreground">
                            {r.subtitle}
                          </span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
