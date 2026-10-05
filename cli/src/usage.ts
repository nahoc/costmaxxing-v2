import { createReadStream } from "node:fs";
import { appendFile, mkdir, readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, sep } from "node:path";
import { createInterface } from "node:readline";
import { claudeCodeParser, codexParser, parseRecord, type RequestRecord } from "@openmaxxing/core";

export const HOME = process.env.OPENMAXXING_HOME ?? join(homedir(), ".openmaxxing");
export const RECORDS_FILE = join(HOME, "usage.jsonl");
const CLAUDE_PROJECTS = join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude"), "projects");
const CODEX_HOME = process.env.CODEX_HOME ?? join(homedir(), ".codex");

const LARGE = 256 * 1024 * 1024;

async function freshFiles(root: string, since: number): Promise<{ path: string; size: number }[]> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true }).catch(() => []);
  const files = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
      .map(async (entry) => {
        const path = join(entry.parentPath, entry.name);
        const info = await stat(path).catch(() => undefined);
        return info && info.mtimeMs >= since ? { path, size: info.size } : undefined;
      }),
  );
  return files.filter((file) => file !== undefined);
}

async function eachLine(files: { path: string; size: number }[], reader: (path: string) => (line: string) => void): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < files.length) {
      const { path, size } = files[next++]!;
      const onLine = reader(path);
      if (size < LARGE) {
        for (const line of (await readFile(path, "utf8").catch(() => "")).split("\n")) onLine(line);
      } else {
        try {
          for await (const line of createInterface({ input: createReadStream(path), crlfDelay: Number.POSITIVE_INFINITY })) {
            onLine(line);
          }
        } catch {}
      }
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
}

export async function readLogs(since: number): Promise<RequestRecord[]> {
  const [claudeFiles, codexSessions, codexArchived] = await Promise.all([
    freshFiles(CLAUDE_PROJECTS, since),
    freshFiles(join(CODEX_HOME, "sessions"), since),
    freshFiles(join(CODEX_HOME, "archived_sessions"), since),
  ]);
  const records: RequestRecord[] = [];
  const keep = (record: RequestRecord | undefined) => {
    if (record && record.time >= since) records.push(record);
  };
  const parseClaude = claudeCodeParser();
  const subagents = `${sep}subagents${sep}`;
  const codexFiles: ReturnType<typeof codexParser>[] = [];
  await Promise.all([
    eachLine(claudeFiles, (path) => {
      const subagent = path.includes(subagents);
      return (line) => keep(parseClaude(line, subagent));
    }),
    eachLine([...codexSessions, ...codexArchived], () => {
      const parser = codexParser();
      codexFiles.push(parser);
      return parser.line;
    }),
  ]);
  for (const parser of codexFiles) for (const record of parser.records) keep(record);
  return records;
}

export async function readRecorded(since: number, file = RECORDS_FILE): Promise<RequestRecord[]> {
  const text = await readFile(file, "utf8").catch(() => "");
  return text.split("\n").flatMap((line) => {
    const record = parseRecord(line);
    return record && record.time >= since ? [record] : [];
  });
}

export async function appendRecord(record: RequestRecord, file = RECORDS_FILE): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  await appendFile(file, `${JSON.stringify(record)}\n`);
}

export function mergeRecords(logs: RequestRecord[], recorded: RequestRecord[]): RequestRecord[] {
  const merged = new Map<string, RequestRecord>();
  for (const record of logs) if (!merged.has(record.id)) merged.set(record.id, record);
  for (const record of recorded) {
    const logged = merged.get(record.id);
    merged.set(record.id, logged ? { ...record, session: logged.session, subagent: logged.subagent } : record);
  }
  return [...merged.values()];
}

export async function readUsage(since: number): Promise<RequestRecord[]> {
  const [logs, recorded] = await Promise.all([readLogs(since), readRecorded(since)]);
  return mergeRecords(logs, recorded);
}
