#!/usr/bin/env node

import dotenv from "dotenv";
import express from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { discoverTools } from "./lib/tools.js";

import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, ".env") });


// --- Global auth injection for ALL fetch calls ---
// Place this right after dotenv.config(...) and BEFORE tools are discovered.

const originalFetch = global.fetch; // Node 18+ has global fetch

const TOKEN_ENV = process.env.EVAG_MCP_TEST_API_KEY;

// Optional: customize header name/scheme via env
// If your API expects "Authorization: Bearer <token>":
//  - leave defaults (name=Authorization, scheme=Bearer)
// If it expects "authKey: <token>":
//  - set MCP_AUTH_HEADER_NAME=authKey and MCP_AUTH_SCHEME="" (empty) in your env
const AUTH_HEADER_NAME = process.env.MCP_AUTH_HEADER_NAME || "Authorization";
const AUTH_SCHEME = Object.prototype.hasOwnProperty.call(process.env, "MCP_AUTH_SCHEME")
  ? process.env.MCP_AUTH_SCHEME                  // allow empty string to mean "no scheme"
  : "Bearer";

global.fetch = async (input, init = {}) => {
  const headers = new Headers(init.headers || {});

  // Only set if caller didn't already provide it
  if (TOKEN_ENV && !headers.has(AUTH_HEADER_NAME)) {
    const value = (AUTH_SCHEME && AUTH_SCHEME.length > 0)
      ? `${AUTH_SCHEME} ${TOKEN_ENV}`
      : `${TOKEN_ENV}`;
    headers.set(AUTH_HEADER_NAME, value);
  }

  // Helpful default for JSON bodies if not already specified
  if (init.body && !headers.has("Content-Type") && typeof init.body === "string") {
    headers.set("Content-Type", "application/json");
  }

  return originalFetch(input, { ...init, headers });
};
// --- End global auth injection ---




const SERVER_NAME = "generated-mcp-server";

async function transformTools(tools) {
  return tools
    .map((tool) => {
      const definitionFunction = tool.definition?.function;
      if (!definitionFunction) return;
      return {
        name: definitionFunction.name,
        description: definitionFunction.description,
        inputSchema: definitionFunction.parameters,
      };
    })
    .filter(Boolean);
}

async function setupServerHandlers(server, tools) {
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: await transformTools(tools),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const toolName = request.params.name;
    const tool = tools.find((t) => t.definition.function.name === toolName);
    if (!tool) {
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${toolName}`);
    }
    const args = request.params.arguments;
    const requiredParameters =
      tool.definition?.function?.parameters?.required || [];
    for (const requiredParameter of requiredParameters) {
      if (!(requiredParameter in args)) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Missing required parameter: ${requiredParameter}`
        );
      }
    }
    try {
      const result = await tool.function(args);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      console.error("[Error] Failed to fetch data:", error);
      throw new McpError(
        ErrorCode.InternalError,
        `API error: ${error.message}`
      );
    }
  });
}

async function setupStreamableHttp(tools) {
  const app = express();
  app.use(express.json());

  app.post("/mcp", async (req, res) => {
    try {
      const server = new Server(
        {
          name: SERVER_NAME,
          version: "0.1.0",
        },
        {
          capabilities: {
            tools: {},
          },
        }
      );
      server.onerror = (error) => console.error("[Error]", error);
      await setupServerHandlers(server, tools);

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });

      res.on("close", async () => {
        await transport.close();
        await server.close();
      });

      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("Error handling MCP request:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "Internal server error",
          },
          id: null,
        });
      }
    }
  });

  const port = process.env.PORT || 3001;
  app.listen(port, () => {
    console.log(
      `[Streamable HTTP Server] running at http://127.0.0.1:${port}/mcp`
    );
  });
}

async function setupSSE(tools) {
  const app = express();
  const transports = {};
  const servers = {};

  app.get("/sse", async (_req, res) => {
    const server = new Server(
      {
        name: SERVER_NAME,
        version: "0.1.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );
    server.onerror = (error) => console.error("[Error]", error);
    await setupServerHandlers(server, tools);

    const transport = new SSEServerTransport("/messages", res);
    transports[transport.sessionId] = transport;
    servers[transport.sessionId] = server;

    res.on("close", async () => {
      delete transports[transport.sessionId];
      await server.close();
      delete servers[transport.sessionId];
    });

    await server.connect(transport);
  });

  app.post("/messages", async (req, res) => {
    const sessionId = req.query.sessionId;
    const transport = transports[sessionId];
    const server = servers[sessionId];

    if (transport && server) {
      await transport.handlePostMessage(req, res);
    } else {
      res.status(400).send("No transport/server found for sessionId");
    }
  });

  const port = process.env.PORT || 3001;
  app.listen(port, () => {
    console.log(`[SSE Server] is running:`);
    console.log(`  SSE stream:    http://127.0.0.1:${port}/sse`);
    console.log(`  Message input: http://127.0.0.1:${port}/messages`);
  });
}

async function setupStdio(tools) {
  // stdio mode: single server instance
  const server = new Server(
    {
      name: SERVER_NAME,
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );
  server.onerror = (error) => console.error("[Error]", error);
  await setupServerHandlers(server, tools);

  process.on("SIGINT", async () => {
    await server.close();
    process.exit(0);
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

async function run() {
  const args = process.argv.slice(2);
  const isStreamableHttp = args.includes("--streamable-http");
  const isSSE = args.includes("--sse");
  const tools = await discoverTools();

  if (isStreamableHttp && isSSE) {
    console.error("Error: Cannot specify both --streamable-http and --sse");
    process.exit(1);
  }

  if (isStreamableHttp) {
    await setupStreamableHttp(tools);
  } else if (isSSE) {
    await setupSSE(tools);
  } else {
    await setupStdio(tools);
  }
}

run().catch(console.error);
