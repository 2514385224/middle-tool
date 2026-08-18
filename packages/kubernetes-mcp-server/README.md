# MiddleTool Kubernetes MCP Server

提供 Kubernetes/OpenShift 操作能力的 MCP Server，集成到 MiddleTool 桌面端。

## 功能

- 列出 Kubernetes 连接
- 列出命名空间
- 列出/获取/删除 Pod
- 查看 Pod 日志
- 获取 Pod 资源指标（需 Metrics Server）
- 列出事件
- 列出 Deployment
- 列出 Service
- 获取任意 Kubernetes 资源（支持 CRD）

## 配置

在 MiddleTool 桌面端添加 Kubernetes 连接，配置项：

- `kubeconfig`: kubeconfig 文件路径（可选，默认使用 ~/.kube/config）
- `context`: Kubernetes context（可选，默认使用当前 context）
- `namespace`: 默认命名空间（可选，默认 default）
- `inCluster`: 是否使用 in-cluster 配置（yes/no，默认 no）

## 开发

```bash
npm run build    # 构建
npm run dev      # 监听模式构建
npm run start    # 启动服务器
```

## 工具列表

| 工具名 | 描述 |
|--------|------|
| kubernetes_list_connections | 列出已配置的 Kubernetes 连接 |
| kubernetes_list_namespaces | 列出所有命名空间 |
| kubernetes_list_pods | 列出指定命名空间的 Pod |
| kubernetes_get_pod | 获取 Pod 详细信息 |
| kubernetes_delete_pod | 删除 Pod |
| kubernetes_pod_logs | 获取 Pod 日志 |
| kubernetes_pod_metrics | 获取 Pod 资源指标 |
| kubernetes_list_events | 列出事件 |
| kubernetes_list_deployments | 列出 Deployment |
| kubernetes_list_services | 列出 Service |
| kubernetes_get_resource | 获取任意 Kubernetes 资源 |