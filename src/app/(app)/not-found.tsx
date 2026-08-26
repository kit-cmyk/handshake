import { MapPinOff } from "lucide-react";
import { StatusScreen } from "@/components/status-screen";
import { NavButton } from "@/components/nav-button";

export default function AppNotFound() {
  return (
    <StatusScreen
      icon={MapPinOff}
      code="404"
      title="Nothing to see here"
      description="That record may have been deleted, or it never existed. Let's get you back to something real."
    >
      <NavButton to="dashboard" variant="default" label="Back to dashboard" />
      <NavButton to="contacts" />
    </StatusScreen>
  );
}
