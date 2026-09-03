'use client'

import { fetchException } from '@/services/protocol/controlPlaneClient'
import {
  ControlPlaneHeader,
  EvidenceChip,
  PageState,
  ProtocolJsonPanel,
} from './ProtocolChrome'
import { useProtocolQuery } from './useProtocolQuery'

export function ExceptionWorkbenchSurface({ exceptionId }: { exceptionId: string }) {
  const { data, error, loading } = useProtocolQuery(`exc:${exceptionId}`, () => fetchException(exceptionId))

  return (
    <div className="bg-[#F7F8FB]">
      <ControlPlaneHeader
        title="Exception Workbench"
        subtitle="Agents shorten investigation and propose the next safe action. Any new money-affecting action needs a new Action Proposal and fresh authority. The original PAC is immutable."
        chips={<EvidenceChip kind="inferred">Late signal · no regression</EvidenceChip>}
      />
      <PageState loading={loading} error={error}>
        {data ? (
          <div className="space-y-4 p-6">
            <section className="rounded-lg border border-[#D8DEE9] bg-white p-4">
              <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-[#B7791F]">{String(data.type)}</p>
              <h2 className="mt-1 text-[16px] font-semibold text-[#0B1324]">{String(data.title)}</h2>
              <p className="mt-2 text-[13px] text-[#64748B]">{String(data.root_cause)}</p>
              <p className="mt-3 text-[13px] text-[#0B1324]">{String(data.authority_impact)}</p>
              <p className="mt-1 text-[12px] text-[#64748B]">Owner {String(data.owner)} · {String(data.sla)}</p>
            </section>
            <ProtocolJsonPanel object={data} title="Exception + linked proposal" />
          </div>
        ) : null}
      </PageState>
    </div>
  )
}
