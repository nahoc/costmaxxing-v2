import { appendFile, mkdir, readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, sep } from "node:path";
import { claudeCodeParser, parseCodexLines, parseRecord, type RequestRecord } from "@costmaxxing/core";

export const HOME = process.env.COSTMAXXING_HOME ?? join(homedir(), ".costmaxxing");
export const RECORDS_FILE = join(HOME, "usage.jsonl");
const CLAUDE_PROJECTS = join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude"), "projects");
const CODEX_HOME = process.env.CODEX_HOME ?? join(homedir(), ".codex");

async function freshFiles(root: string, since: number): Promise<string[]> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true }).catch(() => []);
  const files = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
      .map(async (entry) => {
        const file = join(entry.parentPath, entry.name);
        const info = await stat(file).catch(() => undefined);
        return info && info.mtimeMs >= since ? file : undefined;
      }),
  );
  return files.filter((file) => file !== undefined);
}

async function eachText(files: string[], use: (file: string, text: string) => void): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < files.length) {
      const file = files[next++]!;
      const text = await readFile(file, "utf8").catch(() => "");
      use(file, text);
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
}

export async function readLogs(since: number): Promise<RequestRecord[]> {
  const [claudeFiles, codexFiles] = await Promise.all([
    freshFiles(CLAUDE_PROJECTS, since),
    Promise.all([freshFiles(join(CODEX_HOME, "sessions"), since), freshFiles(join(CODEX_HOME, "archived_sessions"), since)]),
  ]);
  const records: RequestRecord[] = [];
  const parseClaude = claudeCodeParser();
  const subagents = `${sep}subagents${sep}`;
  await eachText(claudeFiles, (file, text) => {
    const subagent = file.includes(subagents);
    for (const line of text.split("\n")) {
      const record = parseClaude(line, subagent);
      if (record && record.time >= since) records.push(record);
    }
  });
  await eachText(codexFiles.flat(), (_, text) => {
    for (const record of parseCodexLines(text.split("\n"))) if (record.time >= since) records.push(record);
  });
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
