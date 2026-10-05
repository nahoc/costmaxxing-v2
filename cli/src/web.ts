import { spawn } from "node:child_process";
import { renderPage } from "@openmaxxing/core";
import { personalReport, type PersonalOptions } from "./personal.ts";
import { listen } from "./proxy.ts";

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

export async function web(options: PersonalOptions & { port?: string; open: boolean }): Promise<void> {
  await personalReport(options);
  const server = await listen(
    async (req, res) => {
      if (req.method !== "GET" || req.url !== "/") {
        res.writeHead(404).end();
        return;
      }
      try {
        const html = renderPage(await personalReport(options));
        res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }).end(html);
      } catch (error) {
        res.writeHead(500, { "content-type": "text/plain" }).end(error instanceof Error ? error.message : String(error));
      }
    },
    options.port ? Number(options.port) : 0,
  );
  process.stdout.write(`openmaxxing web: ${server.url} (Ctrl-C to stop)\n`);
  if (options.open) openBrowser(server.url);
}
