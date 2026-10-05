import { spawn } from "node:child_process";

const color = Boolean(process.stdout.isTTY || process.env.FORCE_COLOR) && !process.env.NO_COLOR && !process.env.CI;
const paint = (code: string) => (text: string) => (color ? `\x1b[${code}m${text}\x1b[0m` : text);

export const purple = paint("38;2;141;113;214");
export const green = paint("32");
export const yellow = paint("33");
export const bold = paint("1");
export const dim = paint("2");

const visible = (text: string) => text.replace(/\x1b\[[0-9;]*m/g, "").length;

export function say(line = ""): void {
  process.stdout.write(`${line}\n`);
}

export async function step<T>(label: string, work: () => T | Promise<T>, detail: (result: T) => string = () => ""): Promise<T> {
  if (color) process.stdout.write(`  ${dim("◌")} ${label}…`);
  const result = await work();
  const note = detail(result);
  const line = `  ${green("✓")} ${label.padEnd(32)}${note ? dim(note) : ""}`;
  process.stdout.write(color ? `\r\x1b[K${line}\n` : `${line}\n`);
  return result;
}

export function box(title: string, lines: string[]): string {
  const width = Math.max(visible(title) + 4, ...lines.map((l) => visible(l) + 4));
  const top = `  ╭─ ${title} ${"─".repeat(Math.max(0, width - visible(title) - 3))}╮`;
  const body = lines.map((l) => `${dim("  │")}  ${l}${" ".repeat(width - visible(l) - 2)}${dim("│")}`);
  return [dim(top), ...body, dim(`  ╰${"─".repeat(width)}╯`)].join("\n");
}

export function ask(question: string): string {
  return `${purple("?")} ${bold(question)} `;
}

export function openBrowser(url: string): void {
  const [command, args] =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["cmd", ["/c", "start", "", url]]
        : ["xdg-open", [url]];
  spawn(command, args, { stdio: "ignore", detached: true })
    .on("error", () => {})
    .unref();
}
