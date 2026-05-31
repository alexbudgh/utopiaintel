ALTER TABLE rob_ops
  ADD COLUMN IF NOT EXISTS arson_building VARCHAR(64) NULL,
  ADD COLUMN IF NOT EXISTS target_game_id INT NULL,
  ADD COLUMN IF NOT EXISTS thieves_sent INT NULL;

ALTER TABLE sorcery_ops
  ADD COLUMN IF NOT EXISTS target_game_id INT NULL;

ALTER TABLE provinces
  ADD COLUMN IF NOT EXISTS external_id INT NULL;

ALTER TABLE provinces
  ADD UNIQUE INDEX IF NOT EXISTS uq_provinces_external_id (external_id);
