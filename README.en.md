# MiddleTool

Desktop app for managing multi-environment middleware connections and exporting unified [MCP](https://modelcontextprotocol.io/) (Model Context Protocol) configurations.

[中文文档](README.md)

## Features

- **Middleware connections** — Configure connections per adapter schema; distinguish environments by name (e.g. `prod-loki`)
- **Middleware catalog** — Browse registered MCP adapters, run connectivity checks, and link to upstream repos
- **Connection testing** — Test Loki / MySQL / Redis / RocketMQ / Elasticsearch / MongoDB before saving
- **Config import/export** — Back up and migrate environments and connections
- **MCP config export** — Generate `mcpServers` JSON for Cursor / Claude Desktop, with optional file export
- **Plugin architecture** — Add new middleware by creating an adapter file and registering it

## Registered Middleware

| Middleware | Category | MCP Source | Status |
|------------|----------|------------|--------|
| Grafana Loki | Logging | [loki-mcp](https://gitee.com/mirrors_grafana/loki-mcp) | ✅ Available |
| Apache RocketMQ | Message queue | Built-in `packages/rocketmq-mcp-server` | ✅ Available |
| MySQL | Database | Built-in `packages/mysql-mcp-server` (compatible with [mcp-server-mysql](https://github.com/benborla/mcp-server-mysql)) | ✅ Available |
| Redis | Cache | Official redis/mcp-redis (uvx) | ✅ Available |
| Elasticsearch | Logging / search | Built-in (compatible with [elasticsearch-mcp-server](https://github.com/cr7258/elasticsearch-mcp-server)) | ✅ Available |
| MongoDB | Database | Built-in (compatible with [mcp-mongo-server](https://github.com/kiliczsh/mcp-mongo-server)) | ✅ Available |
| Apache Kafka | Message queue | [mcp-kafka](https://github.com/gAmUssA/mcp-kafka) | 🔜 Planned |

## Tech Stack

- **Electron + React + TypeScript**
- **Adapter plugin architecture** (`electron/main/adapters/`)
- **Shared types** (`shared/types/`, used by UI and main process)
- **electron-store** for local config persistence

## Quick Start

```bash
git clone https://github.com/2514385224/middle-tool.git
cd middle-tool
npm install
npm run dev
```

### Prerequisites

- Node.js 18+
- For RocketMQ dev: run `npm run rocketmq-mcp:java:build` once (requires Maven)

## Usage

1. **Middleware config** — Pick an adapter, name the environment (e.g. `prod-loki`), fill in connection fields
2. **MCP config** — Export JSON for Cursor / Claude Desktop

## MCP Server

MiddleTool ships a **single MCP server** `middle-tool`. Export it from the in-app MCP config page:

| Server | Package | Capabilities |
|--------|---------|--------------|
| `middle-tool` | `packages/mcp-server` | Loki, MySQL, Redis, RocketMQ, Elasticsearch, MongoDB tools |

```json
{
  "mcpServers": {
    "middle-tool": {
      "command": "node",
      "args": ["packages/mcp-server/dist/index.js"]
    }
  }
}
```

The desktop app auto-adds env vars for enabled RocketMQ / Redis connections.

RocketMQ uses an **embedded Java Admin bridge** bundled in the installer (no separate deployment).

See [packages/mcp-server/README.md](packages/mcp-server/README.md) for details.

## Project Structure

```
middle-tool/
├── packages/mcp-server/           # Unified MCP (all middleware tools)
├── shared/types/                  # Shared types for UI and main process
├── electron/main/adapters/        # Adapter registration and validation
└── src/pages/                     # Dashboard, catalog, config, MCP export
```

## Extending Middleware

See [docs/EXTENDING.md](docs/EXTENDING.md). Summary:

1. Create `{name}.ts` under `electron/main/adapters/`
2. Use `defineConnectionAdapter()` or `definePlannedAdapter()`
3. Register in `ALL_ADAPTERS` in `registry.ts`
4. Implement corresponding tools in `packages/mcp-server`

## Build & Package

### Development build

```bash
npm run build
```

### Windows installer (.exe)

```bash
npm install
npm run pack
# or
npm run build:win
```

Output goes to `release/`:

| File | Description |
|------|-------------|
| `MiddleTool-Setup-0.1.0.exe` | NSIS installer (custom install dir, desktop shortcut) |

**Packaging steps:**

1. Build `packages/mcp-server`
2. Build Electron main / preload / renderer
3. Bundle mcp-server and prod deps into `resources/mcp-server/`
4. Run electron-builder for NSIS

**After install:**

- Exported MCP JSON points `args` to `resources/mcp-server/dist/index.js` under the install dir
- **Node.js 18+** must be on PATH (Cursor invokes MCP via `node`)

**Optional:** Place `icon.ico` in `resources/` and set `build.win.icon` in `package.json`.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Open a Pull Request

## Links

- [loki-mcp (Gitee)](https://gitee.com/mirrors_grafana/loki-mcp)
- [Model Context Protocol](https://modelcontextprotocol.io/)
