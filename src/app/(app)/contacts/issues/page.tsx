import Link from "next/link";
import { ArrowLeft, CheckCircle2, Copy, Mail, Phone, User } from "lucide-react";
import { requireContext } from "@/lib/context";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  detectIssues,
  type DuplicateGroup,
  type FormattingIssue,
  type FormattingIssueType,
} from "@/lib/data-quality";
import { EmptyState } from "@/components/empty-state";
import { Accordion, AccordionItem } from "@/components/ui/accordion";
import { DuplicatesSection } from "./duplicates-section";
import { FixList } from "./fix-list";
import type { ContactWithCompany } from "@/lib/types";

/** Formatting issue types, in the order they appear as accordion sections. */
const FORMATTING_SECTIONS: {
  reason: FormattingIssueType;
  title: string;
  description: string;
}[] = [
  {
    reason: "missing_email",
    title: "Missing email",
    description:
      "No email on file. Add one, or skip if this contact is reached another way.",
  },
  {
    reason: "invalid_email",
    title: "Invalid email",
    description: "The address doesn't look valid. Correct the format to fix.",
  },
  {
    reason: "missing_phone",
    title: "Missing phone",
    description: "No phone number. Add one, or skip if it isn't needed.",
  },
  {
    reason: "invalid_phone",
    title: "Invalid phone",
    description:
      "The number looks too short. Correct it, or skip to keep it as-is.",
  },
  {
    reason: "missing_name",
    title: "Missing name",
    description: "No first or last name. Add one, or skip to keep it as-is.",
  },
];

export default async function ContactIssuesPage() {
  const { supabase, org } = await requireContext();

  const { data: contacts } = await supabase
    .from("contacts")
    .select("*, companies(id, name)")
    .eq("org_id", org.id)
    .order("created_at", { ascending: false });

  const report = detectIssues((contacts ?? []) as ContactWithCompany[]);
  const c = report.counts;

  const stats = [
    { icon: Copy, label: "Duplicate contacts", value: c.duplicateContacts },
    {
      icon: Mail,
      label: "Missing / invalid email",
      value: c.missingEmail + c.invalidEmail,
    },
    {
      icon: Phone,
      label: "Missing / invalid phone",
      value: c.missingPhone + c.invalidPhone,
    },
    { icon: User, label: "Missing name", value: c.missingName },
  ];

  // Build the ordered list of non-empty accordion sections.
  type Section =
    | {
        kind: "dupe";
        key: string;
        title: string;
        description: string;
        count: number;
        groups: DuplicateGroup[];
      }
    | {
        kind: "fix";
        key: string;
        title: string;
        description: string;
        count: number;
        reason: FormattingIssueType;
        items: FormattingIssue[];
      };

  const sections: Section[] = [];

  if (report.duplicateEmailGroups.length) {
    sections.push({
      kind: "dupe",
      key: "dupe-email",
      title: "Duplicate leads — same email",
      description:
        "Keep one, merge the rest — or select whole groups to merge in bulk. Activities and deals move to the kept contact.",
      count: report.duplicateEmailGroups.length,
      groups: report.duplicateEmailGroups,
    });
  }
  if (report.duplicateNameGroups.length) {
    sections.push({
      kind: "dupe",
      key: "dupe-name",
      title: "Possible duplicates — same name & company",
      description:
        "These share a name and company but not an email. Review before merging.",
      count: report.duplicateNameGroups.length,
      groups: report.duplicateNameGroups,
    });
  }
  for (const s of FORMATTING_SECTIONS) {
    const items = report.formatting.filter((f) => f.reasons.includes(s.reason));
    if (items.length) {
      sections.push({
        kind: "fix",
        key: s.reason,
        title: s.title,
        description: s.description,
        count: items.length,
        reason: s.reason,
        items,
      });
    }
  }

  const clean = sections.length === 0;

  return (
    <div className="space-y-6">
      <Link
        href="/contacts"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to contacts
      </Link>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Data health</h1>
        <p className="text-sm text-muted-foreground">
          Resolve duplicate leads and fix formatting issues before you reach out.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <s.icon className="size-4" /> {s.label}
              </CardDescription>
              <CardTitle className="text-3xl">{s.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      {clean ? (
        <EmptyState
          icon={CheckCircle2}
          title="Spotless — nice work"
          description="No duplicates, no broken emails, nothing missing. Your contact data is in great shape."
        />
      ) : (
        <Accordion>
          {sections.map((s, i) => (
            <AccordionItem
              key={s.key}
              title={s.title}
              count={s.count}
              defaultOpen={i === 0}
            >
              <p className="mb-3 text-sm text-muted-foreground">
                {s.description}
              </p>
              {s.kind === "dupe" ? (
                <DuplicatesSection groups={s.groups} />
              ) : (
                <FixList reason={s.reason} items={s.items} />
              )}
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </div>
  );
}
