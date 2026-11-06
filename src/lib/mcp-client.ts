/**
 * Minimal MCP client (Streamable HTTP) used to call Aurasell's MCP server as the signed-in person.
 * Handles JSON and SSE responses and the Mcp-Session-Id header.
 */
type JsonRpc = { jsonrpc: "2.0"; id?: number; result?: unknown; error?: { code: number; message: string } };

async function parse(res: Response): Promise<JsonRpc | null> {
  const type = res.headers.get("content-type") ?? "";
  const body = await res.text();
  if (!body.trim()) return null;
  if (type.includes("text/event-stream")) {
    const events = body.split(/\n\n/).map((chunk) =>
      chunk.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trimStart()).join("\n"),
    ).filter(Boolean);
    for (const e of events.reverse()) {
      try {
        const j = JSON.parse(e) as JsonRpc;
        if (j.result !== undefined || j.error) return j;
      } catch { /* keep looking */ }
    }
    return null;
  }
  return JSON.parse(body) as JsonRpc;
}

export class McpClient {
  private session: string | null = null;
  private nextId = 1;
  private ready = false;
  constructor(private url: string, private token: string) {}

  private async post(payload: object) {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    };
    if (this.session) headers["Mcp-Session-Id"] = this.session;
    if (this.ready) headers["MCP-Protocol-Version"] = "2025-06-18";
    const res = await fetch(this.url, { method: "POST", headers, body: JSON.stringify(payload) });
    if (res.status === 401) throw new McpAuthError("Aurasell sign-in expired");
    if (!res.ok && res.status !== 202) throw new Error(`MCP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const sid = res.headers.get("mcp-session-id");
    if (sid) this.session = sid;
    return parse(res);
  }

  async init() {
    if (this.ready) return;
    const r = await this.post({
      jsonrpc: "2.0", id: this.nextId++, method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "revlogic-projects", version: "0.1.0" } },
    });
    if (r?.error) throw new Error(`MCP initialize failed: ${r.error.message}`);
    this.ready = true;
    await this.post({ jsonrpc: "2.0", method: "notifications/initialized" });
  }

  /** Calls a tool and returns its JSON result (structuredContent, or the text content parsed as JSON). */
  async call<T = unknown>(name: string, args: Record<string, unknown>): Promise<T> {
    await this.init();
    const r = await this.post({ jsonrpc: "2.0", id: this.nextId++, method: "tools/call", params: { name, arguments: args } });
    if (!r) throw new Error(`MCP ${name}: empty response`);
    if (r.error) throw new Error(`MCP ${name}: ${r.error.message}`);
    const res = r.result as { isError?: boolean; structuredContent?: unknown; content?: { type: string; text?: string }[] };
    const text = res.content?.filter((c) => c.type === "text").map((c) => c.text).join("") ?? "";
    if (res.isError) throw new Error(`MCP ${name}: ${text.slice(0, 300)}`);
    if (res.structuredContent !== undefined) return res.structuredContent as T;
    try { return JSON.parse(text) as T; } catch { return text as unknown as T; }
  }
}

export class McpAuthError extends Error {}
