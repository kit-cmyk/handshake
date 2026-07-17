// Merge-tag ("shortcode") rendering for campaign emails. Tokens draw from the
// contact and its company, plus the sender identity and the workspace booking
// link resolved at send time. Unknown tokens render empty.

export type MergeContact = {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  title?: string | null;
  lifecycle_stage?: string | null;
  company?: string | null;
  // Sender + workspace fields. These are the SAME for every recipient of a
  // given send — filled from the sending mailbox and the org's booking URL, not
  // the contact — but they ride along in the same map so templates can reference
  // them with the same {{token}} syntax.
  sender_name?: string | null;
  sender_email?: string | null;
  booking_link?: string | null;
};

/** Supported merge tokens, grouped for the builder's "Insert field" menu. */
export const MERGE_TOKEN_GROUPS = [
  {
    group: "Contact",
    tokens: [
      { token: "first_name", label: "First name" },
      { token: "last_name", label: "Last name" },
      { token: "full_name", label: "Full name" },
      { token: "email", label: "Email" },
      { token: "phone", label: "Phone" },
      { token: "title", label: "Job title" },
      { token: "lifecycle_stage", label: "Lifecycle stage" },
    ],
  },
  {
    group: "Company",
    tokens: [{ token: "company", label: "Company name" }],
  },
  {
    group: "You",
    tokens: [
      { token: "sender_name", label: "Your name" },
      { token: "sender_email", label: "Your email" },
    ],
  },
  {
    group: "Scheduling",
    tokens: [{ token: "booking_link", label: "Booking link" }],
  },
] as const;

/** Flat list of every supported token. */
export const MERGE_TOKENS: ReadonlyArray<{ token: string; label: string }> =
  MERGE_TOKEN_GROUPS.flatMap((g) =>
    g.tokens.map((t) => ({ token: t.token, label: t.label }))
  );

/** Sample contact used for previews and test sends. */
export const SAMPLE_MERGE: MergeContact = {
  first_name: "Alex",
  last_name: "Rivera",
  email: "alex@example.com",
  phone: "+1 (555) 018-2245",
  title: "Head of Operations",
  lifecycle_stage: "qualified",
  company: "Acme Co",
  sender_name: "Jordan Blake",
  sender_email: "jordan@yourco.com",
  booking_link: "https://cal.com/jordan/30min",
};

export function renderTemplate(tpl: string, c: MergeContact): string {
  const map: Record<string, string> = {
    first_name: c.first_name ?? "",
    last_name: c.last_name ?? "",
    full_name: [c.first_name, c.last_name].filter(Boolean).join(" "),
    email: c.email ?? "",
    phone: c.phone ?? "",
    title: c.title ?? "",
    lifecycle_stage: c.lifecycle_stage ?? "",
    company: c.company ?? "",
    sender_name: c.sender_name ?? "",
    sender_email: c.sender_email ?? "",
    booking_link: c.booking_link ?? "",
  };
  return (tpl ?? "").replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) =>
    key in map ? map[key] : ""
  );
}

/** Append an unsubscribe footer with a working link. */
export function withUnsubscribe(bodyHtml: string, unsubUrl: string): string {
  return `${bodyHtml}
<div style="margin-top:24px;padding-top:16px;border-top:1px solid #e4e4e7;font-size:12px;line-height:1.5;color:#71717a">
If you&rsquo;d prefer not to hear from us, <a href="${unsubUrl}" style="color:#71717a">unsubscribe</a>.
</div>`;
}
