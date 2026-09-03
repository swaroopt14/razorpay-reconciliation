'use client'

import Link from 'next/link'
import { EVIDENCE_PACKS } from '../sandbox-fixtures'

export default function EvidenceRegistryPage() {
  return (
    <div className="space-y-5 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-cx-text">Evidence Registry</h1>
          <p className="mt-0.5 text-sm text-cx-neutral">
            Registry of generated evidence packs with intent linkage and cryptographic metadata.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/customer/sandbox/evidence/explorer" className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-cx-text">
            Open Explorer
          </Link>
          <Link href="/customer/sandbox/evidence/export" className="rounded-lg bg-cx-purple-600 px-3 py-2 text-xs font-semibold text-white">
            Export
          </Link>
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50/70">
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">evidence_pack_id</th>
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">intent_id</th>
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">merkle_root</th>
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">signature</th>
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">created_at</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {EVIDENCE_PACKS.map((pack) => (
              <tr key={pack.evidencePackId} className="hover:bg-gray-50/60">
                <td className="px-4 py-2.5 text-xs font-mono text-cx-purple-700">
                  <Link href={`/customer/sandbox/evidence/explorer?intent_id=${encodeURIComponent(pack.intentId)}`} className="hover:underline">
                    {pack.evidencePackId}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-xs font-mono text-cx-text">{pack.intentId}</td>
                <td className="px-4 py-2.5 text-xs font-mono text-cx-neutral">{pack.merkleRoot}</td>
                <td className="px-4 py-2.5 text-xs font-mono text-cx-neutral">{pack.signature}</td>
                <td className="px-4 py-2.5 text-xs text-cx-neutral">{new Date(pack.createdAt).toLocaleString('en-IN')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
