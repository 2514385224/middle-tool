import { defineConnectionAdapter } from './base'
import type { AdapterMeta } from '../../../shared/types'

const KUBERNETES_META: AdapterMeta = {
  type: 'kubernetes',
  name: 'Kubernetes',
  description: 'Kubernetes/OpenShift 集群管理（Pod、Deployment、Service、CRD 等）',
  category: 'other',
  status: 'available',
  icon: '☸️',
  docsUrl: 'https://github.com/containers/kubernetes-mcp-server',
  tools: [
    'kubernetes_list_connections',
    'kubernetes_list_namespaces',
    'kubernetes_list_pods',
    'kubernetes_get_pod',
    'kubernetes_delete_pod',
    'kubernetes_pod_logs',
    'kubernetes_list_events',
    'kubernetes_list_deployments',
    'kubernetes_list_services',
    'kubernetes_get_resource'
  ],
  previewField: 'context',
  connectionFields: [
    {
      key: 'kubeconfig',
      label: 'Kubeconfig 路径',
      type: 'text',
      placeholder: '留空使用 ~/.kube/config',
      group: '连接'
    },
    {
      key: 'context',
      label: 'Context',
      type: 'text',
      placeholder: '留空使用当前 context',
      group: '连接'
    },
    {
      key: 'namespace',
      label: '默认命名空间',
      type: 'text',
      placeholder: '留空使用 default',
      defaultValue: 'default',
      group: '连接'
    },
    {
      key: 'inCluster',
      label: 'In-Cluster 模式',
      type: 'select',
      defaultValue: 'no',
      options: [
        { label: '否（使用 kubeconfig）', value: 'no' },
        { label: '是（Pod 内运行）', value: 'yes' }
      ],
      group: '连接'
    },
    {
      key: 'denied_resources',
      label: '禁用的资源类型',
      type: 'textarea',
      placeholder: '每行一个资源类型，格式: group/version/kind\n如: apps/v1/Deployments\nmetrics.k8s.io/v1beta1/PodMetrics',
      group: '资源控制'
    },
    {
      key: 'read_only',
      label: '只读模式',
      type: 'select',
      defaultValue: 'no',
      options: [
        { label: '否（允许写操作）', value: 'no' },
        { label: '是（仅读操作）', value: 'yes' }
      ],
      group: '资源控制'
    },
    {
      key: 'disable_destructive',
      label: '禁用破坏性操作',
      type: 'select',
      defaultValue: 'no',
      options: [
        { label: '否（允许删除等操作）', value: 'no' },
        { label: '是（禁用删除等操作）', value: 'yes' }
      ],
      group: '资源控制'
    },
    {
      key: 'enabled_tools',
      label: '启用的工具',
      type: 'textarea',
      placeholder: '每行一个工具名称，留空则启用所有工具\n如: kubernetes_list_pods\nkubernetes_get_pod',
      group: '工具控制'
    },
    {
      key: 'disabled_tools',
      label: '禁用的工具',
      type: 'textarea',
      placeholder: '每行一个工具名称\n如: kubernetes_delete_pod\nkubernetes_pod_exec',
      group: '工具控制'
    },
    {
      key: 'toolsets',
      label: '启用的工具集',
      type: 'textarea',
      placeholder: '每行一个工具集名称\n如: helm\ntekton',
      group: '工具控制'
    },
    {
      key: 'stateless',
      label: '无状态模式',
      type: 'select',
      defaultValue: 'no',
      options: [
        { label: '否（启用通知）', value: 'no' },
        { label: '是（禁用通知，适合容器部署）', value: 'yes' }
      ],
      group: '高级'
    },
    {
      key: 'log_level',
      label: '日志级别',
      type: 'select',
      defaultValue: '2',
      options: [
        { label: 'Error (0)', value: '0' },
        { label: 'Warning (1)', value: '1' },
        { label: 'Info (2)', value: '2' },
        { label: 'Debug (3)', value: '3' }
      ],
      group: '高级'
    },
    {
      key: 'log_file',
      label: '日志文件路径',
      type: 'text',
      placeholder: '留空则输出到标准输出',
      group: '高级'
    },
    {
      key: 'list_output',
      label: '列表输出格式',
      type: 'select',
      defaultValue: 'json',
      options: [
        { label: 'JSON', value: 'json' },
        { label: 'Table', value: 'table' },
        { label: 'Wide', value: 'wide' }
      ],
      group: '高级'
    },
    {
      key: 'require_oauth',
      label: '启用 OAuth 认证',
      type: 'select',
      defaultValue: 'no',
      options: [
        { label: '否', value: 'no' },
        { label: '是', value: 'yes' }
      ],
      group: '认证'
    },
    {
      key: 'oauth_audience',
      label: 'OAuth Audience',
      type: 'text',
      placeholder: 'OAuth token audience',
      group: '认证'
    },
    {
      key: 'authorization_url',
      label: '授权服务器 URL',
      type: 'text',
      placeholder: 'OIDC 授权服务器地址',
      group: '认证'
    },
    {
      key: 'skip_jwt_verification',
      label: '跳过 JWT 验证',
      type: 'select',
      defaultValue: 'no',
      options: [
        { label: '否（验证签名）', value: 'no' },
        { label: '是（跳过验证，需可信代理）', value: 'yes' }
      ],
      group: '认证'
    }
  ]
}

export const kubernetesAdapter = defineConnectionAdapter({
  meta: KUBERNETES_META,
  validateConnection(config) {
    // 基本验证，实际连接测试由 MCP server 执行
    if (config.inCluster === 'yes') {
      return null
    }
    return null
  }
})