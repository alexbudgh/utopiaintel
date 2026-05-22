-- Allow the nightly prune DELETE to use an index range scan instead of a full
-- table scan. Each table is pruned with WHERE received_at < cutoff, so a
-- standalone received_at index is required on every pruned table.

CREATE INDEX IF NOT EXISTS idx_province_overview_received_at
  ON province_overview(received_at);

CREATE INDEX IF NOT EXISTS idx_total_military_points_received_at
  ON total_military_points(received_at);

CREATE INDEX IF NOT EXISTS idx_home_military_points_received_at
  ON home_military_points(received_at);

CREATE INDEX IF NOT EXISTS idx_province_troops_received_at
  ON province_troops(received_at);

CREATE INDEX IF NOT EXISTS idx_province_resources_received_at
  ON province_resources(received_at);

CREATE INDEX IF NOT EXISTS idx_province_status_received_at
  ON province_status(received_at);

CREATE INDEX IF NOT EXISTS idx_military_intel_received_at
  ON military_intel(received_at);

CREATE INDEX IF NOT EXISTS idx_survey_intel_received_at
  ON survey_intel(received_at);

CREATE INDEX IF NOT EXISTS idx_sos_intel_received_at
  ON sos_intel(received_at);

CREATE INDEX IF NOT EXISTS idx_kingdom_intel_received_at
  ON kingdom_intel(received_at);

CREATE INDEX IF NOT EXISTS idx_kingdom_news_received_at
  ON kingdom_news(received_at);

CREATE INDEX IF NOT EXISTS idx_kingdom_news_sharded_received_at
  ON kingdom_news_sharded(received_at);

CREATE INDEX IF NOT EXISTS idx_rob_ops_received_at
  ON rob_ops(received_at);

CREATE INDEX IF NOT EXISTS idx_intel_ops_received_at
  ON intel_ops(received_at);

CREATE INDEX IF NOT EXISTS idx_sorcery_ops_received_at
  ON sorcery_ops(received_at);

CREATE INDEX IF NOT EXISTS idx_attack_ops_received_at
  ON attack_ops(received_at);
