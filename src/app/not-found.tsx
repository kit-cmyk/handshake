import Link from "next/link";
import { Compass, Home } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { StatusScreen } from "@/components/status-screen";

export default function NotFound() {
  return (
    <StatusScreen
      icon={Compass}
      code="404"
      title="This page wandered off"
      description="We looked everywhere, shook a few hands, and still couldn't find it. The link may be broken or the page may have moved."
    >
      <Link href="/" className={buttonVariants()}>
        <Home className="size-4" /> Take me home
      </Link>
    </StatusScreen>
  );
}
