'use client'

interface AlertRule {
  id: string
  name: string
  condition: string
  threshold: string
  channel: string
  status: 'active' | 'paused' | 'disabled'
  lastTriggered: string
  triggerCount: number
}

const alertRules: AlertRule[] = [
  { id: 'AR-001', name: 'SLA Breach - Ack Latency P95', condition: 'ack_latency_p95 > threshold', threshold: '450ms', channel: 'Slack + Email', status: 'active', lastTriggered: '2m ago', triggerCount: 3 },
  { id: 'AR-002', name: 'Failure Rate Spike', condition: 'failure_rate_1h > threshold', threshold: '2%', channel: 'PagerDuty', status: 'active', lastTriggered: '45m ago', triggerCount: 1 },
  { id: 'AR-003', name: 'Webhook Delivery Failure', condition: 'webhook_failures_1h > threshold', threshold: '10', channel: 'Slack', status: 'active', lastTriggered: '14m ago', triggerCount: 2 },
  { id: 'AR-004', name: 'Recon Lag Warning', condition: 'recon_lag > threshold', threshold: '15min', channel: 'Email', status: 'active', lastTriggered: '22m ago', triggerCount: 1 },
  { id: 'AR-005', name: 'DLQ Queue Backlog', condition: 'dlq_count > threshold', threshold: '50', channel: 'Slack', status: 'active', lastTriggered: '2h ago', triggerCount: 0 },
  { id: 'AR-006', name: 'Provider Down', condition: 'adapter_status == down', threshold: 'any adapter', channel: 'PagerDuty + Slack', status: 'active', lastTriggered: '1d ago', triggerCount: 0 },
  { id: 'AR-007', name: 'Evidence Pack Failure', condition: 'evidence_failed_1h > threshold', threshold: '5', channel: 'Email', status: 'paused', lastTriggered: '3d ago', triggerCount: 0 },
  { id: 'AR-008', name: 'Stale Intent Warning', condition: 'pending_intents_age > threshold', threshold: '30min', channel: 'Slack', status: 'active', lastTriggered: '35m ago', triggerCount: 5 },
]

const statusConfig = {
  active: { label: 'Active', color: 'bg-cx-teal-50 text-cx-teal-700' },
  paused: { label: 'Paused', color: 'bg-amber-50 text-amber-700' },
  disabled: { label: 'Disabled', color: 'bg-gray-100 text-gray-500' },
}

export default function AlertRulesPage() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-cx-text">Alert Rules</h1>
          <p className="text-sm text-cx-neutral mt-0.5">Read-only view of configured alert rules. Editing requires Admin Console.</p>
        </div>
        <span className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg bg-gray-100 text-cx-neutral border border-gray-200">
          Read-Only
        </span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Active Rules', value: alertRules.filter(r => r.status === 'active').length.toString(), color: 'border-l-cx-teal-500' },
          { label: 'Paused', value: alertRules.filter(r => r.status === 'paused').length.toString(), color: 'border-l-amber-500' },
          { label: 'Triggered Today', value: '12', color: 'border-l-cx-purple-500' },
        ].map((s) => (
          <div key={s.label} className={`bg-white rounded-xl border border-gray-100 border-l-4 ${s.color} p-4`}>
            <p className="text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">{s.label}</p>
            <p className="text-2xl font-bold text-cx-text mt-1 tabular-nums">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Rules Table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50/50">
              <th className="px-5 py-3 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Rule</th>
              <th className="px-5 py-3 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Condition</th>
              <th className="px-5 py-3 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Threshold</th>
              <th className="px-5 py-3 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Channel</th>
              <th className="px-5 py-3 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Status</th>
              <th className="px-5 py-3 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Last Triggered</th>
              <th className="px-5 py-3 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Count (24h)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {alertRules.map((rule) => (
              <tr key={rule.id} className="hover:bg-gray-50/50 transition-colors">
                <td className="px-5 py-3">
                  <div>
                    <p className="text-sm font-medium text-cx-text">{rule.name}</p>
                    <p className="text-[10px] font-mono text-cx-neutral">{rule.id}</p>
                  </div>
                </td>
                <td className="px-5 py-3 text-xs font-mono text-cx-neutral">{rule.condition}</td>
                <td className="px-5 py-3 text-sm font-mono font-medium text-cx-text">{rule.threshold}</td>
                <td className="px-5 py-3 text-xs text-cx-text">{rule.channel}</td>
                <td className="px-5 py-3">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusConfig[rule.status].color}`}>
                    {statusConfig[rule.status].label}
                  </span>
                </td>
                <td className="px-5 py-3 text-xs text-cx-neutral">{rule.lastTriggered}</td>
                <td className="px-5 py-3 text-sm font-bold tabular-nums text-cx-text">{rule.triggerCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
