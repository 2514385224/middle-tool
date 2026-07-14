# MiddleTool MCP · Docker 部署

Docker 镜像 = **已构建的 Linux 包** + **Node/Java/uvx 运行环境**。

不在镜像内编译源码；需先打好 Linux 压缩包，再构建镜像。

## 构建流程

```bash
# 一条命令：自动打 Linux 包 + 构建镜像
npm run docker:build

# 或分步：
npm run build:linux-mcp
docker build -f deploy/docker/Dockerfile --build-arg APP_VERSION=0.1.0 -t middle-tool-mcp:latest .
```

## 启动

```bash
cd deploy/docker
cp config/middle-tool-config.json.example config/middle-tool-config.json
# 编辑 config/middle-tool-config.json

docker compose up -d
# 或
docker run -d --name middle-tool-mcp -p 8080:8080 \
  -v ./config/middle-tool-config.json:/app/config/middle-tool-config.json:ro \
  middle-tool-mcp:latest
```

## 依赖说明

| 层级 | 内容 |
|------|------|
| **Linux 包内** | `dist/`、`node_modules/`、`runtime/rocketmq-mcp.jar`、`bin/start.sh` |
| **镜像额外提供** | Node.js 20、Java 17 JRE、uv/uvx、curl |
| **宿主机** | 仅需 Docker，无需单独安装 Node |

## 访问地址

- MCP: `http://<IP>:8080/mcp`
- Health: `http://<IP>:8080/health`

## 环境变量

与 Linux 解压包相同，见 [../linux/README.md](../linux/README.md)。
