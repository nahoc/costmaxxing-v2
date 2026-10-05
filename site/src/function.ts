import type { IncomingMessage, ServerResponse } from "node:http";
import world from "../../world/world.css";
import page from "./team.css";
import { handle } from "./api.ts";
import type { Redis } from "./teams.ts";

const url = process.env.KV_REST_API_URL ?? "";
const token = process.env.KV_REST_API_TOKEN ?? "";

async function call(path: string, body: unknown): Promise<unknown> {
  const response = await fetch(`${url}${path}`, { method: "POST", headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`redis ${response.status}: ${await response.text()}`);
  return response.json();
}

const redis: Redis = {
  async run(command) {
    const reply = (await call("", command)) as { result?: unknown; error?: string };
    if (reply.error) throw new Error(reply.error);
    return reply.result;
  },
  async pipeline(commands) {
    const replies = (await call("/pipeline", commands)) as { result?: unknown; error?: string }[];
    return replies.map((reply) => {
      if (reply.error) throw new Error(reply.error);
      return reply.result;
    });
  },
};

export default async function (req: IncomingMessage, res: ServerResponse): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const request = new Request(`https://${req.headers.host ?? "localhost"}${req.url ?? "/"}`, {
    method: req.method,
    headers: req.headers as Record<string, string>,
    body: req.method === "GET" || req.method === "HEAD" ? undefined : Buffer.concat(chunks),
  });
  try {
    const response = await handle(request, redis, Date.now(), `${world}\n${page}`);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.error(error);
    res.writeHead(500, { "content-type": "application/json" }).end(JSON.stringify({ error: "the team store didn't answer" }));
  }
}
