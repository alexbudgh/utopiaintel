ALTER TABLE rob_ops
  ADD COLUMN IF NOT EXISTS wizards_assassinated INT NULL AFTER deserter_type,
  ADD COLUMN IF NOT EXISTS prisoners_freed INT NULL AFTER wizards_assassinated,
  ADD COLUMN IF NOT EXISTS prisoners_captured INT NULL AFTER prisoners_freed;
