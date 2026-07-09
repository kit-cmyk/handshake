# Handshake — Product Context Summary
Status: DRAFT for review | Date: 2026-07-08 | KB Backend: not yet set (pending)

## Product Purpose
Handshake is an outbound sales CRM that helps agencies and service businesses
**close deals/contracts with local businesses**. It runs the full loop:
acquire targeted leads (by industry + location) → organize them → reach them via
multi-step campaigns → automate follow-up → measure what converts.

It is an *active* sales engine (Apollo + Instantly + HubSpot Sequences, condensed),
not a passive system of record.

## Primary Users / Personas
Handshake serves two persona types with the same core loop:

1. **Local-services seller (primary)** — agency or service provider (marketing
   agency, IT/MSP, contractor, consultant) selling services to **local businesses**
   (dentists, restaurants, trades, clinics). Leads sourced via **Google Places**.
2. **B2B seller** — SDR/AE or founder selling software/services to **other companies**
   nationally, targeting by firmographics (industry, size, role/title). Leads come
   via **manual upload/import** now (own lists, exports) and an optional **B2B data
   provider** (Apollo/PDL) later.

- Core need (both): a repeatable pipeline of qualified prospects and the tooling to
  convert them into signed contracts.
- The data model is **persona-agnostic**: companies carry firmographics for B2B and
  local attributes for local-services; contacts support full person-level fields.

## Primary Modules
| Module | Responsibility |
|--------|---------------|
| Lead Management | Contacts + companies, ownership, lifecycle, pipeline/deals, activities |
| Manual Contact Upload | First-class import: CSV/spreadsheet upload with column mapping, dedupe, validation, and single manual add — the primary lead source for the B2B persona |
| Lead Scraping | Acquire local businesses by industry/category + location via Google Places (local-services persona) |
| Segments | Static lists + dynamic (query-based, auto-updating) audiences |
| Campaigns | Multi-step outreach sequences (email first), enrollment from segments |
| Automated Workflows | Trigger-based automation (if X then Y) via a visual builder |
| Campaign Funnel Reports | Per-step conversion: sent → opened → clicked → replied → booked |
| Workflow Reports | Per-workflow enrollment, per-node completion, conversion, time-in-step |

## Key Business Rules
- Every record is scoped to an **organization** (multi-tenant, Supabase RLS).
- **Dynamic segments** auto-update as new/changed contacts match their filter.
- Campaigns and workflows **target segments**, so segments must exist first.
- Cold outreach sends from **per-user connected mailboxes** (deliverability), not a shared domain.
- All send/open/click/reply and workflow step executions write to one append-only
  **events** table — the single source of truth for both report types.

## Technical Constraints
- **Google Places ToS**: store `place_id` (allowed long-term) and re-fetch dynamic
  content; do not warehouse restricted Places content beyond permitted windows.
  Places does **not** return email → an **enrichment step** is required (website
  scrape for public email and/or a provider like Hunter).
- **Durable job execution** is mandatory for campaign delays/sends and workflow
  runs — use Inngest, never cron-and-hope.
- **Deliverability**: mailbox warm-up, throttling, unsubscribe handling, SPF/DKIM.

## Out of Scope (v1)
- Multi-channel beyond email (SMS, LinkedIn) — v2
- A/B testing on steps, AI reply drafting, deal forecasting — v2
- Custom/web scraping beyond Google Places — not planned
- Automated B2B data provider (Apollo/PDL) enrichment — v1 covers B2B via manual
  upload; provider integration is a fast-follow (see E4 optional task)

## Open Questions
- KB backend: Confluence, Google Drive, or both? (pending)
- Email sending provider: Resend vs Postmark for transactional; Nylas vs direct
  Gmail/Outlook OAuth for user mailboxes? (decide during E5)
- Enrichment provider for emails: website-scrape only vs Hunter/PDL add-on? (decide during E4)
