'use client'

import { useState } from 'react'
import { EVIDENCE_PACKS } from '../../sandbox-fixtures'

type ExportFormat = 'JSON pack' | 'Signed ZIP' | 'Regulator Format'

type ExportJob = {
  exportId: string
  format: ExportFormat
  status: 'Queued' | 'In Progress' | 'Completed' | 'Failed'
  size: string
  createdAt: string
}

const INITIAL_EXPORTS: ExportJob[] = [
  { exportId: 'exp_20260226_01', format: 'Signed ZIP', status: 'Completed', size: '1.8 MB', createdAt: '2026-02-26T13:30:00+05:30' },
  { exportId: 'exp_20260226_02', format: 'JSON pack', status: 'Completed', size: '240 KB', createdAt: '2026-02-26T13:34:00+05:30' },
  { exportId: 'exp_20260226_03', format: 'Regulator Format', status: 'In Progress', size: '-', createdAt: '2026-02-26T13:41:00+05:30' },
]

export default function EvidenceExportPage() {
  const [format, setFormat] = useState<ExportFormat>('Signed ZIP')
  const [statusFilter, setStatusFilter] = useState('all')
  const [jobs, setJobs] = useState<ExportJob[]>(INITIAL_EXPORTS)

  const createExport = () => {
    const nextId = `exp_${Date.now()}`
    const newJob: ExportJob = {
      exportId: nextId,
      format,
      status: 'Queued',
      size: '-',
      createdAt: new Date().toISOString(),
    }
    setJobs((current) => [newJob, ...current])
    window.dispatchEvent(
      new CustomEvent('cx:toast', {
        detail: {
          type: 'success',
          title: 'Export queued',
          desc: `${nextId} (${format})`,
        },
      })
    )
  }

  const visibleJobs = jobs.filter((job) => (statusFilter === 'all' ? true : job.status === statusFilter))

  return (
    <div className="space-y-5 p-6">
      <div>
        <h1 className="text-xl font-bold text-cx-text">Evidence Export</h1>
        <p className="mt-0.5 text-sm text-cx-neutral">
          Export packs for internal audit and regulator-facing review bundles.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_1.3fr]">
        <section className="rounded-2xl border border-gray-100 bg-white p-4">
          <h2 className="text-sm font-semibold text-cx-text">Export configuration</h2>
          <div className="mt-3 space-y-3">
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">Format</p>
              <select
                value={format}
                onChange={(event) => setFormat(event.target.value as ExportFormat)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-cx-purple-500"
              >
                <option>JSON pack</option>
                <option>Signed ZIP</option>
                <option>Regulator Format</option>
              </select>
            </div>

            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">Date range</p>
              <div className="grid grid-cols-2 gap-2">
                <input type="date" className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-cx-purple-500" />
                <input type="date" className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-cx-purple-500" />
              </div>
            </div>

            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">Intent / evidence filter</p>
              <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-cx-purple-500">
                {EVIDENCE_PACKS.map((pack) => (
                  <option key={pack.evidencePackId} value={pack.evidencePackId}>
                    {pack.evidencePackId} • {pack.intentId}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            onClick={createExport}
            className="mt-4 w-full rounded-lg bg-cx-purple-600 py-2.5 text-sm font-semibold text-white hover:bg-cx-purple-700"
          >
            Create Export
          </button>

          <div className="mt-3 rounded-xl border border-gray-100 bg-gray-50/70 px-3 py-2 text-[11px] text-cx-neutral">
            Exports include tokens and hashes only; personal data is minimized per sandbox policy.
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
          <header className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-cx-text">Export list</h2>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs outline-none focus:border-cx-purple-500"
            >
              <option value="all">All status</option>
              <option value="Queued">Queued</option>
              <option value="In Progress">In Progress</option>
              <option value="Completed">Completed</option>
              <option value="Failed">Failed</option>
            </select>
          </header>

          <table className="w-full">
            <thead>
              <tr className="bg-gray-50/70">
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">export_id</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">format</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">status</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">size</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">created_at</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {visibleJobs.map((job) => (
                <tr key={job.exportId} className="hover:bg-gray-50/60">
                  <td className="px-4 py-2.5 text-xs font-mono text-cx-purple-700">{job.exportId}</td>
                  <td className="px-4 py-2.5 text-xs text-cx-text">{job.format}</td>
                  <td className="px-4 py-2.5 text-xs">
                    <span
                      className={`rounded-full px-2 py-0.5 font-semibold ${
                        job.status === 'Completed'
                          ? 'bg-emerald-50 text-emerald-700'
                          : job.status === 'Failed'
                            ? 'bg-red-50 text-red-700'
                            : job.status === 'In Progress'
                              ? 'bg-blue-50 text-blue-700'
                              : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      {job.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-cx-neutral">{job.size}</td>
                  <td className="px-4 py-2.5 text-xs text-cx-neutral">{new Date(job.createdAt).toLocaleString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  )
}
