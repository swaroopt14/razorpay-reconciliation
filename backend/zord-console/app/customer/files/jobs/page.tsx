'use client'

const jobs = [
  {
    id: 'ing_job_20260302_001',
    fileName: 'merchant_batch_20260302.csv',
    startedAt: '2026-03-02 09:22:18',
    status: 'Completed',
    totalRows: 5820,
    successRows: 5789,
    failedRows: 31,
    processingMs: 12440,
  },
  {
    id: 'ing_job_20260301_017',
    fileName: 'refund_batch_20260301.csv',
    startedAt: '2026-03-01 18:07:04',
    status: 'Completed with Errors',
    totalRows: 2120,
    successRows: 2078,
    failedRows: 42,
    processingMs: 8630,
  },
  {
    id: 'ing_job_20260301_012',
    fileName: 'provider_delta_20260301.csv',
    startedAt: '2026-03-01 14:11:49',
    status: 'Running',
    totalRows: 12000,
    successRows: 9441,
    failedRows: 8,
    processingMs: 22100,
  },
]

const statusClass: Record<string, string> = {
  Completed: 'bg-emerald-50 text-emerald-700',
  'Completed with Errors': 'bg-amber-50 text-amber-700',
  Running: 'bg-cx-purple-50 text-cx-purple-700',
}

export default function CustomerIngestionJobsPage() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-cx-text">Ingestion Jobs</h1>
          <p className="text-sm text-cx-neutral mt-0.5">Track bulk file processing, row errors, and retry actions.</p>
        </div>
        <button className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-cx-text hover:bg-gray-50">
          Retry Failed Rows
        </button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Jobs Today', value: '19' },
          { label: 'Rows Processed', value: '1,84,020' },
          { label: 'Success Rate', value: '99.2%' },
          { label: 'Avg Processing Time', value: '11.4s' },
        ].map((summary) => (
          <div key={summary.label} className="rounded-xl border border-gray-100 bg-white p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">{summary.label}</p>
            <p className="mt-1.5 text-xl font-bold tabular-nums text-cx-text">{summary.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50/70">
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">Job ID</th>
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">File</th>
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">Started</th>
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">Status</th>
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">Rows (S/F/T)</th>
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">Duration</th>
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {jobs.map((job) => (
              <tr key={job.id} className="hover:bg-gray-50/50">
                <td className="px-4 py-3 text-xs font-mono text-cx-purple-700">{job.id}</td>
                <td className="px-4 py-3 text-xs text-cx-text">{job.fileName}</td>
                <td className="px-4 py-3 text-xs text-cx-neutral">{job.startedAt}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusClass[job.status]}`}>{job.status}</span>
                </td>
                <td className="px-4 py-3 text-xs font-mono text-cx-text">
                  {job.successRows}/{job.failedRows}/{job.totalRows}
                </td>
                <td className="px-4 py-3 text-xs tabular-nums text-cx-text">{job.processingMs} ms</td>
                <td className="px-4 py-3">
                  <button className="rounded-md border border-gray-200 px-2 py-1 text-[11px] font-semibold text-cx-text hover:bg-gray-50">
                    View Report
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
