import { requireContext } from "@/lib/context";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import {
  AvatarForm,
  ProfileForm,
  EmailForm,
  PasswordForm,
} from "../account-forms";
import { resolveAvatar } from "@/lib/avatar";

export default async function ProfileSettingsPage() {
  const { supabase, userId } = await requireContext();

  // select("*") stays resilient if the avatar_url migration hasn't run yet.
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  const fullName =
    (profile as { full_name: string | null } | null)?.full_name ?? "";
  const email = (profile as { email: string | null } | null)?.email ?? "";
  const avatarUrl =
    (profile as { avatar_url?: string | null } | null)?.avatar_url ?? null;
  const avatarSrc = resolveAvatar(userId, avatarUrl);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
          <CardDescription>How you appear to your team.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <AvatarForm avatarSrc={avatarSrc} hasUpload={Boolean(avatarUrl)} />
          <div className="border-t pt-6">
            <ProfileForm fullName={fullName} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account &amp; security</CardTitle>
          <CardDescription>Update your email and password.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <EmailForm email={email} />
          <div className="border-t pt-6">
            <PasswordForm />
          </div>
        </CardContent>
      </Card>
    </>
  );
}
