-- Handshake — add contact business fields.
-- Lead Source and Address are set at creation (optional).
-- Appointment Date is set later (not on creation) but surfaces in list/detail.
-- "Date Added" is derived from the existing contacts.created_at column.

alter table contacts
  add column if not exists lead_source      text,
  add column if not exists address          text,
  add column if not exists appointment_date date;

-- Filter/sort helper for upcoming appointments.
create index if not exists contacts_org_appointment_idx
  on contacts(org_id, appointment_date);
