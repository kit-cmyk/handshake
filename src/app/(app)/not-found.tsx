import Link from "next/link";
import { MapPinOff, LayoutDashboard } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { StatusScreen } from "@/components/status-screen";

export default function AppNotFound() {
  return (
    <StatusScreen
      icon={MapPinOff}
      code="404"
      title="Nothing to see here"
      description="That record may have been deleted, or it never existed. Let's get you back to something real."
    >
      <Link href="/dashboard" className={buttonVariants()}>
        <LayoutDashboard className="size-4" /> Back to dashboard
      </Link>
      <Link
        href="/contacts"
        className={buttonVariants({ variant: "outline" })}
      >
        View contacts
      </Link>
    </StatusScreen>
  );
}
