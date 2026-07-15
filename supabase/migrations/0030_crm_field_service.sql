-- Handshake — field-service CRM connectors (Jobber, Housecall Pro, ServiceTitan,
-- QuickBooks). Extends the CRM-sync scaffold from 0029 to the OAuth providers the
-- product targets for the local-services seller persona.
--
-- Unlike the token-paste connectors from 0029 (HubSpot/Pipedrive/Salesforce/Zoho),
-- these use OAuth 2.0. The resulting tokens are stored ENCRYPTED (AES-256-GCM,
-- see src/lib/crm/crypto.ts) inside org_integrations.config alongside any
-- provider-specific ids (QuickBooks realm_id, ServiceTitan tenant_id). A
-- connection made with no OAuth client configured in the environment stores no
-- token and falls back to the deterministic mock provider, so the connect + sync
-- flow is exercisable in dev without real credentials.

alter table org_integrations drop constraint if exists org_integrations_type_check;
alter table org_integrations add constraint org_integrations_type_check
  check (type in (
    'slack',
    'hubspot', 'pipedrive', 'salesforce', 'zoho',
    'jobber', 'housecall', 'servicetitan', 'quickbooks'
  ));

alter table crm_sync_runs drop constraint if exists crm_sync_runs_provider_check;
alter table crm_sync_runs add constraint crm_sync_runs_provider_check
  check (provider in (
    'hubspot', 'pipedrive', 'salesforce', 'zoho',
    'jobber', 'housecall', 'servicetitan', 'quickbooks'
  ));
