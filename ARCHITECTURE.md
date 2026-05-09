# Architecture

This document captures storage and identity rules that are easy to forget when
working on ingest, replay, or kingdom table queries.

## Source Tables and Read Model

Intel is stored by source and timestamp rather than as one mutable province
snapshot. Read queries reconstruct the best current view from the newest
available source rows.

Source-of-truth rules used by the kingdom table and province detail include:

- SoT is authoritative for total unit counts, peasants, total military points,
  most enemy resources, race, personality, honor, land, and networth.
- SoM is authoritative for home troops, OME/DME, outgoing armies, and army
  training details.
- `council_state` provides direct self population values when available, but
  does not replace race, personality, or honor from SoT.
- `build` and `train_army` provide self-only free credits that are preserved even
  when later SoT rows omit them.
- Kingdom page rows provide snapshot-level race, honor, land, networth, and slot
  data, but do not expose personality.

Some overview fields are read independently as the latest non-null value. This
prevents later partial rows, such as state rows with null race/personality/honor,
from shadowing previously known values.

Derived metrics such as modified TPA/WPA and population estimates require
compatible same-tick inputs where mixing stale and fresh source rows would be
misleading. Cached metric values are preserved when the current retained history
is not enough to reconstruct them.

## Province Identity

Province identity is stored in the `provinces` table. The stable application
identity is the `(name, kingdom)` pair, and SQLite assigns the integer `id` when
that pair is first inserted.

Most province-scoped writes call `ensureProvince(db, name, kingdom)` before
storing intel. It performs:

```sql
INSERT OR IGNORE INTO provinces (name, kingdom) VALUES (?, ?);
SELECT id FROM provinces WHERE name = ? AND kingdom = ?;
```

Implications:

- The same province name in the same kingdom reuses the same `province_id`.
- The same province name in a different kingdom gets a different `province_id`.
- A reset or rename creates a new `province_id` because the name changed.
- Old province names remain in `provinces`; read queries decide whether they are
  still current.
- Self-intel pages that omit kingdom first try to reuse an existing row with the
  same name and a non-empty kingdom before creating a blank-kingdom identity.

## Intel Partitions

`intel_partitions` is the visibility table for hashed intel keys. It records
that a key shard has submitted or may read a province:

```sql
key_hash TEXT
province_id INTEGER
UNIQUE(key_hash, province_id)
```

`recordSubmission(db, keyHash, provinceId)` writes this table. It is called by
province-scoped ingest paths such as SoT, SoM, SoD, Infiltrate, Survey, State,
Build, Train Army, and each province row from a Kingdom page.

Important: a row in `intel_partitions` is access metadata only. It does not mean
that current displayable intel exists for that province. Displayable data lives
in source tables such as:

- `province_overview`
- `province_resources`
- `province_troops`
- `kingdom_provinces`
- `survey_intel`
- `sos_intel`

Read queries should not treat partition membership alone as enough to render a
province row.

## Authentication and Kingdom Binding

Users sign in with a shared kingdom key. The login flow stores the raw key in an
HTTP-only cookie, but storage and read queries use `hashKey(rawKey)` as
`key_hash`.

Submitted intel payloads also include the raw key. The ingest route hashes it
before storing source rows, recording `intel_partitions`, or checking access.

A self `/wol/game/throne` submission is the authoritative source for binding a
key shard to its home kingdom. The binding is stored separately from
`intel_partitions`; it supports conveniences such as redirecting login to the
bound kingdom and choosing the self kingdom for gains views.

## Kingdom Slots

Kingdom slot numbers are data from real `kingdom_details` pages. They are stored
in `kingdom_provinces.slot` with the kingdom snapshot row that produced them.
Do not infer slots from current table order.

The current slot holder is resolved from the latest kingdom snapshot for each
slot and key shard. This allows the app to hide old names after a reset or
rename when a slot has moved to a new province name.

The province table still preserves real SoT-only enemy intel when a province has
never appeared on a kingdom page. Those rows have no slot, but they must have an
actual overview row. Partition-only identities with no overview are hidden.

## Kingdom-Wide State

Dragon and ritual state are kingdom-wide, even though submitted pages are stored
against the province that supplied the observation.

For dragons, the current badge is read from the latest SoT or throne
`province_status` row for the kingdom and key shard. If that newest observation
does not include a dragon, older dragon rows are treated as stale.

For rituals, active ritual rows live in `province_effects`, but a page with no
ritual does not write a replacement ritual effect. The read model therefore
compares the latest ritual effect against the latest SoT or throne
`province_status` observation for the kingdom and key shard. Any newer
observation without a ritual clears the older ritual badge.

## Replay and Backfills

Debug-log replay routes historical payloads through the normal parser and store
functions. Modern debug entries include `key_hash`; replay can filter to a shard
with `--key-hash=<sha256>`.

Replay can expose stale identities already present in `provinces` and
`intel_partitions`. That is expected: replay should preserve shard visibility,
while read queries are responsible for requiring the source rows needed to render
current UI data.

## Metric Cache Refresh

The province table uses cached last-valid TPA/WPA values from `provinces` when
same-tick source rows are not currently reconstructable from retained history.
Those cache values are produced by `updateMetricsCache()`.

CPU profiles from production-like runs showed occasional spikes dominated by
synchronous SQLite `Statement#get` calls inside `updateMetricsCache()`, especially
when called from SoS and sorcery/resource writes. The expensive work is not
React rendering or recent-ops polling; it is same-tick metric reconstruction
queries joining historical source tables such as `province_resources`,
`province_overview`, `sos_intel`, `sos_sciences`, `survey_intel`,
`survey_buildings`, and `province_troops`.

Coalescing refreshes by `(province_id, key_hash)` can reduce duplicate work
during bursts because several writes for the same province collapse into one
pending refresh. The queue drains in small chunks and yields between chunks so a
large batch does not become one long event-loop block. This is still only a
mitigation: it moves refresh work out of the request transaction path and lowers
repeated recomputation, but it still runs the same expensive queries. Large
batches across many provinces can still consume CPU.

Longer-term improvements should focus on making the refresh itself cheaper or
less bursty:

- Add or adjust indexes for the exact metric-cache query shapes.
- Avoid recomputing unrelated metrics when a source type only affects one subset.
- Consider a background worker/job for cache refreshes instead of doing them in
  request processes.
- Consider storing tick-hour columns so same-tick joins can use normal indexed
  equality instead of timestamp expressions.
