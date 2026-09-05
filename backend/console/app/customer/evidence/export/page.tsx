'use client'

import { useState } from 'react'
import Link from 'next/link'
import { MOCK_INTENT_IDS } from '../../mock'

const exportHistory = [
  { id: 'EXP-041', type: 'PDF Report', scope: `Intent ${MOCK_INTENT_IDS[0]}`, size: '1.2 MB', createdAt: '14:25:00', status: 'ready' },
  { id: 'EXP-040', type: 'JSON Bundle', scope: 'EP-2847 Full Pack', size: '24 KB', createdAt: '14:24:30', status: 'ready' },
  { id: 'EXP-039', type: 'PDF Report', scope: 'Daily Recon Summary', size: '3.4 MB', createdAt: '12:00:00', status: 'ready' },
  { id: 'EXP-038', type: 'CSV Export', scope: 'Failed Intents (24h)', size: '156 KB', createdAt: '09:00:00', status: 'ready' },
  { id: 'EXP-037', type: 'JSON Bundle', scope: 'Audit Trail (Feb 9)', size: '2.1 MB', createdAt: 'Feb 9, 23:59', status: 'ready' },
]

export default function ExportCenterPage() {
  const [exportFormat, setExportFormat] = useState('pdf')
  const [exportScope, setExportScope] = useState('intent')

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2 text-xs text-cx-neutral">
        <Link href="/customer/evidence" className="hover:text-cx-purple-600 transition-colors">Evidence Packs</Link>
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
        <span className="text-cx-text font-medium">Export Center</span>
      </div>

      <div>
        <h1 className="text-xl font-bold text-cx-text">Export Center</h1>
        <p className="text-sm text-cx-neutral mt-0.5">Generate PDF/JSON evidence exports for audit and compliance</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* New Export Form */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-cx-text mb-4">Create New Export</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-cx-neutral uppercase tracking-wider mb-1.5">Format</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: 'pdf', label: 'PDF' },
                  { value: 'json', label: 'JSON' },
                  { value: 'csv', label: 'CSV' },
                ].map((f) => (
                  <button
                    key={f.value}
                    onClick={() => setExportFormat(f.value)}
                    className={`py-2 text-xs font-semibold rounded-lg border transition-all ${
                      exportFormat === f.value
                        ? 'border-cx-purple-500 bg-cx-purple-50 text-cx-purple-700'
                        : 'border-gray-200 bg-white text-cx-text hover:border-gray-300'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-cx-neutral uppercase tracking-wider mb-1.5">Scope</label>
              <select
                value={exportScope}
                onChange={(e) => setExportScope(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 text-cx-text focus:ring-1 focus:ring-cx-purple-500 focus:border-cx-purple-500 outline-none"
              >
                <option value="intent">Single Intent</option>
                <option value="batch">Batch (Date Range)</option>
                <option value="recon">Recon Summary</option>
                <option value="audit">Full Audit Trail</option>
              </select>
            </div>
            {exportScope === 'intent' && (
              <div>
                <label className="block text-xs font-semibold text-cx-neutral uppercase tracking-wider mb-1.5">Intent ID</label>
                <input
                  type="text"
                  placeholder={MOCK_INTENT_IDS[0]}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 text-cx-text placeholder-gray-400 focus:ring-1 focus:ring-cx-purple-500 focus:border-cx-purple-500 outline-none font-mono"
                />
              </div>
            )}
            {exportScope === 'batch' && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-cx-neutral uppercase tracking-wider mb-1.5">From</label>
                  <input type="date" className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 text-cx-text focus:ring-1 focus:ring-cx-purple-500 focus:border-cx-purple-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-cx-neutral uppercase tracking-wider mb-1.5">To</label>
                  <input type="date" className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 text-cx-text focus:ring-1 focus:ring-cx-purple-500 focus:border-cx-purple-500 outline-none" />
                </div>
              </div>
            )}
            <button className="w-full py-2.5 text-sm font-semibold bg-cx-purple-600 text-white rounded-lg hover:bg-cx-purple-700 transition-colors flex items-center justify-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
              Generate Export
            </button>
          </div>
        </div>

        {/* Export History */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-cx-text">Export History</h3>
            <p className="text-xs text-cx-neutral mt-0.5">Previously generated exports</p>
          </div>
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50/50">
                <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Export ID</th>
                <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Format</th>
                <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Scope</th>
                <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Size</th>
                <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Created</th>
                <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {exportHistory.map((exp) => (
                <tr key={exp.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-5 py-3 text-sm font-mono font-semibold text-cx-purple-600">{exp.id}</td>
                  <td className="px-5 py-3">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-cx-text">{exp.type}</span>
                  </td>
                  <td className="px-5 py-3 text-xs text-cx-text">{exp.scope}</td>
                  <td className="px-5 py-3 text-xs text-cx-neutral tabular-nums">{exp.size}</td>
                  <td className="px-5 py-3 text-xs text-cx-neutral">{exp.createdAt}</td>
                  <td className="px-5 py-3">
                    <button className="text-xs font-semibold text-cx-purple-600 hover:text-cx-purple-700">Download</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
