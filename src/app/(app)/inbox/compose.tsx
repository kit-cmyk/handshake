"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { PenSquare, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { RichEmailEditor } from "@/components/rich-email-editor";
import { composeEmail, type ComposeState } from "./actions";

export type ComposeContact = {
  id: string;
  name: string;
  email: string;
  company: string | null;
};

export function ComposeEmail({ contacts }: { contacts: ComposeContact[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [state, formAction, pending] = useActionState<ComposeState, FormData>(
    composeEmail,
    {}
  );

  // Map the searchable display label back to a contact id.
  const { labels, labelToId } = React.useMemo(() => {
    const labelToId = new Map<string, string>();
    const labels: string[] = [];
    for (const c of contacts) {
      const label = `${c.name} · ${c.email}${c.company ? ` · ${c.company}` : ""}`;
      labels.push(label);
      labelToId.set(label, c.id);
    }
    return { labels, labelToId };
  }, [contacts]);

  const [label, setLabel] = React.useState("");
  const [subject, setSubject] = React.useState("");
  const [body, setBody] = React.useState("");
  const contactId = labelToId.get(label) ?? "";

  React.useEffect(() => {
    if (state.ok && state.conversationId) {
      setOpen(false);
      setLabel("");
      setSubject("");
      setBody("");
      router.push(`/inbox?c=${state.conversationId}`);
      router.refresh();
    }
  }, [state, router]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="sm">
          <PenSquare className="size-4" /> New email
        </Button>
      </SheetTrigger>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>New email</SheetTitle>
        </SheetHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="contact_id" value={contactId} />
          <input type="hidden" name="body" value={body} />

          <div className="space-y-2">
            <Label htmlFor="compose-to">To</Label>
            <Combobox
              id="compose-to"
              value={label}
              onValueChange={setLabel}
              options={labels}
              placeholder="Choose a contact…"
              searchPlaceholder="Search contacts…"
              emptyText="No contacts with an email address."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="compose-subject">Subject</Label>
            <Input
              id="compose-subject"
              name="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
            />
          </div>

          <div className="space-y-2">
            <Label>Message</Label>
            <RichEmailEditor
              value={body}
              onChange={setBody}
              placeholder="Write your email… use {{first_name}}, {{company}} for merge tags."
            />
          </div>

          {state.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}

          <SheetFooter>
            <Button type="submit" disabled={pending || !contactId}>
              <Send className="size-4" /> {pending ? "Sending…" : "Send email"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
