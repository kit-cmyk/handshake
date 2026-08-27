/**
 * The workspace records people can erase from Settings ▸ Data.
 *
 * The array order is also the order the "delete everything" sweep runs in, and
 * that order matters: `deals_contact_or_company_chk` requires every deal to
 * keep at least one party, and deleting a contact or company SET-NULLs its side
 * of that link. So `contacts` drops the deals that would be left party-less
 * before deleting the contacts, and `companies` does the same afterwards for
 * the deals that just lost their contact. Everything else is cleaned up by the
 * `on delete cascade` foreign keys, which is why most datasets are one step.
 */
export type DatasetKey =
  | "contacts"
  | "companies"
  | "deals"
  | "activities"
  | "inbox"
  | "campaigns"
  | "workflows"
  | "segments"
  | "templates"
  | "events"
  | "suppressions"
  | "history";

/** Narrows a step to rows where a column is (or isn't) null. */
export type DeleteFilter = { column: string; isNull: boolean };

export type DeleteStep = {
  table: string;
  filters?: DeleteFilter[];
};

export type Dataset = {
  key: DatasetKey;
  label: string;
  /** What the delete takes with it, shown under the label. */
  description: string;
  /** Tables whose org-scoped rows are summed into the row's count. */
  countTables: string[];
  /** Deletes to run, in order — later steps depend on earlier ones. */
  steps: DeleteStep[];
};

export const DATASETS: Dataset[] = [
  {
    key: "contacts",
    label: "Contacts",
    description:
      "People, plus their conversations, campaign enrolments, workflow runs, segment membership, and contact-only deals.",
    countTables: ["contacts"],
    steps: [
      {
        table: "deals",
        filters: [
          { column: "contact_id", isNull: false },
          { column: "company_id", isNull: true },
        ],
      },
      { table: "contacts" },
    ],
  },
  {
    key: "companies",
    label: "Companies",
    description:
      "Organizations and their company-only deals. Contacts stay, but lose the company they were linked to.",
    countTables: ["companies"],
    steps: [
      {
        table: "deals",
        filters: [
          { column: "company_id", isNull: false },
          { column: "contact_id", isNull: true },
        ],
      },
      { table: "companies" },
    ],
  },
  {
    key: "deals",
    label: "Deals",
    description:
      "Every deal on every pipeline, and the notes and tasks logged against them. Your stages are kept.",
    countTables: ["deals"],
    steps: [{ table: "deals" }],
  },
  {
    key: "activities",
    label: "Activities",
    description: "Calls, notes, tasks, and logged emails on contacts and deals.",
    countTables: ["activities"],
    steps: [{ table: "activities" }],
  },
  {
    key: "inbox",
    label: "Conversations",
    description: "Inbox threads and every message in them, inbound and outbound.",
    countTables: ["conversations"],
    steps: [{ table: "conversations" }],
  },
  {
    key: "campaigns",
    label: "Campaigns",
    description: "Campaigns with their sequence steps and enrolments.",
    countTables: ["campaigns"],
    steps: [{ table: "campaigns" }],
  },
  {
    key: "workflows",
    label: "Workflows",
    description: "Workflows with their run history.",
    countTables: ["workflows"],
    steps: [{ table: "workflows" }],
  },
  {
    key: "segments",
    label: "Segments",
    description:
      "Saved segments and their membership. Campaigns built on one keep running against nobody.",
    countTables: ["segments"],
    steps: [{ table: "segments" }],
  },
  {
    key: "templates",
    label: "Templates",
    description: "Saved email, campaign, and workflow templates.",
    countTables: ["templates"],
    steps: [{ table: "templates" }],
  },
  {
    key: "events",
    label: "Engagement events",
    description:
      "Sends, opens, clicks, replies, and bounces. Reports and funnels are built from these, so clearing them empties your history.",
    countTables: ["events"],
    steps: [{ table: "events" }],
  },
  {
    key: "suppressions",
    label: "Suppression list",
    description:
      "Addresses blocked from sending. Deleting these lets unsubscribed people be emailed again.",
    countTables: ["suppressions"],
    steps: [{ table: "suppressions" }],
  },
  {
    key: "history",
    label: "Import & sync history",
    description:
      "Import batches, lead-finder searches, and CRM sync runs. The records they created are untouched.",
    countTables: ["import_batches", "scrape_jobs", "crm_sync_runs"],
    steps: [
      { table: "import_batches" },
      { table: "scrape_jobs" },
      { table: "crm_sync_runs" },
    ],
  },
];

export function findDataset(key: string): Dataset | undefined {
  return DATASETS.find((d) => d.key === key);
}

/** Every table counted across all datasets, deduped for one query each. */
export const COUNTED_TABLES: string[] = [
  ...new Set(DATASETS.flatMap((d) => d.countTables)),
];
