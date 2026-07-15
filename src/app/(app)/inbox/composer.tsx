"use client";

import * as React from "react";
import { useActionState } from "react";
import { Send, StickyNote } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateTimePicker } from "@/components/ui/date-picker";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RichEmailEditor } from "@/components/rich-email-editor";
import {
  sendEmail,
  logActivity,
  type SendState,
  type ActivityState,
} from "./actions";

const LOG_TYPES = [
  { value: "note", label: "Note" },
  { value: "call", label: "Call" },
  { value: "task", label: "Task" },
  { value: "appointment", label: "Appointment" },
] as const;

type Mode = "reply" | "log";

export function Composer({
  conversationId,
  contactId,
  contactEmail,
  defaultSubject = "",
  onDone,
}: {
  conversationId: string;
  contactId: string;
  contactEmail: string | null;
  defaultSubject?: string;
  onDone: () => void;
}) {
  const [mode, setMode] = React.useState<Mode>(contactEmail ? "reply" : "log");

  return (
    <div className="border-t">
      <div className="flex gap-1 px-3 pt-2">
        <TabButton active={mode === "reply"} onClick={() => setMode("reply")}>
          <Send className="size-3.5" /> Reply
        </TabButton>
        <TabButton active={mode === "log"} onClick={() => setMode("log")}>
          <StickyNote className="size-3.5" /> Log activity
        </TabButton>
      </div>
      {mode === "reply" ? (
        <ReplyForm
          conversationId={conversationId}
          contactEmail={contactEmail}
          defaultSubject={defaultSubject}
          onDone={onDone}
        />
      ) : (
        <LogForm
          conversationId={conversationId}
          contactId={contactId}
          onDone={onDone}
        />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "bg-secondary text-secondary-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      )}
    >
      {children}
    </button>
  );
}

function ReplyForm({
  conversationId,
  contactEmail,
  defaultSubject,
  onDone,
}: {
  conversationId: string;
  contactEmail: string | null;
  defaultSubject: string;
  onDone: () => void;
}) {
  const action = sendEmail.bind(null, conversationId);
  const [state, formAction, pending] = useActionState<SendState, FormData>(
    action,
    {}
  );
  const [body, setBody] = React.useState("");
  const [subject, setSubject] = React.useState(defaultSubject);
  const formRef = React.useRef<HTMLFormElement>(null);

  React.useEffect(() => {
    if (state.ok) {
      // Reacts to a form-submit result; the effect is required for the onDone() call.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBody("");
      onDone();
    }
  }, [state, onDone]);

  if (!contactEmail) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        This contact has no email address. Add one on the contact record to send
        email, or use <span className="font-medium">Log activity</span>.
      </p>
    );
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-2 p-3">
      <input type="hidden" name="body" value={body} />
      <Input
        name="subject"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder="Subject"
        aria-label="Subject"
      />
      <RichEmailEditor
        value={body}
        onChange={setBody}
        placeholder="Write a reply… use {{first_name}}, {{company}} for merge tags."
      />
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">To: {contactEmail}</span>
        <Button type="submit" size="sm" disabled={pending}>
          <Send className="size-4" /> {pending ? "Sending…" : "Send email"}
        </Button>
      </div>
    </form>
  );
}

function LogForm({
  conversationId,
  contactId,
  onDone,
}: {
  conversationId: string;
  contactId: string;
  onDone: () => void;
}) {
  const action = logActivity.bind(null, conversationId, contactId);
  const [state, formAction, pending] = useActionState<ActivityState, FormData>(
    action,
    {}
  );
  const [type, setType] = React.useState<string>("note");

  React.useEffect(() => {
    if (state.ok) onDone();
  }, [state, onDone]);

  return (
    <form action={formAction} className="space-y-2 p-3">
      <input type="hidden" name="type" value={type} />
      <div className="flex gap-2">
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LOG_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(type === "task" || type === "appointment") && (
          <DateTimePicker
            name="due_at"
            placeholder={type === "appointment" ? "When" : "Due"}
            className="flex-1"
          />
        )}
      </div>
      <Textarea
        name="body"
        rows={3}
        placeholder={
          type === "task" ? "What needs doing?" : "Log a note, call, or update…"
        }
      />
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Log activity"}
        </Button>
      </div>
    </form>
  );
}
