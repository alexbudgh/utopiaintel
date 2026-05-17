CREATE INDEX IF NOT EXISTS idx_provinces_kingdom_id
  ON provinces(kingdom, id);

CREATE INDEX IF NOT EXISTS idx_overview_prov_key_time
  ON province_overview(province_id, key_hash, received_at);

ALTER TABLE province_status
  ADD COLUMN IF NOT EXISTS kingdom VARCHAR(64) NULL AFTER province_id;

UPDATE province_status ps
JOIN provinces p ON p.id = ps.province_id
SET ps.kingdom = p.kingdom
WHERE ps.kingdom IS NULL;

CREATE INDEX IF NOT EXISTS idx_status_key_kingdom_time_source
  ON province_status(key_hash, kingdom, received_at DESC, id DESC, source);

CREATE INDEX IF NOT EXISTS idx_kingdom_key_loc_time
  ON kingdom_intel(key_hash, location, received_at DESC, id DESC);
