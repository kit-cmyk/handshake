-- Handshake — geocoordinates for companies, so prospected businesses can be
-- plotted on a map and filtered by radius.

alter table companies
  add column if not exists latitude  double precision,
  add column if not exists longitude double precision;

-- Bounding-box scans for map viewports.
create index if not exists companies_org_geo_idx
  on companies(org_id, latitude, longitude);
