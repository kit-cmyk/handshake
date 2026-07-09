"use client";

import * as React from "react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  updateProfile,
  updateEmail,
  updatePasswordSettings,
  updateAvatar,
  removeAvatar,
  type AccountState,
} from "./account-actions";

function Status({ state }: { state: AccountState }) {
  return (
    <div aria-live="polite">
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.message && (
        <p className="text-sm text-green-600">{state.message}</p>
      )}
    </div>
  );
}

export function AvatarForm({
  avatarSrc,
  hasUpload,
}: {
  avatarSrc: string;
  hasUpload: boolean;
}) {
  const [state, action, pending] = useActionState<AccountState, FormData>(
    updateAvatar,
    {}
  );
  const [preview, setPreview] = React.useState<string | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- data URI / Supabase URL / object URL preview */}
        <img
          src={preview ?? avatarSrc}
          alt="Your avatar"
          className="size-16 shrink-0 rounded-full border border-border bg-muted object-cover"
        />
        <div className="space-y-2">
          <form action={action} className="flex flex-wrap items-center gap-2">
            <Input
              type="file"
              name="avatar"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={(e) => {
                const f = e.target.files?.[0];
                setPreview(f ? URL.createObjectURL(f) : null);
              }}
              className="max-w-xs cursor-pointer file:mr-3 file:cursor-pointer file:border-0 file:bg-transparent file:text-sm file:font-medium"
            />
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Uploading…" : "Upload"}
            </Button>
          </form>
          {hasUpload && (
            <form action={removeAvatar}>
              <Button type="submit" size="sm" variant="ghost">
                Remove photo
              </Button>
            </form>
          )}
        </div>
      </div>
      <Status state={state} />
      <p className="text-xs text-muted-foreground">
        PNG, JPG, WEBP, or GIF, up to 2&nbsp;MB. Without a photo we generate a
        unique one for you.
      </p>
    </div>
  );
}

export function ProfileForm({ fullName }: { fullName: string }) {
  const [state, action, pending] = useActionState<AccountState, FormData>(
    updateProfile,
    {}
  );
  return (
    <form action={action} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="full_name">Full name</Label>
        <Input
          id="full_name"
          name="full_name"
          defaultValue={fullName}
          placeholder="Ada Lovelace"
          className="max-w-sm"
        />
      </div>
      <Status state={state} />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Save profile"}
      </Button>
    </form>
  );
}

export function EmailForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState<AccountState, FormData>(
    updateEmail,
    {}
  );
  return (
    <form action={action} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          defaultValue={email}
          className="max-w-sm"
        />
      </div>
      <Status state={state} />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? "Saving…" : "Change email"}
      </Button>
    </form>
  );
}

export function PasswordForm() {
  const [state, action, pending] = useActionState<AccountState, FormData>(
    updatePasswordSettings,
    {}
  );
  const ref = React.useRef<HTMLFormElement>(null);
  React.useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="space-y-3">
      <div className="grid max-w-sm gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="password">New password</Label>
          <Input id="password" name="password" type="password" minLength={6} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Confirm</Label>
          <Input id="confirm" name="confirm" type="password" minLength={6} />
        </div>
      </div>
      <Status state={state} />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? "Saving…" : "Change password"}
      </Button>
    </form>
  );
}
