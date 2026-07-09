import { redirect } from "next/navigation";
import { getActiveOrg } from "@/lib/org";
import { OnboardingForm } from "./onboarding-form";

export default async function OnboardingPage() {
  // If the user already has an org, skip onboarding.
  const org = await getActiveOrg();
  if (org) redirect("/dashboard");

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold tracking-tight">
            Create your workspace
          </h1>
          <p className="text-sm text-muted-foreground">
            This is where your leads, campaigns, and deals live.
          </p>
        </div>
        <OnboardingForm />
      </div>
    </div>
  );
}
