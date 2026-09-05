'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  fetchProtocolCatalog,
  verifyPac,
  type ControlPlaneActionSummary,
  type ProtocolCompatibilityRow,
} from '@/services/protocol/controlPlaneClient'
import { useDemoBatchReady } from '@/services/payout-command/demo/demoBatchReadiness'
import {
  CROSS_BORDER_PAC_ID,
  SCENARIO_CROSS_BORDER,
  withScenarioScope,
} from '@/services/payout-command/demo/scenarioMode'
import type { ProtocolVerifyResult } from '@/types/protocol'
import {
  ControlPlaneHeader,
  CopyChip,
  EvidenceChip,
  PageState,
  ProtocolJsonPanel,
} from './ProtocolChrome'
import { useProtocolQuery } from './useProtocolQuery'

type SchemaObject = { $id?: string; type?: string; required?: string[] }

type ProtocolCatalog = {
  spec_version?: string
  media_types?: string[]
  signature_profile?: {
    canonicalization?: string
    digest?: string
    signature?: string
    kid?: string
  }
  jwks?: { keys?: Array<Record<string, string>> }
  state_machine?: {
    version?: string
    formation?: string[]
    execution?: string[]
    outcome?: string[]
    terminal?: string[]
    post_outcome?: string[]
    overlays?: string[]
  }
  objects?: Record<string, SchemaObject>
  compatibility?: ProtocolCompatibilityRow[]
  batch_actions?: ControlPlaneActionSummary[]
  batch_totals?: {
    intent_count: number
    intended_display: string
  }
  sample_ids?: Record<string, string>
}

const HAPPY_PATH = [
  'DRAFT',
  'PROPOSED',
  'AWAITING_AUTHORITY',
  'AUTHORIZED',
  'DISPATCH_READY',
  'DISPATCHED',
  'ACKNOWLEDGED',
  'IN_PROCESS',
  'SETTLED_PROVISIONAL',
  'SETTLED_CONFIRMED',
  'FINAL',
] as const

function evidenceClass(state: string) {
  if (state.includes('SETTLED_CONFIRMED') || state === 'FINAL') return 'BANK'
  if (state.includes('SETTLED_PROVISIONAL')) return 'STMT'
  if (state.includes('PROCESS') || state.includes('ACK')) return 'PSP'
  if (state.includes('DISPATCH')) return 'PAC'
  return 'SRC'
}

function stateKind(state: string): 'verified' | 'deterministic' | 'inferred' | 'blocked' {
  if (state.includes('SETTLED') || state === 'FINAL') return 'verified'
  if (state.includes('REJECT') || state.includes('FAIL') || state.includes('EXPIRED')) return 'blocked'
  if (state.includes('PROCESS') || state.includes('DISPATCH') || state.includes('ACK')) return 'deterministic'
  return 'inferred'
}

function isAgentProtocol(name: string) {
  return name === 'MCP' || name === 'A2A'
}

function utcClock() {
  return `${new Date().toISOString().slice(11, 19)} UTC`
}

