import Link from "next/link";
import { LinkIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { StatusScreen } from "@/components/status-screen";

export default async function ErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const { message } = await searchParams;
  return (
    <StatusScreen
      icon={LinkIcon}
      title="That link fizzled out"
      description={
        message
          ? decodeURIComponent(message)
          : "This link may have expired or already been used. No worries — you can start over below."
      }
    >
      <Link href="/login" className={buttonVariants()}>
        Back to sign in
      </Link>
      <Link
        href="/forgot-password"
        className={buttonVariants({ variant: "outline" })}
      >
        Reset password
      </Link>
    </StatusScreen>
  );
}
