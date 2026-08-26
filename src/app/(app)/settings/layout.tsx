import { PageHeader } from "@/components/page-header";
import { DESTINATIONS } from "@/lib/nav";
import { SettingsNav } from "./settings-nav";

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      <PageHeader
        title={DESTINATIONS.settings.label}
        description="Manage your account, workspace, team, and integrations."
      />

      <div className="grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <SettingsNav />
        </aside>
        <div className="min-w-0 space-y-6">{children}</div>
      </div>
    </div>
  );
}