export function ProtocolInspectorSurface() {
  const { data, error, loading } = useProtocolQuery('protocol', fetchProtocolCatalog)
  const { ready: intentReady } = useDemoBatchReady(undefined, { require: 'intent' })
  const catalog = data as ProtocolCatalog | null
  const actions = catalog?.batch_actions ?? []
  const compatibility = catalog?.compatibility ?? []
  const objects = catalog?.objects ?? {}
  const objectNames = Object.keys(objects)
  const href = (path: string) => withScenarioScope(path, SCENARIO_CROSS_BORDER)

  const [clock, setClock] = useState('')
  const [query, setQuery] = useState('')
  const [selectedName, setSelectedName] = useState('PaymentActionContract')
  const [showJwks, setShowJwks] = useState(false)
  const [selectedTrace, setSelectedTrace] = useState('')
  const [tamper, setTamper] = useState(false)
  const [verify, setVerify] = useState<{
    result: ProtocolVerifyResult
    stored_digest?: string
    computed_digest?: string
    error?: string
  } | null>(null)
  const [verifyBusy, setVerifyBusy] = useState(false)

  useEffect(() => {
    const tick = () => setClock(utcClock())
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    if (!selectedTrace && actions[0]?.trace_id) setSelectedTrace(actions[0].trace_id)
  }, [actions, selectedTrace])

  useEffect(() => {
    const q = query.trim()
    if (!q) return
    const match = actions.find(
      (row) =>
        row.trace_id === q ||
        row.pac_id === q ||
        row.human_ref.toLowerCase() === q.toLowerCase(),
    )
    if (match) setSelectedTrace(match.trace_id)
  }, [query, actions])

  const selected = actions.find((row) => row.trace_id === selectedTrace) ?? actions[0]
  const pacId = selected?.pac_id || catalog?.sample_ids?.pac_id || CROSS_BORDER_PAC_ID

  useEffect(() => {
    if (!intentReady || !pacId) return
    let cancelled = false
    setVerifyBusy(true)
    const amount = Number(selected?.amount_minor ?? 550_000)
    void verifyPac(pacId, tamper ? { tamper_amount_minor: amount + 1 } : {})
      .then((result) => {
        if (!cancelled) setVerify(result)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setVerify({
            result: 'INVALID',
            error: err instanceof Error ? err.message : 'verify_failed',
          })
        }
      })
      .finally(() => {
        if (!cancelled) setVerifyBusy(false)
      })
    return () => {
      cancelled = true
    }
  }, [intentReady, pacId, selected?.amount_minor, tamper])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return actions
    return actions.filter((row) =>
      [row.trace_id, row.pac_id, row.human_ref, row.beneficiary, row.rail, row.current_state]
        .join(' ')
        .toLowerCase()
        .includes(q),
    )
  }, [actions, query])

  const selectedSchema = objects[selectedName] ?? objects[objectNames[0]]
  const machine = catalog?.state_machine
  const profile = catalog?.signature_profile
  const jwk = catalog?.jwks?.keys?.[0]
  const verifyValid = verify?.result === 'VALID' || verify?.result === 'VALID WITH CAVEATS'

  return (
    <div className="flex min-h-full flex-col bg-[#F7F8FB]">
      <ControlPlaneHeader
        title="Protocol Inspector"
        subtitle="Versioned objects, cryptographic media schemas, and agent interoperability status. Adapters stay Planned until a live binding exists."
        chips={
          <>
            <EvidenceChip kind="deterministic">{catalog?.spec_version ?? 'zord.action.v1'}</EvidenceChip>
            <EvidenceChip kind="verified">{profile?.signature ?? 'JWS ES256'}</EvidenceChip>
            <EvidenceChip kind="inferred">Adapters planned</EvidenceChip>
          </>
        }
      />

      <div className="flex items-center justify-between gap-3 border-b border-[#D8DEE9] bg-[#0B1324] px-6 py-2.5 text-[11px] text-[#E2E8F0]">
        <p className="font-semibold uppercase tracking-[0.08em]">
          Demo system engine · tenant {catalog?.sample_ids?.trace_id ? 'novacell_eu' : '—'} · sandbox
        </p>
        <div className="flex min-w-0 items-center gap-3">
          <label className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 uppercase tracking-[0.08em] text-[#94A3B8]">Trace</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="trc_ · pac_ · PAY-00"
              className="h-7 w-[220px] rounded-md border border-white/15 bg-white/5 px-2 font-mono text-[11px] text-white outline-none placeholder:text-[#64748B] focus:border-[#2E5BFF]"
            />
          </label>
          <span className="tabular-nums text-[#94A3B8]" suppressHydrationWarning>
            {clock || '--:--:-- UTC'}
          </span>
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <PageState loading={loading} error={error}>
          {catalog ? (
            <div className="space-y-4 p-6">
              <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                <section className="rounded-lg border border-[#D8DEE9] bg-white p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#64748B]">
                    Cryptographic profile
                  </p>
                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[13px]">
                    <div>
                      <dt className="text-[11px] text-[#64748B]">Namespace</dt>
                      <dd className="font-medium text-[#0B1324]">{catalog.spec_version}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-[#64748B]">Canonicalization</dt>
                      <dd className="font-medium text-[#0B1324]">{profile?.canonicalization} (JCS)</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-[#64748B]">Digest</dt>
                      <dd className="font-medium text-[#0B1324]">{profile?.digest}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-[#64748B]">Signature</dt>
                      <dd className="font-medium text-[#0B1324]">Detached {profile?.signature}</dd>
                    </div>
                  </dl>
                  <div className="mt-4 rounded-md border border-[#D8DEE9] bg-[#F7F8FB] p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#64748B]">
                      Active JWKS verifier
                    </p>
                    <p className="mt-2 font-mono text-[12px] text-[#0B1324]">kid {jwk?.kid ?? profile?.kid}</p>
                    <p className="mt-1 text-[12px] text-[#64748B]">
                      {jwk?.kty}-{jwk?.crv} · {jwk?.alg} · use={jwk?.use}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <CopyChip label="kid" value={String(jwk?.kid ?? profile?.kid ?? '')} />
                      <button
                        type="button"
                        className="h-8 rounded-md border border-[#D8DEE9] bg-white px-3 text-[12px] font-semibold text-[#0B1324]"
                        onClick={() => setShowJwks((v) => !v)}
                      >
                        {showJwks ? 'Hide JWKS' : 'View JWKS'}
                      </button>
                    </div>
                    {showJwks ? (
                      <pre className="mt-3 max-h-40 overflow-auto text-[11px] leading-relaxed text-[#334155]">
                        {JSON.stringify(catalog.jwks, null, 2)}
                      </pre>
                    ) : null}
                  </div>
                  {intentReady ? (
                  <div
                    className={`mt-4 rounded-md border-l-4 p-3 ${
                      verifyValid && !tamper
                        ? 'border-[#138A63] bg-[#E7F6F0]'
                        : 'border-[#C2413B] bg-[#F8E8E7]'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[12px] font-semibold text-[#0B1324]">
                        PAC signature {verifyBusy ? '…' : verify?.result ?? '—'}
                      </p>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={tamper}
                        onClick={() => {
                          setVerify(null)
                          setTamper((v) => !v)
                        }}
                        className={`h-8 rounded-md px-3 text-[12px] font-semibold ${
                          tamper
                            ? 'bg-[#C2413B] text-white'
                            : 'border border-[#D8DEE9] bg-white text-[#0B1324]'
                        }`}
                      >
                        Tamper amount +₹0.01 {tamper ? 'on' : 'off'}
                      </button>
                    </div>
                    <p className="mt-1 font-mono text-[11px] text-[#334155]">{pacId}</p>
                    {verify?.error ? (
                      <p className="mt-1 text-[12px] font-medium text-[#C2413B]">{verify.error}</p>
                    ) : null}
                    {tamper ? (
                      <p className="mt-1 text-[12px] text-[#C2413B]">
                        Digest mismatch — canonical bytes no longer match the sealed Payment Action Contract.
                      </p>
                    ) : (
                      <p className="mt-1 text-[12px] text-[#138A63]">
                        RFC 8785 digest matches the detached JWS on the sealed contract.
                      </p>
                    )}
                  </div>
                  ) : (
                    <p className="mt-4 text-[12px] text-[#64748B]">
                      PAC verify unlocks after an obligation file is uploaded.
                    </p>
                  )}
                </section>

                <section className="rounded-lg border border-[#D8DEE9] bg-white p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#64748B]">
                      Protocol registry matrix
                    </p>
                    <EvidenceChip kind="inferred">Planned</EvidenceChip>
                  </div>
                  <p className="mt-1 text-[12px] text-[#64748B]">
                    Binding type, transport, and object mapping keys the agent would match against. None of these
                    adapters are live.
                  </p>
                  <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                    {compatibility.map((row) => {
                      const agent = isAgentProtocol(row.protocol)
                      return (
                        <li
                          key={row.protocol}
                          className={`rounded-md border border-[#D8DEE9] border-l-[3px] p-3 ${
                            agent ? 'border-l-[#6D4AFF]' : 'border-l-[#B7791F]'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-[13px] font-semibold text-[#0B1324]">{row.protocol}</p>
                            <EvidenceChip kind={agent ? 'agent' : 'inferred'}>{row.status}</EvidenceChip>
                          </div>
                          <p className="mt-1 text-[11px] font-medium text-[#0B1324]">{row.binding_type}</p>
                          {row.transport ? (
                            <p className="mt-0.5 font-mono text-[10px] text-[#64748B]">{row.transport}</p>
                          ) : null}
                          <p className="mt-1 text-[12px] text-[#64748B]">{row.note}</p>
                          {row.mapping_keys?.length ? (
                            <p className="mt-2 font-mono text-[10px] leading-relaxed text-[#334155]">
                              {row.mapping_keys.join(' · ')}
                            </p>
                          ) : null}
                          {row.exposed_tools?.length ? (
                            <p className="mt-1 text-[10px] text-[#6D4AFF]">
                              tools {row.exposed_tools.join(', ')}
                            </p>
                          ) : null}
                        </li>
                      )
                    })}
                  </ul>
                </section>
              </div>

              <section className="rounded-lg border border-[#D8DEE9] bg-white p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#64748B]">
                  State machine · {machine?.version ?? 'payout-lifecycle-v1'}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-1">
                  {HAPPY_PATH.map((state, i) => {
                    const current = selected?.current_state === state || (!selected && state === 'SETTLED_CONFIRMED')
                    const kind = stateKind(state)
                    return (
                      <span key={state} className="inline-flex items-center gap-1">
                        {i > 0 ? <span className="text-[11px] text-[#94A3B8]">→</span> : null}
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] ${
                            current
                              ? kind === 'verified'
                                ? 'bg-[#138A63] text-white'
                                : 'bg-[#2E5BFF] text-white'
                              : 'bg-[#F7F8FB] text-[#64748B]'
                          }`}
                        >
                          {state.replace(/_/g, ' ')}
                        </span>
                      </span>
                    )
                  })}
                </div>
                <div className="mt-3 flex flex-wrap gap-4 text-[11px] text-[#64748B]">
                  <p>
                    Terminal {machine?.terminal?.join(' · ')}
                  </p>
                  <p>
                    Post-outcome {machine?.post_outcome?.join(' · ')}
                  </p>
                  <p>
                    Overlays {machine?.overlays?.join(' · ')}
                  </p>
                </div>
              </section>

              <section className="rounded-lg border border-[#D8DEE9] bg-white p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#64748B]">
                  Object schemas
                </p>
                <p className="mt-1 text-[12px] text-[#64748B]">
                  AgentCapabilityProfile is the employment contract for the agent. AgentBoundStructure is not a
                  protocol object.
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {objectNames.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setSelectedName(name)}
                      className={`rounded-md px-2.5 py-1 text-[11px] font-semibold ${
                        selectedName === name
                          ? 'bg-[#0B1324] text-white'
                          : 'border border-[#D8DEE9] bg-white text-[#0B1324]'
                      }`}
                    >
                      {name}
                    </button>
                  ))}
                </div>
                {selectedSchema ? (
                  <div className="mt-3 rounded-md border border-[#D8DEE9] bg-[#F7F8FB] p-3">
                    <p className="font-mono text-[12px] text-[#0B1324]">{selectedSchema.$id}</p>
                    <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#64748B]">
                      Required
                    </p>
                    <ul className="mt-1 flex flex-wrap gap-1.5">
                      {(selectedSchema.required ?? []).map((field) => (
                        <li
                          key={field}
                          className="rounded border border-[#D8DEE9] bg-white px-2 py-0.5 font-mono text-[11px] text-[#0B1324]"
                        >
                          {field}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </section>

              <section className="overflow-hidden rounded-lg border border-[#D8DEE9] bg-white">
                <div className="flex items-center justify-between gap-3 border-b border-[#EEF2F6] px-4 py-2.5">
                  <div>
                    <p className="text-[12px] font-semibold text-[#0B1324]">Action archive</p>
                    <p className="text-[11px] text-[#64748B]">
                      {intentReady
                        ? `${catalog.batch_totals?.intent_count ?? actions.length} traces · ${catalog.batch_totals?.intended_display ?? '—'}`
                        : 'Empty until an obligation file is uploaded'}
                    </p>
                  </div>
                  {intentReady && selected ? (
                    <Link
                      href={href(`/actions/${selected.trace_id}/contract`)}
                      className="text-[12px] font-semibold text-[#2E5BFF]"
                    >
                      Open PAC
                    </Link>
                  ) : null}
                </div>
                {intentReady ? (
                <div className="max-h-[360px] overflow-auto">
                  <table className="min-w-full text-left text-[12px]">
                    <thead className="sticky top-0 bg-[#F7F8FB] text-[10px] font-semibold uppercase tracking-[0.06em] text-[#64748B]">
                      <tr>
                        <th className="px-4 py-2">Trace</th>
                        <th className="px-4 py-2">PAC</th>
                        <th className="px-4 py-2">Action</th>
                        <th className="px-4 py-2">Lifecycle</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EEF2F6]">
                      {filtered.map((row) => {
                        const active = row.trace_id === selectedTrace
                        return (
                          <tr
                            key={row.trace_id}
                            tabIndex={0}
                            aria-selected={active}
                            onClick={() => {
                              setSelectedTrace(row.trace_id)
                              setTamper(false)
                            }}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault()
                                setSelectedTrace(row.trace_id)
                                setTamper(false)
                              }
                            }}
                            className={`cursor-pointer ${active ? 'bg-[#EEF2FF]' : 'hover:bg-[#F8FAFC]'}`}
                          >
                            <td className="px-4 py-2 align-top">
                              <CopyChip label="Trace" value={row.trace_id} wide />
                            </td>
                            <td className="px-4 py-2 align-top">
                              <CopyChip label="PAC" value={row.pac_id} wide />
                            </td>
                            <td className="px-4 py-2 align-top">
                              <p className="font-semibold text-[#0B1324]">
                                {row.human_ref} · {row.rail}
                              </p>
                              <p className="text-[11px] text-[#64748B]">{row.beneficiary}</p>
                            </td>
                            <td className="px-4 py-2 align-top">
                              <p className="text-[11px] text-[#64748B]">—</p>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                ) : (
                  <div className="px-4 py-8 text-[13px] text-[#64748B]">
                    Catalog traces stay hidden until an obligation file is uploaded. Intent Journal will show the same
                    batch at ₹0 until that file lands.
                  </div>
                )}
              </section>

              <ProtocolJsonPanel object={catalog} title="Protocol catalogue JSON" />
            </div>
          ) : null}
        </PageState>
      </div>
    </div>
  )
}
