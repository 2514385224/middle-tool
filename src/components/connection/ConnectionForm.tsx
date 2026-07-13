import { FormEvent } from 'react'
import type { AdapterMeta, ConnectionField, ConnectionTestResult } from '../../types'
import { groupFields } from './connectionUtils'
import './ConnectionForm.css'

interface ConnectionFormProps {
  adapter: AdapterMeta
  name: string
  config: Record<string, string>
  onNameChange: (name: string) => void
  onConfigChange: (config: Record<string, string>) => void
  onSubmit: () => void
  onCancel: () => void
  submitLabel?: string
  readOnly?: boolean
  onTest?: () => void
  testing?: boolean
  testResult?: ConnectionTestResult | null
  canTest?: boolean
}

function renderFieldInput(
  field: ConnectionField,
  config: Record<string, string>,
  onChange: (config: Record<string, string>) => void,
  readOnly: boolean
) {
  if (field.type === 'select') {
    return (
      <select
        value={config[field.key] ?? field.defaultValue ?? ''}
        required={field.required && !readOnly}
        disabled={readOnly}
        onChange={(e) => onChange({ ...config, [field.key]: e.target.value })}
      >
        {field.options?.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    )
  }

  return (
    <input
      type={field.type === 'password' ? 'password' : field.type === 'number' ? 'number' : 'text'}
      value={config[field.key] ?? ''}
      placeholder={field.placeholder}
      required={field.required && !readOnly}
      disabled={readOnly}
      onChange={(e) => onChange({ ...config, [field.key]: e.target.value })}
    />
  )
}

export default function ConnectionForm({
  adapter,
  name,
  config,
  onNameChange,
  onConfigChange,
  onSubmit,
  onCancel,
  submitLabel = '保存',
  readOnly = false,
  onTest,
  testing = false,
  testResult = null,
  canTest = true
}: ConnectionFormProps) {
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (readOnly) return
    onSubmit()
  }

  return (
    <form className="connection-form" onSubmit={handleSubmit}>
      <div className="form-group">
        <label>连接名称 *</label>
        <input
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder={`如：生产-${adapter.name}、测试-${adapter.name}`}
          required={!readOnly}
          disabled={readOnly}
        />
        <span className="field-hint">名称唯一即可；建议带环境前缀区分，如 prod-loki、test-rocketmq</span>
      </div>

      {Array.from(groupFields(adapter.connectionFields)).map(([group, fields]) => (
        <div key={group} className="connection-form-section">
          <div className="field-group-title">{group}</div>
          {fields.map((field) => (
            <div key={field.key} className="form-group">
              <label>
                {field.label}
                {field.required && ' *'}
              </label>
              {renderFieldInput(field, config, onConfigChange, readOnly)}
              {field.envVar && (
                <span className="field-hint">
                  环境变量: <code>{field.envVar}</code>
                </span>
              )}
            </div>
          ))}
        </div>
      ))}

      {testResult && (
        <div
          className={`connection-test-feedback ${testResult.ok ? 'is-success' : 'is-error'}`}
          role="status"
        >
          <span>{testResult.message}</span>
          {testResult.detail && <span className="connection-test-detail">{testResult.detail}</span>}
        </div>
      )}

      <div className="connection-form-actions">
        <button type="button" className="btn-secondary" onClick={onCancel}>
          {readOnly ? '返回' : '取消'}
        </button>
        {!readOnly && onTest && (
          <button
            type="button"
            className="btn-secondary"
            onClick={onTest}
            disabled={!canTest || testing}
          >
            {testing ? '测试中…' : '测试连接'}
          </button>
        )}
        {!readOnly && (
          <button type="submit" className="btn-primary">
            {submitLabel}
          </button>
        )}
      </div>
    </form>
  )
}
