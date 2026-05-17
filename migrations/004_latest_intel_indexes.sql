CREATE INDEX IF NOT EXISTS idx_provinces_kingdom_id
  ON provinces(kingdom, id);

CREATE INDEX IF NOT EXISTS idx_overview_prov_key_time
  ON province_overview(province_id, key_hash, received_at);

CREATE INDEX IF NOT EXISTS idx_status_prov_key_time_source
  ON province_status(province_id, key_hash, received_at DESC, id DESC, source);

CREATE INDEX IF NOT EXISTS idx_kingdom_key_loc_time
  ON kingdom_intel(key_hash, location, received_at DESC, id DESC);
