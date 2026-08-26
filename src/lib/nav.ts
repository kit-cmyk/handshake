import {
  LayoutDashboard,
  Inbox,
  Radar,
  Users,
  Building2,
  KanbanSquare,
  ListFilter,
  Send,
  Workflow,
  LayoutTemplate,
  BarChart3,
  Settings,
  UploadCloud,
  Search,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";

/**
 * Every place the app can navigate to, in one registry. The sidebar, dashboard
 * quick actions, page headers, and the cross-feature buttons (`NavButton`,
 * `BackLink`) all read from here, so a route, label, or icon is defined once
 * and can't drift between the surfaces that link to it.
 */
export type NavKey =
  | "dashboard"
  | "inbox"
  | "leads"
  | "contacts"
  | "companies"
  | "pipeline"
  | "segments"
  | "campaigns"
  | "workflows"
  | "templates"
  | "reports"
  | "settings"
  | "import"
  | "search"
  | "dataHealth";

export type Destination = {
  href: string;
  /** Label for nav items and buttons pointing here. */
  label: string;
  icon: LucideIcon;
  /** One-line summary, used as the page description and in nav hints. */
  description: string;
  /** Text for a "back" link returning here. */
  backLabel: string;
};

export const DESTINATIONS: Record<NavKey, Destination> = {
  dashboard: {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    description: "Your workspace at a glance.",
    backLabel: "Back to dashboard",
  },
  inbox: {
    href: "/inbox",
    label: "Inbox",
    icon: Inbox,
    description:
      "Every conversation, activity, and pipeline move — in one place.",
    backLabel: "Back to inbox",
  },
  leads: {
    href: "/leads",
    label: "Find leads",
    icon: Radar,
    description:
      "Search local businesses by industry and location, or find people by role and company — reviewed and imported straight into your CRM.",
    backLabel: "Back to lead search",
  },
  contacts: {
    href: "/contacts",
    label: "Contacts",
    icon: Users,
    description: "People in your pipeline.",
    backLabel: "Back to contacts",
  },
  companies: {
    href: "/companies",
    label: "Companies",
    icon: Building2,
    description: "Accounts you're targeting.",
    backLabel: "Back to companies",
  },
  pipeline: {
    href: "/pipeline",
    label: "Pipeline",
    icon: KanbanSquare,
    description: "Move deals toward the close.",
    backLabel: "Back to pipeline",
  },
  segments: {
    href: "/segments",
    label: "Segments",
    icon: ListFilter,
    description: "Static lists and dynamic, auto-updating audiences.",
    backLabel: "Back to segments",
  },
  campaigns: {
    href: "/campaigns",
    label: "Campaigns",
    icon: Send,
    description: "Multi-step outreach sequences.",
    backLabel: "Back to campaigns",
  },
  workflows: {
    href: "/workflows",
    label: "Workflows",
    icon: Workflow,
    description: "Trigger-based automations.",
    backLabel: "Back to workflows",
  },
  templates: {
    href: "/templates",
    label: "Templates",
    icon: LayoutTemplate,
    description:
      "Reusable starting points for emails, campaigns, and workflows. Pick a curated template or one your team saved.",
    backLabel: "Back to templates",
  },
  reports: {
    href: "/reports",
    label: "Reports",
    icon: BarChart3,
    description: "Track opens, clicks, and replies.",
    backLabel: "Back to reports",
  },
  settings: {
    href: "/settings",
    label: "Settings",
    icon: Settings,
    description: "Workspace, team, and integrations.",
    backLabel: "Back to settings",
  },
  import: {
    href: "/import",
    label: "Import CSV",
    icon: UploadCloud,
    description:
      "Upload a CSV of contacts or companies — map columns, dedupe, and import.",
    backLabel: "Back to import",
  },
  search: {
    href: "/search",
    label: "Search",
    icon: Search,
    description: "Contacts, companies, and deals matching your query.",
    backLabel: "Back to search",
  },
  dataHealth: {
    href: "/contacts/issues",
    label: "Resolve issues",
    icon: ShieldAlert,
    description:
      "Contacts missing an email, holding an invalid address, or duplicated across your CRM.",
    backLabel: "Back to data health",
  },
};

/** Sidebar order — the app's primary destinations, in funnel order. */
export const PRIMARY_NAV: NavKey[] = [
  "dashboard",
  "inbox",
  "leads",
  "contacts",
  "companies",
  "pipeline",
  "segments",
  "campaigns",
  "workflows",
  "templates",
  "reports",
  "settings",
];
