// Shared metrics cache refresh queue infrastructure for MySQL writes.

const BATCH_DELAY_MS = 250;
const CHUNK_SIZE = 5;
const CHUNK_YIELD_MS = 0;

type UpdateFn = (
  provinceId: number,
  keyHash: string,
  receivedAt?: string | null,
) => Promise<void>;

function receivedAtMs(receivedAt: string | null): number {
  if (!receivedAt) return Number.NEGATIVE_INFINITY;
  const normalized = receivedAt.includes("T")
    ? receivedAt
    : `${receivedAt.replace(" ", "T")}Z`;
  const ms = Date.parse(normalized);
  return Number.isNaN(ms) ? Number.NEGATIVE_INFINITY : ms;
}

export function createMetricsCacheQueue(updateFn: UpdateFn) {
  let enabled = true;
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let flushPromise: Promise<void> | null = null;
  const pending = new Map<
    string,
    { provinceId: number; keyHash: string; receivedAt: string | null }
  >();

  function cacheKey(provinceId: number, keyHash: string) {
    return `${provinceId}\0${keyHash}`;
  }

  function takeChunk() {
    const chunk: {
      provinceId: number;
      keyHash: string;
      receivedAt: string | null;
    }[] = [];
    for (const [k, item] of pending) {
      pending.delete(k);
      chunk.push(item);
      if (chunk.length >= CHUNK_SIZE) break;
    }
    return chunk;
  }

  async function drain() {
    while (pending.size > 0) {
      for (const item of takeChunk()) {
        await updateFn(item.provinceId, item.keyHash, item.receivedAt);
      }
      if (pending.size > 0)
        await new Promise<void>((resolve) =>
          setTimeout(resolve, CHUNK_YIELD_MS),
        );
    }
  }

  function scheduleFlush() {
    if (flushPromise || flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      void flush();
    }, BATCH_DELAY_MS);
    flushTimer.unref?.();
  }

  function queue(
    provinceId: number,
    keyHash: string,
    receivedAt?: string | null,
  ) {
    if (!enabled) return;
    const k = cacheKey(provinceId, keyHash);
    const trig = receivedAt ?? new Date().toISOString();
    const existing = pending.get(k);
    if (!existing || receivedAtMs(trig) > receivedAtMs(existing.receivedAt)) {
      pending.set(k, { provinceId, keyHash, receivedAt: trig });
    }
    scheduleFlush();
  }

  async function flush(): Promise<void> {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (flushPromise) return flushPromise;
    if (pending.size === 0) return;
    flushPromise = drain()
      .catch((err) => {
        console.error("[intel] metrics cache refresh failed", err);
      })
      .finally(() => {
        flushPromise = null;
      });
    return flushPromise;
  }

  function setEnabled(newEnabled: boolean): () => void {
    const prev = enabled;
    enabled = newEnabled;
    return () => {
      enabled = prev;
    };
  }

  return { queue, flush, setEnabled };
}
