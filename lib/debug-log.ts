import { appendFile, mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";

export interface DebugLogEntry {
  url: string;
  prov: string;
  data_simple: string;
  key_hash: string;
  received_at: string;
}

export interface DebugLogConfig {
  enabled: boolean;
  filePath: string;
  maxBytes: number;
  maxFiles: number;
}

type DebugLogEnv = Record<string, string | undefined>;

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_MAX_FILES = 5;

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getDebugLogConfig(
  env: DebugLogEnv = process.env,
  cwd: string = process.cwd(),
): DebugLogConfig {
  return {
    enabled: env.INTEL_DEBUG === "1",
    filePath: env.INTEL_DEBUG_PATH || path.join(cwd, "intel_debug.jsonl"),
    maxBytes: parsePositiveInt(env.INTEL_DEBUG_MAX_BYTES, DEFAULT_MAX_BYTES),
    maxFiles: parsePositiveInt(env.INTEL_DEBUG_MAX_FILES, DEFAULT_MAX_FILES),
  };
}

async function getFileSize(filePath: string): Promise<number> {
  try {
    const info = await stat(filePath);
    return info.size;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return 0;
    throw error;
  }
}

async function rotateFiles(filePath: string, maxFiles: number) {
  await rm(`${filePath}.${maxFiles}`, { force: true });

  for (let index = maxFiles - 1; index >= 1; index -= 1) {
    try {
      await rename(`${filePath}.${index}`, `${filePath}.${index + 1}`);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") throw error;
    }
  }

  try {
    await rename(filePath, `${filePath}.1`);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw error;
  }
}

async function appendWithRotation(config: DebugLogConfig, line: string) {
  await mkdir(path.dirname(config.filePath), { recursive: true });
  const currentSize = await getFileSize(config.filePath);
  const nextSize = currentSize + Buffer.byteLength(line);

  if (currentSize > 0 && nextSize > config.maxBytes) {
    await rotateFiles(config.filePath, config.maxFiles);
  }

  await appendFile(config.filePath, line, "utf8");
}

export function createDebugLogWriter(config: DebugLogConfig) {
  let queue = Promise.resolve();

  return {
    append(entry: DebugLogEntry) {
      if (!config.enabled) return Promise.resolve();

      const line = `${JSON.stringify(entry)}\n`;
      const task = queue.then(() => appendWithRotation(config, line));
      queue = task.catch(() => {});
      return task;
    },
  };
}

const defaultWriter = createDebugLogWriter(getDebugLogConfig());

export function appendDebugLog(entry: DebugLogEntry) {
  return defaultWriter.append(entry);
}
