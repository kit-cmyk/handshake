-- Handshake — structured, international-friendly contact address.
-- The existing contacts.address column (added in 0016) is now the street line;
-- these columns break out the rest so addresses work outside the US too.

alter table contacts
  add column if not exists address_line2 text,   -- apt / suite / unit
  add column if not exists city          text,
  add column if not exists region        text,   -- state / province / region
  add column if not exists postal_code   text,   -- ZIP / postcode
  add column if not exists country       text;
