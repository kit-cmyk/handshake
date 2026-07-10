"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { Plus, Copy, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createInvite, revokeInvite, type TeamState } from "./team-actions";

export type Member = { name: string; email: string; role: string };
export type Invite = { id: string; email: string; role: string; token: string };

export function Team({
  members,
  invites,
}: {
  members: Member[];
  invites: Invite[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [state, action, pending] = useActionState<TeamState, FormData>(
    createInvite,
    {}
  );
  const [role, setRole] = React.useState("member");

  React.useEffect(() => {
    if (state.ok) {
      // Reacts to a form-submit result; the effect is required for router.refresh().
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpen(false);
      setRole("member");
      router.refresh();
    }
  }, [state, router]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Members</h3>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button size="sm">
              <Plus className="size-4" /> Invite teammate
            </Button>
          </SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Invite a teammate</SheetTitle>
            </SheetHeader>
            <form action={action} className="space-y-4">
              <input type="hidden" name="role" value={role} />
              <div className="space-y-2">
                <Label htmlFor="invite-email">Email</Label>
                <Input
                  id="invite-email"
                  name="email"
                  type="email"
                  placeholder="teammate@company.com"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">Member</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {state.error && (
                <p className="text-sm text-destructive">{state.error}</p>
              )}
              <SheetFooter>
                <Button type="submit" disabled={pending}>
                  {pending ? "Sending…" : "Send invite"}
                </Button>
              </SheetFooter>
            </form>
          </SheetContent>
        </Sheet>
      </div>

      <ul className="divide-y rounded-lg border">
        {members.map((m, i) => (
          <li key={i} className="flex items-center gap-3 px-3 py-2.5">
            <div className="flex-1">
              <p className="text-sm font-medium">
                {m.name || m.email || "Member"}
              </p>
              {m.email && (
                <p className="text-xs text-muted-foreground">{m.email}</p>
              )}
            </div>
            <Badge variant="secondary">{m.role}</Badge>
          </li>
        ))}
      </ul>

      {invites.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-medium">Pending invitations</h3>
          <ul className="divide-y rounded-lg border">
            {invites.map((inv) => (
              <InviteRow
                key={inv.id}
                invite={inv}
                onRevoke={async () => {
                  await revokeInvite(inv.id);
                  router.refresh();
                }}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function InviteRow({
  invite,
  onRevoke,
}: {
  invite: Invite;
  onRevoke: () => void | Promise<void>;
}) {
  const [copied, setCopied] = React.useState(false);

  function copy() {
    const link = `${window.location.origin}/invite/${invite.token}`;
    navigator.clipboard?.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <li className="flex items-center gap-3 px-3 py-2.5">
      <div className="flex-1">
        <p className="text-sm">{invite.email}</p>
        <p className="text-xs text-muted-foreground">invited as {invite.role}</p>
      </div>
      <Button variant="ghost" size="sm" onClick={copy}>
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        {copied ? "Copied" : "Copy link"}
      </Button>
      <ConfirmDialog
        trigger={
          <Button variant="ghost" size="icon" className="size-8">
            <X className="size-4" />
          </Button>
        }
        title="Revoke invitation?"
        description={`${invite.email} will no longer be able to join with this link.`}
        confirmLabel="Revoke"
        pendingLabel="Revoking…"
        onConfirm={onRevoke}
      />
    </li>
  );
}
