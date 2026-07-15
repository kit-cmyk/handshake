import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { signout } from "@/app/(auth)/actions";
import { acceptInvite } from "./actions";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold tracking-tight">Handshake</h1>
        </div>
        {children}
      </div>
    </div>
  );
}

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const admin = createAdminClient();
  const { data: invite } = await admin
    .from("invitations")
    .select("email, role, status, org_id, expires_at")
    .eq("token", token)
    .maybeSingle();

  const expired =
    !!invite?.expires_at && new Date(invite.expires_at as string) <= new Date();

  if (!invite || invite.status !== "pending" || expired) {
    return (
      <Shell>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Invitation not available</CardTitle>
            <CardDescription>
              This invitation is invalid, expired, or already used.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Link href="/login" className={buttonVariants({ variant: "outline" })}>
              Go to sign in
            </Link>
          </CardFooter>
        </Card>
      </Shell>
    );
  }

  const { data: orgRow } = await admin
    .from("organizations")
    .select("name")
    .eq("id", invite.org_id)
    .maybeSingle();
  const orgName = orgRow?.name ?? "a workspace";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Not signed in → route through auth, returning here afterward.
  if (!user) {
    return (
      <Shell>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Join {orgName}</CardTitle>
            <CardDescription>
              You&apos;ve been invited as {invite.role}. Sign in or create an
              account with <strong>{invite.email}</strong> to accept.
            </CardDescription>
          </CardHeader>
          <CardFooter className="flex flex-col gap-2">
            <Link
              href={`/signup?next=/invite/${token}`}
              className={buttonVariants() + " w-full"}
            >
              Create account
            </Link>
            <Link
              href={`/login?next=/invite/${token}`}
              className={buttonVariants({ variant: "outline" }) + " w-full"}
            >
              Sign in
            </Link>
          </CardFooter>
        </Card>
      </Shell>
    );
  }

  // Signed in as the wrong account.
  if ((user.email ?? "").toLowerCase() !== invite.email.toLowerCase()) {
    return (
      <Shell>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Wrong account</CardTitle>
            <CardDescription>
              This invitation is for <strong>{invite.email}</strong>, but
              you&apos;re signed in as {user.email}. Sign out and use the invited
              email.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <form action={signout}>
              <Button type="submit" variant="outline">
                Sign out
              </Button>
            </form>
          </CardFooter>
        </Card>
      </Shell>
    );
  }

  // Signed in as the invited user → accept.
  const accept = acceptInvite.bind(null, token);
  return (
    <Shell>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Join {orgName}</CardTitle>
          <CardDescription>
            You&apos;ve been invited as {invite.role}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={accept}>
            <Button type="submit" className="w-full">
              Accept invitation
            </Button>
          </form>
        </CardContent>
      </Card>
    </Shell>
  );
}
