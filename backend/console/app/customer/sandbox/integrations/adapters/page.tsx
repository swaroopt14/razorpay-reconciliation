'use client'

import { ADAPTER_CATALOG } from '../../sandbox-fixtures'

export default function IntegrationCatalogPage() {
  return (
    <div className="space-y-5 p-6">
      <div>
        <h1 className="text-xl font-bold text-cx-text">Integration Catalog</h1>
        <p className="mt-0.5 text-sm text-cx-neutral">
          Adapter health and simulation coverage across PSP and banking integrations.
        </p>
      </div>

      <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50/70">
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">adapter_name</th>
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">status</th>
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">version</th>
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">last_event</th>
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">error_rate (24h)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {ADAPTER_CATALOG.map((adapter) => (
              <tr key={adapter.adapterName} className="hover:bg-gray-50/60">
                <td className="px-4 py-2.5 text-sm font-semibold text-cx-text">{adapter.adapterName}</td>
                <td className="px-4 py-2.5 text-xs">
                  <span
                    className={`rounded-full px-2 py-0.5 font-semibold ${
                      adapter.status === 'Connected'
                        ? 'bg-emerald-50 text-emerald-700'
                        : adapter.status === 'Misconfigured'
                          ? 'bg-amber-50 text-amber-700'
                          : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {adapter.status}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-xs font-mono text-cx-neutral">{adapter.version}</td>
                <td className="px-4 py-2.5 text-xs text-cx-neutral">{new Date(adapter.lastEvent).toLocaleString('en-IN')}</td>
                <td className="px-4 py-2.5 text-xs tabular-nums text-cx-text">{adapter.errorRatePct.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
