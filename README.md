# MiddleTool

多环境中间件连接管理桌面应用，统一对外提供 MCP（Model Context Protocol）能力。

## 功能

- **中间件连接**：按适配器 schema 配置连接，通过名称区分环境（如 prod-loki）
- **中间件目录**：查看已注册的全部 MCP 适配器、连通性校验与上游仓库链接
- **连接测试**：保存前可测试 Loki / MySQL / Redis / RocketMQ / Elasticsearch / MongoDB 连通性
- **配置导入导出**：备份与迁移环境与连接
- **MCP 配置导出**：生成 Cursor / Claude Desktop 可用的 `mcpServers` JSON，支持写入文件
- **插件式架构**：新增中间件只需添加适配器文件并注册

## 已注册中间件

| 中间件 | 分类 | MCP 来源 | 状态 |
|--------|------|----------|------|
| Grafana Loki | 日志 | [loki-mcp](https://gitee.com/mirrors_grafana/loki-mcp) | ✅ 可用 |
| Apache RocketMQ | 消息队列 | 内置 `packages/rocketmq-mcp-server` | ✅ 可用 |
| MySQL | 数据库 | 内置 `packages/mysql-mcp-server`（兼容 [mcp-server-mysql](https://github.com/benborla/mcp-server-mysql)） | ✅ 可用 |
| Redis | 缓存 | 官方 redis/mcp-redis（uvx） | ✅ 可用 |
| Elasticsearch | 日志/搜索 | 内置（兼容 [elasticsearch-mcp-server](https://github.com/cr7258/elasticsearch-mcp-server)） | ✅ 可用 |
| MongoDB | 数据库 | 内置（兼容 [mcp-mongo-server](https://github.com/kiliczsh/mcp-mongo-server)） | ✅ 可用 |
| Apache Kafka | 消息队列 | [mcp-kafka](https://github.com/gAmUssA/mcp-kafka) | 🔜 规划中 |

## 技术栈

- **Electron + React + TypeScript**
- **适配器插件架构**（`electron/main/adapters/`）
- **共享类型**（`shared/types/`，UI 与主进程共用）
- **electron-store** 本地配置持久化

## 快速开始

```bash
cd MiddleTool
npm install
npm run dev
```

### 前置条件

- Node.js 18+
- RocketMQ 开发环境首次需执行 `npm run rocketmq-mcp:java:build`（需 Maven）

## 使用流程

1. **中间件配置** — 选择适配器，用名称区分环境（如 prod-loki），配置连接参数
2. **MCP 配置** — 导出 JSON 到 Cursor / Claude Desktop

## MCP Server

MiddleTool 提供**单一 MCP Server** `middle-tool`，桌面端「MCP 配置」一键导出：

| Server | 包路径 | 能力 |
|--------|--------|------|
| `middle-tool` | `packages/mcp-server` | Loki、MySQL、Redis、RocketMQ、Elasticsearch、MongoDB 全部 tools |

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

桌面端「MCP 配置」会根据已启用的 RocketMQ / Redis 连接自动补充 env。

RocketMQ 由 MiddleTool 桌面端 **内嵌托管 Java Admin 桥接**（安装包预置 JAR，用户无需单独部署）。

详见 [packages/mcp-server/README.md](packages/mcp-server/README.md)。

## 项目结构

```
MiddleTool/
├── packages/mcp-server/           # 统一 MCP（全部中间件 tools）
├── shared/types/                  # UI 与主进程共享类型
├── electron/main/adapters/        # 适配器注册与校验
└── src/pages/                     # 概览、目录、配置、MCP 导出
```

## 扩展新中间件

详见 [docs/EXTENDING.md](docs/EXTENDING.md)。核心步骤：

1. 在 `electron/main/adapters/` 创建 `{name}.ts`
2. 使用 `defineConnectionAdapter()` 或 `definePlannedAdapter()`
3. 在 `registry.ts` 的 `ALL_ADAPTERS` 注册
4. 在 `packages/mcp-server` 实现对应 tools

## 构建与打包

### 开发编译

```bash
npm run build
```

### Windows 安装包（.exe）

```bash
npm install
npm run pack
# 或
npm run build:win
```

产物输出在 `release/` 目录：

| 文件 | 说明 |
|------|------|
| `MiddleTool-Setup-0.1.0.exe` | NSIS 安装程序（可自选安装目录、创建桌面快捷方式） |

**打包流程说明：**

1. 编译 `packages/mcp-server` 统一 MCP Server
2. 编译 Electron 主进程 / 预加载 / 渲染进程
3. 将 mcp-server 及生产依赖打入 `resources/mcp-server/`
4. 使用 electron-builder 生成 NSIS 安装包

**安装后 MCP 配置：**

- 应用内「MCP 配置」导出的 JSON 中，`args` 会指向安装目录下的 `resources/mcp-server/dist/index.js`
- 本机需已安装 **Node.js 18+** 并加入 PATH（Cursor 调用 MCP 时使用 `node` 命令）

**可选：自定义应用图标**

将 `icon.ico` 放入 `resources/` 目录，并在 `package.json` 的 `build.win.icon` 中指定路径。

## 相关链接

- [loki-mcp (Gitee)](https://gitee.com/mirrors_grafana/loki-mcp)
- [Model Context Protocol](https://modelcontextprotocol.io/)
