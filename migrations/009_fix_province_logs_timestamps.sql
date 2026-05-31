-- Fix received_at for province_logs-sourced rows, which were stored with a
-- synthetic 2000-epoch timestamp. Map game_date_ord to the real-world hour
-- (Age 115 start: 2026-04-28 18:00:00 UTC), preserving seconds as the
-- within-tick position index.
--
-- Two passes: first rows where game_date_ord is already stored, then rows
-- where it is NULL but can be recovered from the 2000-epoch timestamp itself.

UPDATE rob_ops
SET received_at = DATE_ADD(
      DATE_ADD('2026-04-28 18:00:00', INTERVAL game_date_ord HOUR),
      INTERVAL SECOND(received_at) SECOND),
    source = 'province_logs'
WHERE received_at < '2010-01-01'
  AND game_date_ord IS NOT NULL;

UPDATE rob_ops
SET received_at = DATE_ADD(
      DATE_ADD('2026-04-28 18:00:00',
               INTERVAL TIMESTAMPDIFF(HOUR, '2000-01-01', received_at) HOUR),
      INTERVAL SECOND(received_at) SECOND),
    source = 'province_logs'
WHERE received_at < '2010-01-01'
  AND game_date_ord IS NULL;

UPDATE sorcery_ops
SET received_at = DATE_ADD(
      DATE_ADD('2026-04-28 18:00:00', INTERVAL game_date_ord HOUR),
      INTERVAL SECOND(received_at) SECOND),
    source = 'province_logs'
WHERE received_at < '2010-01-01'
  AND game_date_ord IS NOT NULL;

UPDATE sorcery_ops
SET received_at = DATE_ADD(
      DATE_ADD('2026-04-28 18:00:00',
               INTERVAL TIMESTAMPDIFF(HOUR, '2000-01-01', received_at) HOUR),
      INTERVAL SECOND(received_at) SECOND),
    source = 'province_logs'
WHERE received_at < '2010-01-01'
  AND game_date_ord IS NULL;

UPDATE attack_ops
SET received_at = DATE_ADD(
      DATE_ADD('2026-04-28 18:00:00', INTERVAL game_date_ord HOUR),
      INTERVAL SECOND(received_at) SECOND),
    source = 'province_logs'
WHERE received_at < '2010-01-01'
  AND game_date_ord IS NOT NULL;

UPDATE attack_ops
SET received_at = DATE_ADD(
      DATE_ADD('2026-04-28 18:00:00',
               INTERVAL TIMESTAMPDIFF(HOUR, '2000-01-01', received_at) HOUR),
      INTERVAL SECOND(received_at) SECOND),
    source = 'province_logs'
WHERE received_at < '2010-01-01'
  AND game_date_ord IS NULL;
