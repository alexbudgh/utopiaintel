ALTER TABLE rob_ops
  ADD COLUMN IF NOT EXISTS game_date VARCHAR(64) NULL,
  ADD COLUMN IF NOT EXISTS game_date_ord INT NULL;

ALTER TABLE sorcery_ops
  ADD COLUMN IF NOT EXISTS game_date VARCHAR(64) NULL,
  ADD COLUMN IF NOT EXISTS game_date_ord INT NULL;

ALTER TABLE attack_ops
  ADD COLUMN IF NOT EXISTS game_date VARCHAR(64) NULL,
  ADD COLUMN IF NOT EXISTS game_date_ord INT NULL;

ALTER TABLE intel_ops
  ADD COLUMN IF NOT EXISTS game_date VARCHAR(64) NULL,
  ADD COLUMN IF NOT EXISTS game_date_ord INT NULL;

CREATE INDEX IF NOT EXISTS idx_rob_ops_game_date
  ON rob_ops(key_hash, target_kingdom, game_date_ord);

CREATE INDEX IF NOT EXISTS idx_sorcery_ops_game_date
  ON sorcery_ops(key_hash, target_kingdom, game_date_ord);

CREATE INDEX IF NOT EXISTS idx_attack_ops_game_date
  ON attack_ops(key_hash, target_kingdom, game_date_ord);

CREATE INDEX IF NOT EXISTS idx_intel_ops_game_date
  ON intel_ops(key_hash, target_kingdom, game_date_ord);
