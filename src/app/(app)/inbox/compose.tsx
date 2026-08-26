"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import {
  MessagesSquare,
  PenSquare,
  Send,
  UserPlus,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import {
  RichEmailEditor,
  type EmailSnippet,
} from "@/components/rich-email-editor";
import { MergeTokenMenu, insertTokenAt } from "@/components/merge-token-menu";
import { cn } from "@/lib/utils";
import { EMAIL_RE } from "@/lib/data-quality";
import { replySubject } from "@/lib/inbox/threading";
import { CopyFields, type CopyLists } from "./copy-fields";
import { composeEmail, type ComposeState } from "./actions";

export type ComposeContact = {
  id: string;
  name: string;
  email: string;
  company: string | null;
  /** The contact's existing email thread, when they already have one. */
  thread: { id: string; subject: string | null; closed: boolean } | null;
};

/** Opens the draft in the thread pane (`?compose=1`), not a slide-over. */
export function NewEmailButton({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className={cn(buttonVariants({ size: "sm" }), "shrink-0")}
    >
      <PenSquare className="size-4" /> New email
    </Link>
  );
}

/**
 * A draft thread, rendered in the same pane an existing thread occupies: the
 * recipient sits in the header where the contact would be, the body shows what
 * the thread will become, and the composer is in its usual slot at the bottom.
 * Sending resolves the recipient's thread and navigates into it.
 */
export function ComposeThread({
  contacts,
  templates,
  cancelHref,
}: {
  contacts: ComposeContact[];
  /** Saved + curated email templates for the editor's "Insert template" menu. */
  templates: EmailSnippet[];
  cancelHref: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ComposeState, FormData>(
    composeEmail,
    {}
  );

  // Map the searchable display label — or a bare address typed instead of
  // picking a row — back to a contact.
  const resolve = React.useMemo(() => {
    const byLabel = new Map<string, ComposeContact>();
    const byEmail = new Map<string, ComposeContact>();
    const labels: string[] = [];
    for (const c of contacts) {
      const label = `${c.name} · ${c.email}${c.company ? ` · ${c.company}` : ""}`;
      labels.push(label);
      byLabel.set(label, c);
      if (c.email) byEmail.set(c.email.toLowerCase(), c);
    }
    return {
      labels,
      find: (value: string): ComposeContact | null =>
        byLabel.get(value) ?? byEmail.get(value.trim().toLowerCase()) ?? null,
    };
  }, [contacts]);

  const [label, setLabel] = React.useState("");
  const [subject, setSubject] = React.useState("");
  const [body, setBody] = React.useState("");
  const [copies, setCopies] = React.useState<CopyLists>({ cc: "", bcc: "" });
  const subjectRef = React.useRef<HTMLInputElement>(null);
  const contact = resolve.find(label);
  const contactId = contact?.id ?? "";
  const thread = contact?.thread ?? null;
  // Anything typed that matches no contact is a raw address: the server creates
  // the contact for it, so the draft still opens a thread rather than nothing.
  const typedEmail = contact ? "" : label.trim();
  const newRecipient = EMAIL_RE.test(typedEmail.toLowerCase());
  const canSend = !!contactId || newRecipient;

  // A recipient with a thread means this email continues that thread, so the
  // subject follows it ("Re: …") — still editable if you're changing topic.
  const onPick = (next: string) => {
    setLabel(next);
    const picked = resolve.find(next);
    setSubject(picked?.thread ? replySubject(picked.thread.subject) : "");
  };

  React.useEffect(() => {
    if (state.ok && state.conversationId) {
      router.push(`/inbox?c=${state.conversationId}`);
      router.refresh();
    }
  }, [state, router]);

  return (
    <div className="flex min-h-0 flex-col">
      {/* Header — the recipient stands where the contact does on a real thread. */}
      <div className="space-y-2 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold">New email</h2>
          <Badge variant="secondary">Draft</Badge>
          <Link
            href={cancelHref}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <X className="size-3.5" /> Discard
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <Label
            htmlFor="compose-to"
            className="w-8 shrink-0 text-xs text-muted-foreground"
          >
            To
          </Label>
          <Combobox
            id="compose-to"
            value={label}
            onValueChange={onPick}
            options={resolve.labels}
            allowCreate
            placeholder="Choose a contact or type an email…"
            searchPlaceholder="Search contacts or type an email…"
            emptyText="No matching contact — type a full email address to start a thread."
          />
        </div>
        <CopyFields value={copies} onChange={setCopies} />
      </div>

      {/* Where the thread's messages will go. */}
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {!canSend ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Pick a recipient — or type any email address — to start the thread.
          </p>
        ) : thread ? (
          <div className="mx-auto flex max-w-md flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
            <MessagesSquare className="size-6" />
            <p>
              {contact?.name} already has a thread
              {thread.subject && (
                <>
                  {" "}
                  — <span className="font-medium text-foreground">
                    {thread.subject}
                  </span>
                </>
              )}
              . This message is added to it
              {thread.closed && <>, reopening it</>}.
            </p>
            <Link
              href={`/inbox?c=${thread.id}`}
              className="font-medium text-primary underline-offset-2 hover:underline"
            >
              Open the thread instead
            </Link>
          </div>
        ) : newRecipient ? (
          <div className="mx-auto flex max-w-md flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
            <UserPlus className="size-6" />
            <p>
              No contact for{" "}
              <span className="font-medium text-foreground">{typedEmail}</span>{" "}
              yet — sending creates one and starts the thread on it.
            </p>
          </div>
        ) : (
          <div className="mx-auto flex max-w-md flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
            <PenSquare className="size-6" />
            <p>
              This starts a new thread with{" "}
              <span className="font-medium text-foreground">
                {contact?.name}
              </span>
              .
            </p>
          </div>
        )}
      </div>

      {/* Composer — same slot as a real thread's reply box. */}
      <form action={formAction} className="space-y-2 border-t p-3">
        <input type="hidden" name="contact_id" value={contactId} />
        <input type="hidden" name="to_email" value={typedEmail} />
        <input type="hidden" name="body" value={body} />
        <div className="flex items-center gap-2">
          <Input
            ref={subjectRef}
            name="subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            aria-label="Subject"
          />
          <MergeTokenMenu
            label="Shortcode"
            onInsert={(token) => {
              const next = insertTokenAt(subjectRef.current, subject, token);
              setSubject(next.value);
            }}
          />
        </div>
        <RichEmailEditor
          value={body}
          onChange={setBody}
          emailTemplates={templates}
          onApplyTemplate={(snippet) => {
            // Templates carry their own subject; don't clobber one the thread
            // already dictated ("Re: …") or the sender typed.
            if (snippet.subject && !subject.trim()) setSubject(snippet.subject);
          }}
          placeholder="Write your email… pick a template, or insert a {{shortcode}}."
        />
        {state.error && <p className="text-sm text-destructive">{state.error}</p>}
        <div className="flex items-center justify-between">
          <span className="truncate text-xs text-muted-foreground">
            {contact?.email || typedEmail
              ? `To: ${contact?.email || typedEmail}`
              : "No recipient yet"}
          </span>
          <Button type="submit" size="sm" disabled={pending || !canSend}>
            <Send className="size-4" />{" "}
            {pending
              ? "Sending…"
              : thread
                ? "Send to thread"
                : newRecipient
                  ? "Create contact & send"
                  : "Send email"}
          </Button>
        </div>
      </form>
    </div>
  );
}
