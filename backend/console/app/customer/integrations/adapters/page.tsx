'use client'

interface Adapter {
  id: string
  name: string
  provider: string
  type: string
  status: 'healthy' | 'degraded' | 'down'
  uptime: string
  latencyP50: string
  latencyP95: string
  lastCheck: string
  successRate: string
}

const adapters: Adapter[] = [
  { id: 'adp_001', name: 'HDFC Bank NEFT', provider: 'HDFC', type: 'Bank Transfer', status: 'healthy', uptime: '99.99%', latencyP50: '1.2s', latencyP95: '3.4s', lastCheck: '30s ago', successRate: '99.7%' },
  { id: 'adp_002', name: 'ICICI Bank RTGS', provider: 'ICICI', type: 'Bank Transfer', status: 'healthy', uptime: '99.95%', latencyP50: '0.8s', latencyP95: '2.1s', lastCheck: '30s ago', successRate: '99.9%' },
  { id: 'adp_003', name: 'Razorpay Gateway', provider: 'Razorpay', type: 'Payment Gateway', status: 'degraded', uptime: '99.80%', latencyP50: '2.4s', latencyP95: '8.7s', lastCheck: '30s ago', successRate: '97.2%' },
  { id: 'adp_004', name: 'PayU Gateway', provider: 'PayU', type: 'Payment Gateway', status: 'healthy', uptime: '99.97%', latencyP50: '0.9s', latencyP95: '2.8s', lastCheck: '30s ago', successRate: '99.5%' },
  { id: 'adp_005', name: 'NPCI UPI', provider: 'NPCI', type: 'UPI', status: 'healthy', uptime: '99.92%', latencyP50: '0.5s', latencyP95: '1.8s', lastCheck: '30s ago', successRate: '99.8%' },
  { id: 'adp_006', name: 'SBI IMPS', provider: 'SBI', type: 'Bank Transfer', status: 'down', uptime: '98.50%', latencyP50: '-', latencyP95: '-', lastCheck: '30s ago', successRate: '0%' },
]

const statusConfig = {
  healthy: { label: 'Healthy', color: 'bg-cx-teal-50 text-cx-teal-700', dot: 'bg-cx-teal-500' },
  degraded: { label: 'Degraded', color: 'bg-cx-orange-50 text-cx-orange-700', dot: 'bg-cx-orange-500' },
  down: { label: 'Down', color: 'bg-red-50 text-red-700', dot: 'bg-red-500' },
}

export default function AdapterStatusPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-cx-text">Adapter Status</h1>
        <p className="text-sm text-cx-neutral mt-0.5">Summary view of provider/bank adapter health</p>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Healthy', count: adapters.filter(a => a.status === 'healthy').length, total: adapters.length, color: 'border-l-cx-teal-500', bg: 'bg-cx-teal-500' },
          { label: 'Degraded', count: adapters.filter(a => a.status === 'degraded').length, total: adapters.length, color: 'border-l-cx-orange-500', bg: 'bg-cx-orange-500' },
          { label: 'Down', count: adapters.filter(a => a.status === 'down').length, total: adapters.length, color: 'border-l-red-500', bg: 'bg-red-500' },
        ].map((s) => (
          <div key={s.label} className={`bg-white rounded-xl border border-gray-100 border-l-4 ${s.color} p-4`}>
            <p className="text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">{s.label}</p>
            <p className="text-3xl font-bold text-cx-text mt-1 tabular-nums">{s.count}<span className="text-lg text-cx-neutral">/{s.total}</span></p>
          </div>
        ))}
      </div>

      {/* Adapter Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {adapters.map((adapter) => (
          <div key={adapter.id} className="bg-white rounded-xl border border-gray-100 p-5 hover:shadow-md hover:border-cx-purple-100 transition-all">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${statusConfig[adapter.status].dot}`} />
                  <h3 className="text-sm font-semibold text-cx-text">{adapter.name}</h3>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] px-2 py-0.5 rounded bg-gray-100 text-cx-neutral">{adapter.provider}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-gray-100 text-cx-neutral">{adapter.type}</span>
                </div>
              </div>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusConfig[adapter.status].color}`}>
                {statusConfig[adapter.status].label}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-3 pt-3 border-t border-gray-100">
              {[
                { label: 'Uptime', value: adapter.uptime },
                { label: 'P50 Latency', value: adapter.latencyP50 },
                { label: 'P95 Latency', value: adapter.latencyP95 },
                { label: 'Success', value: adapter.successRate },
              ].map((m) => (
                <div key={m.label} className="text-center">
                  <p className="text-sm font-bold text-cx-text tabular-nums">{m.value}</p>
                  <p className="text-[10px] text-cx-neutral">{m.label}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Note */}
      <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 flex items-start gap-3">
        <svg className="w-4 h-4 text-cx-neutral flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
        </svg>
        <p className="text-xs text-cx-neutral">
          This is a summary-only view. Detailed adapter configuration and logs are managed in the Admin Console.
          Last refreshed: 30 seconds ago.
        </p>
      </div>
    </div>
  )
}
