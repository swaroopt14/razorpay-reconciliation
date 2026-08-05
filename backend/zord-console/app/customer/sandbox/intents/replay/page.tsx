'use client'

import { useMemo, useState } from 'react'
import {
  FUSION_RULESETS,
  MAPPING_PROFILES,
  SANDBOX_INTENTS,
  getIntentById,
} from '../../sandbox-fixtures'

type ReplayLookup = 'intent_id' | 'envelope_id'

interface ReplayResult {
  replayId: string
  originalHash: string
  replayHash: string
  match: boolean
  deltas: string[]
}

export default function IntentReplaySimulationPage() {
  const [lookup, setLookup] = useState<ReplayLookup>('intent_id')
  const [lookupValue, setLookupValue] = useState(SANDBOX_INTENTS[0].intentId)
  const [mappingProfileVersion, setMappingProfileVersion] = useState(MAPPING_PROFILES[0])
  const [fusionRulesetVersion, setFusionRulesetVersion] = useState(FUSION_RULESETS[0])
  const [timeShift, setTimeShift] = useState<'as_original' | '+6h' | '+1d'>('as_original')
  const [confirm, setConfirm] = useState(false)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<ReplayResult | null>(null)

  const matchedIntent = useMemo(() => {
    if (lookup === 'intent_id') return getIntentById(lookupValue)
    return SANDBOX_INTENTS.find((intent) => intent.envelopeId === lookupValue)
  }, [lookup, lookupValue])

  const options = useMemo(
    () => (lookup === 'intent_id' ? SANDBOX_INTENTS.map((intent) => intent.intentId) : SANDBOX_INTENTS.map((intent) => intent.envelopeId)),
    [lookup]
  )

  const runReplay = () => {
    if (!matchedIntent) return
    setRunning(true)
    window.setTimeout(() => {
      const match = mappingProfileVersion === MAPPING_PROFILES[0] && fusionRulesetVersion === FUSION_RULESETS[0] && timeShift === 'as_original'
      const replayHash = match
        ? matchedIntent.canonicalHash
        : `${matchedIntent.canonicalHash.slice(0, -4)}a1f0`
      const deltas = match
        ? []
        : [
            `Rule MAP_014 changed confidence from ${(matchedIntent.validationRows[1]?.confidence || 0.8) * 100}% to 78%`,
            'Fusion output moved from SETTLED to PENDING_REVIEW due to ruleset revision',
          ]

      setResult({
        replayId: `replay_${Date.now()}`,
        originalHash: matchedIntent.canonicalHash,
        replayHash,
        match,
        deltas,
      })
      setRunning(false)
      setConfirm(false)
      window.dispatchEvent(
        new CustomEvent('cx:toast', {
          detail: {
            type: match ? 'success' : 'warning',
            title: match ? 'Deterministic match confirmed' : 'Replay divergence detected',
            desc: `Replay completed for ${matchedIntent.intentId}`,
          },
        })
      )
    }, 950)
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-bold text-cx-text">Replay Simulation</h1>
        <p className="mt-0.5 text-sm text-cx-neutral">
          Replay from intent/envelope with deterministic controls. Simulation only, no live fund movement.
        </p>
      </div>

      <section className="rounded-2xl border border-gray-100 bg-white p-5">
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">Replay basis</label>
            <div className="grid grid-cols-2 gap-2 rounded-xl border border-gray-200 bg-gray-50 p-1">
              <button
                type="button"
                onClick={() => {
                  setLookup('intent_id')
                  setLookupValue(SANDBOX_INTENTS[0].intentId)
                }}
                className={`rounded-lg px-2.5 py-2 text-xs font-semibold ${lookup === 'intent_id' ? 'bg-white text-cx-purple-700 shadow-sm' : 'text-cx-neutral'}`}
              >
                intent_id
              </button>
              <button
                type="button"
                onClick={() => {
                  setLookup('envelope_id')
                  setLookupValue(SANDBOX_INTENTS[0].envelopeId)
                }}
                className={`rounded-lg px-2.5 py-2 text-xs font-semibold ${lookup === 'envelope_id' ? 'bg-white text-cx-purple-700 shadow-sm' : 'text-cx-neutral'}`}
              >
                envelope_id
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">ID selector</label>
            <select
              value={lookupValue}
              onChange={(event) => setLookupValue(event.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-mono outline-none focus:border-cx-purple-500"
            >
              {options.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">mapping_profile_version</label>
            <select
              value={mappingProfileVersion}
              onChange={(event) => setMappingProfileVersion(event.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-cx-purple-500"
            >
              {MAPPING_PROFILES.map((profile) => (
                <option key={profile} value={profile}>
                  {profile}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">fusion_ruleset_version</label>
            <select
              value={fusionRulesetVersion}
              onChange={(event) => setFusionRulesetVersion(event.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-cx-purple-500"
            >
              {FUSION_RULESETS.map((ruleset) => (
                <option key={ruleset} value={ruleset}>
                  {ruleset}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">time_shift</label>
            <select
              value={timeShift}
              onChange={(event) => setTimeShift(event.target.value as 'as_original' | '+6h' | '+1d')}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-cx-purple-500"
            >
              <option value="as_original">As original</option>
              <option value="+6h">Shift by +6 hours</option>
              <option value="+1d">Shift by +1 day</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              type="button"
              disabled={!matchedIntent}
              onClick={() => setConfirm(true)}
              className="w-full rounded-xl bg-cx-purple-600 py-2.5 text-sm font-semibold text-white hover:bg-cx-purple-700 disabled:opacity-60"
            >
              Run Replay (Sandbox Only)
            </button>
          </div>
        </div>
      </section>

      {result ? (
        <section className="space-y-4 rounded-2xl border border-gray-100 bg-white p-5">
          <h2 className="text-sm font-semibold text-cx-text">Replay Output</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-3 text-xs">
              <p className="font-semibold text-cx-neutral">replay_id</p>
              <p className="mt-1 font-mono text-cx-text">{result.replayId}</p>
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-3 text-xs">
              <p className="font-semibold text-cx-neutral">status delta</p>
              <p className={`mt-1 font-semibold ${result.match ? 'text-emerald-700' : 'text-amber-700'}`}>
                {result.match ? 'Deterministic match confirmed.' : 'Divergence detected.'}
              </p>
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-3 text-xs">
              <p className="font-semibold text-cx-neutral">original canonical_hash</p>
              <p className="mt-1 break-all font-mono text-cx-text">{result.originalHash}</p>
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-3 text-xs">
              <p className="font-semibold text-cx-neutral">replay canonical_hash</p>
              <p className="mt-1 break-all font-mono text-cx-text">{result.replayHash}</p>
            </div>
          </div>

          {result.deltas.length > 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {result.deltas.map((delta) => (
                <p key={delta}>• {delta}</p>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {confirm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-5">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-5">
            <h3 className="text-base font-bold text-cx-text">Confirm Replay</h3>
            <p className="mt-2 text-sm text-cx-neutral">
              No live fund movement. Replay will be marked as simulation and will not mutate production ledgers.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setConfirm(false)}
                className="flex-1 rounded-lg border border-gray-200 bg-white py-2 text-sm font-semibold text-cx-text hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={runReplay}
                disabled={running}
                className="flex-1 rounded-lg bg-cx-purple-600 py-2 text-sm font-semibold text-white hover:bg-cx-purple-700 disabled:opacity-60"
              >
                {running ? 'Running...' : 'Confirm Replay'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
