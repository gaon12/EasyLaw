import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import type { SqliteDatabase } from "./db";
import { getSetting } from "./settings";

export type McpToolDefinition = {
  key: string;
  serverId: string;
  serverLabel: string;
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export type McpToolCallResult = {
  content: Array<
    | { type: "text"; text: string }
    | { type: "resource"; resource: { uri: string; text?: string } }
    | {
        type: "resource_link";
        uri: string;
        name: string;
        title?: string;
        description?: string;
      }
  >;
  isError: boolean;
  structuredContent?: Record<string, unknown>;
};

type ConnectedServer = {
  client: Client;
  id: string;
  label: string;
  transport: StreamableHTTPClientTransport;
};

export type McpToolbox = {
  tools: McpToolDefinition[];
  call(
    toolKey: string,
    args: Record<string, unknown>,
  ): Promise<McpToolCallResult>;
  close(): Promise<void>;
};

const configuredServers = [
  {
    id: "korean-law",
    label: "korean-law-mcp",
    settingKey: "mcp_korean_law_endpoint",
  },
  {
    id: "case-law",
    label: "Case Law MCP",
    settingKey: "mcp_case_law_endpoint",
  },
] as const;

export async function connectMcpToolbox(
  db: SqliteDatabase,
): Promise<McpToolbox> {
  const timeout = readTimeout(db);
  const servers = configuredServers.flatMap((server) => {
    const endpoint = getSetting(db, server.settingKey)?.trim();
    return endpoint ? [{ ...server, endpoint }] : [];
  });
  const connections = (
    await Promise.allSettled(
      servers.map((server) => connectServer(server, timeout)),
    )
  ).flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
  const tools = connections.flatMap((connection) => connection.tools);
  const serverById = new Map(
    connections.map((connection) => [connection.server.id, connection.server]),
  );

  return {
    tools,
    async call(toolKey, args) {
      const tool = tools.find((item) => item.key === toolKey);
      const server = tool ? serverById.get(tool.serverId) : undefined;
      if (!tool || !server) {
        throw new Error(`mcp_tool_not_found:${toolKey}`);
      }
      const result = await server.client.callTool(
        { arguments: args, name: tool.name },
        CallToolResultSchema,
        { timeout },
      );
      const content = Array.isArray(result.content)
        ? result.content.filter(isSupportedContent)
        : [];
      return {
        content,
        isError: result.isError === true,
        structuredContent: isRecord(result.structuredContent)
          ? result.structuredContent
          : undefined,
      };
    },
    async close() {
      await Promise.allSettled(
        connections.map((connection) => connection.server.transport.close()),
      );
    },
  };
}

export type McpServerProbe = {
  id: string;
  label: string;
  endpoint: string;
  ok: boolean;
  tools: string[];
  error: string | null;
};

/** 관리자 진단용: 설정된 각 MCP 서버에 개별 연결해 결과와 실패 사유를 보고한다. */
export async function probeMcpServers(
  db: SqliteDatabase,
): Promise<McpServerProbe[]> {
  const timeout = readTimeout(db);
  const servers = configuredServers.flatMap((server) => {
    const endpoint = getSetting(db, server.settingKey)?.trim();
    return endpoint ? [{ ...server, endpoint }] : [];
  });
  return Promise.all(
    servers.map(async (server) => {
      try {
        const connection = await connectServer(server, timeout);
        await connection.server.transport.close().catch(() => {});
        return {
          endpoint: server.endpoint,
          error: null,
          id: server.id,
          label: server.label,
          ok: true,
          tools: connection.tools.map((tool) => tool.name),
        };
      } catch (error) {
        return {
          endpoint: server.endpoint,
          error: error instanceof Error ? error.message : String(error),
          id: server.id,
          label: server.label,
          ok: false,
          tools: [],
        };
      }
    }),
  );
}

async function connectServer(
  server: {
    endpoint: string;
    id: string;
    label: string;
  },
  timeout: number,
) {
  const client = new Client(
    { name: "easylaw-research", version: "1.0.0" },
    { capabilities: {} },
  );
  const transport = new StreamableHTTPClientTransport(new URL(server.endpoint));
  await client.connect(transport, { timeout });
  const result = await client.listTools(undefined, { timeout });
  return {
    server: { client, id: server.id, label: server.label, transport },
    tools: result.tools.filter(isReadOnlyTool).map((tool) => ({
      description: tool.description ?? "",
      inputSchema: tool.inputSchema,
      key: `${server.id}/${tool.name}`,
      name: tool.name,
      serverId: server.id,
      serverLabel: server.label,
      title: tool.title ?? tool.name,
    })),
  } satisfies {
    server: ConnectedServer;
    tools: McpToolDefinition[];
  };
}

function isSupportedContent(
  value: unknown,
): value is McpToolCallResult["content"][number] {
  if (!isRecord(value) || typeof value.type !== "string") {
    return false;
  }
  if (value.type === "text") {
    return typeof value.text === "string";
  }
  if (value.type === "resource_link") {
    return typeof value.uri === "string" && typeof value.name === "string";
  }
  return value.type === "resource" && isRecord(value.resource);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isReadOnlyTool(tool: {
  annotations?: { destructiveHint?: boolean; readOnlyHint?: boolean };
  name: string;
}) {
  if (tool.annotations?.destructiveHint === true) {
    return false;
  }
  return (
    tool.annotations?.readOnlyHint === true ||
    /^(search|find|get|list|lookup|query|read)/i.test(tool.name)
  );
}

function readTimeout(db: SqliteDatabase) {
  const configured = Number.parseInt(
    getSetting(db, "mcp_timeout_ms") ?? "15000",
    10,
  );
  return Number.isFinite(configured)
    ? Math.min(Math.max(configured, 1_000), 60_000)
    : 15_000;
}
