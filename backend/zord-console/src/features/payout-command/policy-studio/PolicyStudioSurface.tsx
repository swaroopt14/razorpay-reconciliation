'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  DEMO_AI_SUGGESTIONS,
  DEMO_POLICY_PACKS,
  DEMO_POLICY_TEST_RESULT,
  POLICY_EFFECTS,
  POLICY_RULE_CATEGORIES,
  POLICY_STUDIO_HEADER,
  POLICY_STUDIO_LINKS,
  activeVersionForPack,
  buildPolicyFollowInsight,
  packUsedByDemoBatch,
  policyBusinessNote,
  versionJson,
  type AiRuleSuggestion,
  type PolicyEffect,
  type PolicyPack,
  type PolicyRule,
  type PolicyRuleCategory,
  type PolicyVersion,
  type PolicyVersionStatus,
} from '@/services/payout-command/demo/policyStudioDemo'
import {
  markBatchPolicyAttached,
  readBatchPolicyRecord,
} from '@/services/payout-command/demo/demoBatchReadiness'
import { DEMO_SMOKE_BATCH_ID } from '@/services/payout-command/demo/ycDemoConstants'
import { PageExplainerBanner } from '../demo/PageExplainerBanner'
import {
  CreatePolicyGuideDrawer,
  type CreatePolicyGuideResult,
} from './CreatePolicyGuideDrawer'
import { PolicyGetStartedCard } from './PolicyGetStartedCard'

type Notice = { tone: 'ok' | 'warn' | 'err'; text: string }

const POLICY_STUDIO_PACKS_KEY = 'zord_demo_policy_studio_packs'
const POLICY_STUDIO_SELECTION_KEY = 'zord_demo_policy_studio_selection'

function readPersistedPacks(): PolicyPack[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = sessionStorage.getItem(POLICY_STUDIO_PACKS_KEY)
    const attached = readBatchPolicyRecord()
    let parsed: PolicyPack[] = []
    if (raw) {
      const value = JSON.parse(raw) as PolicyPack[]
      if (Array.isArray(value)) parsed = value
    }
    /* If packs were lost but a batch attachment remains, restore a stub from the demo template. */
    if (parsed.length === 0 && attached?.policyLabel) {
      const template =
        DEMO_POLICY_PACKS.find((p) => p.id === attached.packId) ??
        DEMO_POLICY_PACKS.find((p) => p.label === attached.policyLabel) ??
        DEMO_POLICY_PACKS[0]
      if (template) {
        const source = activeVersionForPack(template) ?? template.versions[0]
        if (source) {
          parsed = [
            {
              id: attached.packId || template.id,
              label: attached.policyLabel,
              summary: template.summary,
              usedByDemoBatch: true,
              versions: [
                {
                  ...source,
                  id: `pv-${attached.packId || template.id}-restored-draft`,
                  version: 'v1',
                  status: 'draft',
                  immutable: false,
                  createdAt: attached.attachedAt || new Date().toISOString(),
                  actor: 'Zord agent (you)',
                  draftBrief: {
                    draftedByAgent: true,
                    payoutKind: attached.policyLabel,
                    purpose: `Restored draft attached to ${attached.batchId}`,
                    approverRole: 'Approver',
                    activatorRole: 'Policy admin',
                    controlLabels: source.rules
                      .slice(0, 4)
                      .map((r) => r.businessLabel || r.pattern || r.whenField),
                    impactNote: `Previously attached to ${attached.batchId}`,
                  },
                },
              ],
            },
          ]
        }
      }
    }
    return parsed.map((p) => ({
      ...p,
      usedByDemoBatch:
        p.usedByDemoBatch ||
        (attached
          ? attached.packId
            ? attached.packId === p.id
            : attached.policyLabel === p.label
          : false),
    }))
  } catch {
    return []
  }
}

function persistPacks(packs: PolicyPack[]) {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(POLICY_STUDIO_PACKS_KEY, JSON.stringify(packs))
  } catch {
    /* ignore */
  }
}

function readPersistedSelection(): { packId: string; versionId: string } | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(POLICY_STUDIO_SELECTION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { packId?: string; versionId?: string }
    if (!parsed?.packId) return null
    return { packId: parsed.packId, versionId: parsed.versionId ?? '' }
  } catch {
    return null
  }
}

function persistSelection(packId: string, versionId: string) {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(
      POLICY_STUDIO_SELECTION_KEY,
      JSON.stringify({ packId, versionId }),
    )
  } catch {
    /* ignore */
  }
}

function formatPolicyWhen(iso: string | undefined): string {
  if (!iso) return '-'
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function statusTone(_status: PolicyVersionStatus): string {
  return 'bg-[#0B1324] text-white'
}

function effectTone(_effect: PolicyEffect): string {
  return 'text-[#0B1324]'
}

function effectLabel(effect: PolicyEffect): string {
  return POLICY_EFFECTS.find((e) => e.id === effect)?.label ?? effect
}

/**
  * Spec 7.5 - Policy Studio surface.
  */
export function PolicyStudioSurface() {
  const demoPack = packUsedByDemoBatch()
  /** Spec 7.5 - empty until drafted; hydrated from session so created/attached history survives navigation. */
  const [packs, setPacks] = useState<PolicyPack[]>([])
  const [selectedPackId, setSelectedPackId] = useState('')
  const [selectedVersionId, setSelectedVersionId] = useState('')
  const [studioReady, setStudioReady] = useState(false)

  useEffect(() => {
    const loaded = readPersistedPacks()
    const selection = readPersistedSelection()
    setPacks(loaded)
    if (loaded.length > 0) {
      const pack =
        loaded.find((p) => p.id === selection?.packId) ?? loaded[0]!
      setSelectedPackId(pack.id)
      const versionId =
        selection?.versionId && pack.versions.some((v) => v.id === selection.versionId)
          ? selection.versionId
          : (activeVersionForPack(pack)?.id ?? pack.versions[0]?.id ?? '')
      setSelectedVersionId(versionId)
    }
    setStudioReady(true)
  }, [])

  const selectedPack: PolicyPack | undefined =
    packs.find((p) => p.id === selectedPackId) ?? packs[0]
  const selectedVersion: PolicyVersion | undefined = selectedPack
    ? (selectedPack.versions.find((v) => v.id === selectedVersionId) ??
      activeVersionForPack(selectedPack) ??
      selectedPack.versions[0])
    : undefined

  useEffect(() => {
    if (!studioReady) return
    persistPacks(packs)
  }, [packs, studioReady])

  useEffect(() => {
    if (!studioReady || !selectedPackId) return
    persistSelection(selectedPackId, selectedVersionId)
  }, [selectedPackId, selectedVersionId, studioReady])

  /** Zord's follow-up ask after a draft is saved: attach the draft to the demo batch? */
  const [attachAsk, setAttachAsk] = useState<{
    packId: string
    packLabel: string
    impact: CreatePolicyGuideResult['impactPreview']
  } | null>(null)

  const [category, setCategory] = useState<PolicyRuleCategory | 'all'>('all')
  const [viewMode, setViewMode] = useState<'builder' | 'json'>('builder')
  const [showTest, setShowTest] = useState(false)
  const [testRunAt, setTestRunAt] = useState<string | null>(null)
  const [showCompare, setShowCompare] = useState(false)
  const [suggestions, setSuggestions] = useState<AiRuleSuggestion[]>(DEMO_AI_SUGGESTIONS)
  const [notice, setNotice] = useState<Notice | null>(null)
  const testResultsRef = useRef<HTMLElement | null>(null)

  const batchAttachment = useMemo(() => {
    const rec = typeof window !== 'undefined' ? readBatchPolicyRecord() : null
    const attached =
      Boolean(selectedPack?.usedByDemoBatch) ||
      (rec
        ? rec.packId
          ? rec.packId === selectedPack?.id
          : rec.policyLabel === selectedPack?.label
        : false)
    return {
      attached,
      record: attached ? rec : null,
    }
  }, [selectedPack, packs])

  const followInsight = useMemo(() => {
    if (!selectedPack || !selectedVersion) return null
    return buildPolicyFollowInsight({
      attached: batchAttachment.attached,
      versionStatus: selectedVersion.status,
      packLabel: selectedPack.label,
    })
  }, [selectedPack, selectedVersion, batchAttachment.attached])

  function attachSelectedPackToDemoBatch() {
    if (!selectedPack) return
    setPacks((prev) => prev.map((p) => ({ ...p, usedByDemoBatch: p.id === selectedPack.id })))
    markBatchPolicyAttached(DEMO_SMOKE_BATCH_ID, selectedPack.label, selectedPack.id)
    setNotice({
      tone: 'ok',
      text: `${selectedPack.label} attached to batch ${DEMO_SMOKE_BATCH_ID} - activate the draft to enforce it.`,
    })
  }

  function runPolicyTest(source: 'header' | 'version' | 'panel' = 'panel') {
    const alreadyOpen = showTest
    setShowTest(true)
    const at = new Date().toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    setTestRunAt(at)
    setNotice({
      tone: 'ok',
      text:
        source === 'panel' && alreadyOpen
          ? `Retested ${selectedVersion?.version ?? 'policy'} on batch ${DEMO_POLICY_TEST_RESULT.batchId} at ${at} - live data not affected.`
          : `Tested on batch ${DEMO_POLICY_TEST_RESULT.batchId} at ${at} - live data not affected.`,
    })
  }

  useEffect(() => {
    if (!showTest || !testRunAt) return
    const id = window.setTimeout(() => {
      testResultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 40)
    return () => window.clearTimeout(id)
  }, [showTest, testRunAt])
  const [createGuideOpen, setCreateGuideOpen] = useState(false)
  const [draftRule, setDraftRule] = useState({
    whenField: 'amount',
    operator: '>',
    value: '',
    effect: 'require_approval' as PolicyEffect,
    category: 'commercial' as PolicyRuleCategory,
  })

  const visibleRules = useMemo(() => {
    if (!selectedVersion) return []
    if (category === 'all') return selectedVersion.rules
    return selectedVersion.rules.filter((r) => r.category === category)
  }, [selectedVersion, category])

  const compareTarget = useMemo(() => {
    if (!selectedPack || !selectedVersion) return undefined
    return selectedPack.versions.find(
      (v) => v.id !== selectedVersion.id && (v.status === 'active' || v.status === 'retired'),
    )
  }, [selectedPack, selectedVersion])

  function selectPack(packId: string) {
    const pack = packs.find((p) => p.id === packId)
    if (!pack) return
    setSelectedPackId(packId)
    const v = activeVersionForPack(pack)
    setSelectedVersionId(v?.id ?? pack.versions[0]?.id ?? '')
    setShowCompare(false)
    setCategory('all')
  }

  function updateVersion(mutator: (v: PolicyVersion) => PolicyVersion) {
    if (!selectedVersion || !selectedPack) return
    if (selectedVersion.immutable || selectedVersion.status === 'active') {
      setNotice({
        tone: 'warn',
        text: 'Active versions are immutable. Clone into a draft to edit.',
      })
      return
    }
    setPacks((prev) =>
      prev.map((p) =>
        p.id !== selectedPack.id
          ? p
          : {
              ...p,
              versions: p.versions.map((v) => (v.id === selectedVersion.id ? mutator(v) : v)),
            },
      ),
    )
  }

  function applyCreateGuide(result: CreatePolicyGuideResult) {
    setCreateGuideOpen(false)
    setShowTest(true)
    setCategory('all')
    setViewMode('builder')

    setPacks((prev) => {
      const existing = prev.find((p) => p.id === result.packId)
      const template = DEMO_POLICY_PACKS.find((p) => p.id === result.packId)
      const pack = existing ?? template
      if (!pack) return prev
      const source = activeVersionForPack(pack) ?? pack.versions[0]
      if (!source) return prev
      const nextNum = existing
        ? Math.max(...existing.versions.map((v) => Number(v.version.replace(/\D/g, '')) || 0)) + 1
        : 1

      // Prefer Zord's business controls; keep non-overlapping base rules from the active pack.
      const zordIds = new Set(result.rules.map((r) => `${r.category}:${r.whenField}:${r.effect}`))
      const keptBase = source.rules.filter(
        (r) => !zordIds.has(`${r.category}:${r.whenField}:${r.effect}`),
      )
      const rules = [...result.rules, ...keptBase]

      const draft: PolicyVersion = {
        ...source,
        id: `pv-${pack.id}-v${nextNum}-draft`,
        version: `v${nextNum}`,
        status: 'draft',
        immutable: false,
        createdAt: new Date().toISOString(),
        activatedAt: undefined,
        retiredAt: undefined,
        actor: 'Zord agent (you)',
        signature: `sig_zord_${Date.now().toString(36)}`,
        rules,
        conflicts: [],
        evidenceRequirement: {
          proofLevel: result.proofLevel,
          mandatoryArtifacts: result.mandatoryArtifacts,
        },
        draftBrief: result.draftBrief,
      }
      setSelectedPackId(pack.id)
      setSelectedVersionId(draft.id)
      if (existing) {
        return prev.map((p) =>
          p.id === pack.id
            ? { ...p, summary: result.purpose, versions: [draft, ...p.versions] }
            : p,
        )
      }
      /* First draft for this pack - the pack enters the studio holding only the new draft. */
      const newPack: PolicyPack = {
        id: pack.id,
        label: result.packLabel || pack.label,
        summary: result.purpose,
        usedByDemoBatch: false,
        versions: [draft],
      }
      return [...prev, newPack]
    })
    setNotice({
      tone: 'ok',
      text: result.agentSummary,
    })
    /* Zord asks (never decides): should this draft govern the demo batch? */
    setAttachAsk({
      packId: result.packId,
      packLabel: result.packLabel,
      impact: result.impactPreview,
    })
    window.setTimeout(() => {
      document.getElementById('policy-draft-brief')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 80)
  }

  function clonePack() {
    const base = selectedPack
    if (!base) return
    const id = `${base.id}-clone-${Date.now().toString(36).slice(-4)}`
    const clone: PolicyPack = {
      id,
      label: `${base.label} (clone)`,
      summary: base.summary,
      usedByDemoBatch: false,
      versions: base.versions.map((v) => ({
        ...v,
        id: `${v.id}-clone`,
        packId: id,
        status: v.status === 'active' ? 'draft' : v.status,
        immutable: false,
        activatedAt: undefined,
        rules: v.rules.map((r) => ({ ...r })),
      })),
    }
    setPacks((prev) => [...prev, clone])
    selectPack(id)
    setNotice({ tone: 'ok', text: `Cloned pack · ${clone.label}` })
  }

  function addRule() {
    if (!selectedVersion) return
    if (!draftRule.value.trim()) {
      setNotice({ tone: 'err', text: 'Enter a value for the new rule.' })
      return
    }
    const effectWords = draftRule.effect.replace('_', ' ')
    const newRule: PolicyRule = {
      id: `r-new-${Date.now().toString(36)}`,
      category: draftRule.category,
      whenField: draftRule.whenField.trim(),
      operator: draftRule.operator.trim(),
      value: draftRule.value.trim(),
      effect: draftRule.effect,
      pattern: `When ${draftRule.whenField} ${draftRule.operator} ${draftRule.value}, then ${effectWords}`,
    }
    updateVersion((v) => ({ ...v, rules: [...v.rules, newRule] }))
    setDraftRule((d) => ({ ...d, value: '' }))
    setNotice({ tone: 'ok', text: 'Rule added to draft.' })
  }

  function activateVersion() {
    if (!selectedVersion || !selectedPack) return
    if (selectedVersion.status !== 'draft') {
      setNotice({ tone: 'warn', text: 'Only draft versions can be activated.' })
      return
    }
    if (selectedVersion.conflicts.length > 0) {
      setNotice({
        tone: 'err',
        text: `Resolve ${selectedVersion.conflicts.length} conflicting rule(s) before activation.`,
      })
      return
    }
    const now = new Date().toISOString()
    setPacks((prev) =>
      prev.map((p) => {
        if (p.id !== selectedPack.id) return p
        return {
          ...p,
          versions: p.versions.map((v) => {
            if (v.id === selectedVersion.id) {
              return {
                ...v,
                status: 'active' as const,
                immutable: true,
                activatedAt: now,
                actor: 'you@acme.example',
                signature: `sig_act_${Date.now().toString(36)}`,
              }
            }
            if (v.status === 'active') {
              return {
                ...v,
                status: 'retired' as const,
                retiredAt: now,
              }
            }
            return v
          }),
        }
      }),
    )
    setNotice({
      tone: 'ok',
      text: `Activated ${selectedVersion.version} · written to audit log.`,
    })
  }

  function retireVersion() {
    if (!selectedVersion || !selectedPack) return
    if (selectedVersion.status !== 'active') {
      setNotice({ tone: 'warn', text: 'Only the active version can be retired.' })
      return
    }
    const now = new Date().toISOString()
    setPacks((prev) =>
      prev.map((p) =>
        p.id !== selectedPack.id
          ? p
          : {
              ...p,
              versions: p.versions.map((v) =>
                v.id === selectedVersion.id
                  ? { ...v, status: 'retired' as const, retiredAt: now, immutable: true }
                  : v,
              ),
            },
      ),
    )
    setNotice({ tone: 'ok', text: `Retired ${selectedVersion.version} · audit logged.` })
  }

  function acceptSuggestion(id: string) {
    const sug = suggestions.find((s) => s.id === id)
    if (!sug || sug.accepted) return
    if (!selectedVersion || selectedVersion.status !== 'draft') {
      setNotice({ tone: 'warn', text: 'Accept suggestions into a draft version only.' })
      return
    }
    const newRule: PolicyRule = {
      id: `r-ai-${id}`,
      category: 'commercial',
      whenField: 'suggested',
      operator: 'pattern',
      value: sug.pattern,
      effect: 'require_approval',
      pattern: sug.pattern,
    }
    updateVersion((v) => ({ ...v, rules: [...v.rules, newRule] }))
    setSuggestions((prev) => prev.map((s) => (s.id === id ? { ...s, accepted: true } : s)))
    setNotice({ tone: 'ok', text: 'Suggestion accepted into draft - not activated.' })
  }

  if (!studioReady) {
    return (
      <div className="mx-auto max-w-[1600px] space-y-4">
        <PageExplainerBanner page="policies" />
        <div className="border border-[#E2E8F0] bg-white px-5 py-10 text-center text-[13px] text-[#64748B]">
          Loading Policy Studio…
        </div>
      </div>
    )
  }

  /* Empty studio - nothing exists until the first draft is created (spec 7.5). */
  if (packs.length === 0 || !selectedPack || !selectedVersion) {
    return (
      <div className="mx-auto max-w-[1600px] space-y-4">
        <PageExplainerBanner page="policies" />
        <header className="flex flex-wrap items-end justify-between gap-3 border border-[#E2E8F0] bg-white px-5 py-4">
          <div>
            <h1 className="text-[1.25rem] font-semibold tracking-[-0.02em] text-[#0B1324]">
              {POLICY_STUDIO_HEADER.title}
            </h1>
            <p className="mt-0.5 text-[13px] text-[#64748B]">{POLICY_STUDIO_HEADER.subtitle}</p>
          </div>
          <button
            type="button"
            onClick={() => setCreateGuideOpen(true)}
            className="inline-flex h-9 items-center bg-[#0B1324] px-3.5 text-[13px] font-semibold text-white hover:bg-[#1E293B]"
          >
            Ask Zord to draft
          </button>
        </header>

        <PolicyGetStartedCard onCreatePolicy={() => setCreateGuideOpen(true)} />

        <section className="border border-[#E2E8F0] bg-white px-5 py-10 text-center">
          <p className="text-[15px] font-semibold text-[#0B1324]">No policies yet</p>
          <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-[#64748B]">
            Nothing governs this workspace until a policy is drafted. Ask Zord to draft one -
            you review it, test it on a batch, and only you can activate it.
          </p>
          <button
            type="button"
            onClick={() => setCreateGuideOpen(true)}
            className="mt-4 inline-flex h-9 items-center bg-[#0B1324] px-4 text-[13px] font-semibold text-white hover:bg-[#1E293B]"
          >
            Ask Zord to draft a policy
          </button>
        </section>

        <CreatePolicyGuideDrawer
          open={createGuideOpen}
          packs={DEMO_POLICY_PACKS}
          defaultPackId={demoPack.id}
          onClose={() => setCreateGuideOpen(false)}
          onComplete={applyCreateGuide}
        />
      </div>
    )
  }

  const canEdit = selectedVersion.status === 'draft' && !selectedVersion.immutable

  return (
    <div className="mx-auto max-w-[1600px] space-y-4">
      <PageExplainerBanner page="policies" />
      <header className="flex flex-wrap items-end justify-between gap-3 border border-[#E2E8F0] bg-white px-5 py-4">
        <div>
          <h1 className="text-[1.25rem] font-semibold tracking-[-0.02em] text-[#0B1324]">
            {POLICY_STUDIO_HEADER.title}
          </h1>
          <p className="mt-0.5 text-[13px] text-[#64748B]">{POLICY_STUDIO_HEADER.subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setCreateGuideOpen(true)}
            className="inline-flex h-9 items-center bg-[#0B1324] px-3.5 text-[13px] font-semibold text-white hover:bg-[#1E293B]"
          >
            Ask Zord to draft
          </button>
          <button
            type="button"
            onClick={clonePack}
            className="inline-flex h-9 items-center border border-[#CBD5E1] bg-white px-3.5 text-[13px] font-semibold text-[#0B1324] hover:bg-[#F1F5F9]"
          >
            Clone pack
          </button>
          <button
            type="button"
            onClick={() => runPolicyTest('header')}
            className="inline-flex h-9 items-center border border-[#CBD5E1] bg-white px-3.5 text-[13px] font-semibold text-[#0B1324] hover:bg-[#F1F5F9]"
          >
            Test on batch
          </button>
        </div>
      </header>

      <PolicyGetStartedCard onCreatePolicy={() => setCreateGuideOpen(true)} />

      {attachAsk ? (
        <div className="border border-[#6D4AFF]/35 bg-white px-4 py-3.5" role="status">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] text-[#0B1324]">
                <span className="mr-2 inline-flex items-center bg-[#6D4AFF] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                  Zord
                </span>
                Draft saved. Should this policy govern batch{' '}
                <span className="font-mono font-semibold">{DEMO_POLICY_TEST_RESULT.batchId}</span>?
              </p>
              <p className="mt-1 text-[12px] text-[#64748B]">
                On that batch it would block {attachAsk.impact.wouldBlock}, require approval on{' '}
                {attachAsk.impact.wouldNeedApproval}, and warn on {attachAsk.impact.wouldWarn}{' '}
                payouts. Attaching scopes the draft to the batch - it enforces nothing until you
                activate it.
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => {
                  setPacks((prev) =>
                    prev.map((p) => ({ ...p, usedByDemoBatch: p.id === attachAsk.packId })),
                  )
                  markBatchPolicyAttached(
                    DEMO_POLICY_TEST_RESULT.batchId,
                    attachAsk.packLabel,
                    attachAsk.packId,
                  )
                  setShowTest(true)
                  setNotice({
                    tone: 'ok',
                    text: `${attachAsk.packLabel} attached to batch ${DEMO_POLICY_TEST_RESULT.batchId} - activate the draft to enforce it.`,
                  })
                  setAttachAsk(null)
                }}
                className="inline-flex h-8 items-center bg-[#0B1324] px-3 text-[12px] font-semibold text-white hover:bg-[#1E293B]"
              >
                Attach to {DEMO_POLICY_TEST_RESULT.batchId}
              </button>
              <button
                type="button"
                onClick={() => setAttachAsk(null)}
                className="inline-flex h-8 items-center border border-[#CBD5E1] bg-white px-3 text-[12px] font-semibold text-[#0B1324] hover:bg-[#F1F5F9]"
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {notice ? (
        <div
          role="status"
          className={`border px-4 py-2.5 text-[13px] ${
            notice.tone === 'ok'
              ? 'border-[#0B1324]/20 bg-[#F1F5F9] text-[#0B1324]'
              : notice.tone === 'warn'
                ? 'border-[#0B1324]/20 bg-[#F1F5F9] text-[#0B1324]'
                : 'border-[#0B1324]/20 bg-[#F1F5F9] text-[#0B1324]'
          }`}
        >
          {notice.text}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
        {/* Pack list */}
        <aside className="border border-[#E2E8F0] bg-white">
          <div className="border-b border-[#E2E8F0] px-3 py-2.5">
            <p className="text-[12px] font-semibold text-[#0B1324]">Policy packs</p>
          </div>
          <ul className="divide-y divide-[#E2E8F0]">
            {packs.map((pack) => {
              const active = pack.id === selectedPack.id
              const activeVer = activeVersionForPack(pack)
              return (
                <li key={pack.id}>
                  <button
                    type="button"
                    onClick={() => selectPack(pack.id)}
                    className={`w-full px-3 py-3 text-left transition hover:bg-[#F8FAFC] ${
                      active ? 'bg-[#F1F5F9]' : 'bg-white'
                    }`}
                  >
                    <p className="text-[13px] font-semibold text-[#0B1324]">{pack.label}</p>
                    <p className="mt-0.5 text-[11px] text-[#64748B]">
                      {activeVer ? `${activeVer.version} · ${activeVer.status}` : 'No version'}
                      {pack.usedByDemoBatch
                        ? ` · attached to ${DEMO_POLICY_TEST_RESULT.batchId}`
                        : ''}
                    </p>
                    <p className="mt-0.5 text-[10px] text-[#94A3B8]">
                      {pack.versions.length} version{pack.versions.length === 1 ? '' : 's'} in history
                    </p>
                  </button>
                </li>
              )
            })}
          </ul>
          <div className="border-t border-[#E2E8F0] px-3 py-2.5">
            <Link
              href={POLICY_STUDIO_LINKS.demoBatchJournal}
              className="text-[12px] font-semibold text-[#2563EB] hover:underline"
            >
              Open sample batch policy path
            </Link>
          </div>
        </aside>

        {/* Main pane */}
        <div className="min-w-0 space-y-4">
          <section className="border border-[#E2E8F0] bg-white px-4 py-4 sm:px-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#64748B]">
                  {selectedPack.label}
                </p>
                <h2 className="mt-0.5 text-[16px] font-semibold text-[#0B1324]">
                  Version {selectedVersion.version}
                  <span
                    className={`ml-2 inline-flex px-2 py-0.5 text-[11px] font-semibold capitalize ${statusTone(selectedVersion.status)}`}
                  >
                    {selectedVersion.status}
                  </span>
                  {selectedVersion.draftBrief ? (
                    <span className="ml-2 text-[11px] font-medium text-[#2563EB]">Zord draft</span>
                  ) : null}
                  {batchAttachment.attached ? (
                    <span className="ml-2 inline-flex items-center bg-[#F1F5F9] px-2 py-0.5 font-mono text-[11px] font-semibold text-[#0B1324]">
                      {DEMO_SMOKE_BATCH_ID}
                    </span>
                  ) : null}
                  {selectedVersion.immutable ? (
                    <span className="ml-2 text-[11px] font-medium text-[#94A3B8]">Immutable</span>
                  ) : null}
                </h2>
                <p className="mt-1 text-[12px] text-[#64748B]">
                  {selectedVersion.draftBrief?.purpose ?? selectedPack.summary}
                </p>
                {policyBusinessNote(selectedVersion.draftBrief) ? (
                  <div className="mt-2 border border-[#CBD5E1] bg-[#F8FAFC] px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#64748B]">
                      Your note
                    </p>
                    <p className="mt-0.5 text-[13px] leading-relaxed text-[#0B1324]">
                      {policyBusinessNote(selectedVersion.draftBrief)}
                    </p>
                  </div>
                ) : null}
                <p className="mt-1 text-[11px] text-[#94A3B8]">
                  {selectedVersion.rules.length} controls · prepared by {selectedVersion.actor}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(['draft', 'test', 'activate', 'retire', 'compare'] as const).map((action) => {
                  const label =
                    action === 'draft'
                      ? 'Ask Zord'
                      : action === 'test'
                        ? 'Test'
                        : action === 'activate'
                          ? 'Activate'
                          : action === 'retire'
                            ? 'Retire'
                            : 'Compare versions'
                  return (
                    <button
                      key={action}
                      type="button"
                      onClick={() => {
                        if (action === 'draft') setCreateGuideOpen(true)
                        else if (action === 'test') runPolicyTest('version')
                        else if (action === 'activate') activateVersion()
                        else if (action === 'retire') retireVersion()
                        else setShowCompare((v) => !v)
                      }}
                      className="inline-flex h-8 items-center border border-[#CBD5E1] bg-white px-2.5 text-[12px] font-semibold text-[#0B1324] hover:bg-[#F1F5F9]"
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {selectedPack.versions.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setSelectedVersionId(v.id)}
                  className={`inline-flex h-8 items-center px-2.5 text-[12px] font-semibold ${
                    v.id === selectedVersion.id
                      ? 'bg-[#0B1324] text-white'
                      : 'bg-[#F1F5F9] text-[#64748B] hover:text-[#0B1324]'
                  }`}
                >
                  {v.version}
                  <span className="ml-1.5 font-normal opacity-80">{v.status}</span>
                  {v.draftBrief ? <span className="ml-1 opacity-80">· Zord</span> : null}
                </button>
              ))}
            </div>

            <div className="mt-4 border border-[#E2E8F0] bg-[#FAFBFC] px-3 py-3">
              <p className="text-[12px] font-semibold text-[#0B1324]">Version history</p>
              <p className="mt-0.5 text-[11px] text-[#64748B]">
                Drafts and activations for this pack - created and attached policies stay here.
              </p>
              <ul className="mt-2 divide-y divide-[#E2E8F0] border border-[#E2E8F0] bg-white">
                {selectedPack.versions.map((v) => (
                  <li key={`hist-${v.id}`}>
                    <button
                      type="button"
                      onClick={() => setSelectedVersionId(v.id)}
                      className={`flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left hover:bg-[#F8FAFC] ${
                        v.id === selectedVersion.id ? 'bg-[#F1F5F9]' : ''
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-[#0B1324]">
                          {v.version}
                          <span className="ml-2 text-[11px] font-medium capitalize text-[#64748B]">
                            {v.status}
                          </span>
                          {v.draftBrief ? (
                            <span className="ml-2 text-[11px] font-medium text-[#2563EB]">
                              Zord draft
                            </span>
                          ) : null}
                        </p>
                        <p className="mt-0.5 text-[11px] text-[#64748B]">
                          Created {formatPolicyWhen(v.createdAt)} · {v.actor}
                          {v.activatedAt ? ` · activated ${formatPolicyWhen(v.activatedAt)}` : ''}
                        </p>
                        {policyBusinessNote(v.draftBrief) ? (
                          <p className="mt-1 text-[12px] leading-snug text-[#0B1324]">
                            <span className="font-semibold text-[#64748B]">Your note · </span>
                            {policyBusinessNote(v.draftBrief)}
                          </p>
                        ) : v.draftBrief?.purpose ? (
                          <p className="mt-0.5 truncate text-[11px] text-[#94A3B8]">
                            {v.draftBrief.purpose}
                          </p>
                        ) : null}
                      </div>
                      <span
                        className={`mt-0.5 inline-flex h-6 shrink-0 items-center px-2 text-[10px] font-semibold uppercase ${statusTone(v.status)}`}
                      >
                        {v.status}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {selectedPack.usedByDemoBatch || batchAttachment.attached ? (
                <p className="mt-2 text-[11px] font-medium text-[#0B1324]">
                  Attached to batch {DEMO_POLICY_TEST_RESULT.batchId}
                  {batchAttachment.record?.attachedAt
                    ? ` · ${formatPolicyWhen(batchAttachment.record.attachedAt)}`
                    : ''}
                </p>
              ) : null}
            </div>

            {selectedVersion.draftBrief ? (
              <div
                id="policy-draft-brief"
                className="mt-4 scroll-mt-24 border border-[#0B1324]/20 bg-[#F1F5F9] px-4 py-3"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#0B1324]">
                  Zord draft brief
                </p>
                <p className="mt-1 text-[14px] font-semibold text-[#0B1324]">
                  {selectedVersion.draftBrief.payoutKind}
                </p>
                {policyBusinessNote(selectedVersion.draftBrief) ? (
                  <div className="mt-3 bg-white/70 px-3 py-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#94A3B8]">
                      Your note
                    </p>
                    <p className="mt-0.5 text-[13px] leading-relaxed text-[#0B1324]">
                      {policyBusinessNote(selectedVersion.draftBrief)}
                    </p>
                  </div>
                ) : null}
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div className="bg-white/70 px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#94A3B8]">
                      Exceptions
                    </p>
                    <p className="mt-0.5 text-[13px] font-semibold text-[#0B1324]">
                      {selectedVersion.draftBrief.approverRole}
                    </p>
                  </div>
                  <div className="bg-white/70 px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#94A3B8]">
                      Can go live
                    </p>
                    <p className="mt-0.5 text-[13px] font-semibold text-[#0B1324]">
                      {selectedVersion.draftBrief.activatorRole}
                    </p>
                  </div>
                </div>
                <ul className="mt-3 space-y-1.5">
                  {selectedVersion.draftBrief.controlLabels.map((label) => (
                    <li key={label} className="flex gap-2 text-[13px] text-[#1E3A8A]">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 bg-[#2563EB]" />
                      {label}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-[12px] text-[#475569]">{selectedVersion.draftBrief.impactNote}</p>
              </div>
            ) : null}

            {/* Batch attachment + Zord follow insight */}
            {followInsight ? (
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                <section className="border border-[#E2E8F0] bg-white px-4 py-3.5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#64748B]">
                        Batch attachment
                      </p>
                      <p className="mt-1 text-[14px] font-semibold text-[#0B1324]">
                        {batchAttachment.attached
                          ? followInsight.batchLabel
                          : 'Not attached to a batch'}
                      </p>
                      {batchAttachment.attached ? (
                        <p className="mt-0.5 font-mono text-[12px] text-[#475569]">
                          {followInsight.batchId}
                          {batchAttachment.record?.attachedAt
                            ? ` · attached ${formatPolicyWhen(batchAttachment.record.attachedAt)}`
                            : ''}
                        </p>
                      ) : (
                        <p className="mt-1 text-[12px] leading-relaxed text-[#64748B]">
                          Scope this pack to the demo batch to see follow-status and Control Review
                          exceptions for the same payout run.
                        </p>
                      )}
                    </div>
                    {batchAttachment.attached ? (
                      <span className="inline-flex h-6 items-center bg-[#0B1324] px-2 text-[10px] font-semibold uppercase tracking-[0.04em] text-white">
                        Attached
                      </span>
                    ) : (
                      <span className="inline-flex h-6 items-center border border-[#CBD5E1] bg-[#F8FAFC] px-2 text-[10px] font-semibold uppercase tracking-[0.04em] text-[#64748B]">
                        Unscoped
                      </span>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {batchAttachment.attached ? (
                      <>
                        <Link
                          href={POLICY_STUDIO_LINKS.intentJournal}
                          className="inline-flex h-8 items-center border border-[#CBD5E1] bg-white px-2.5 text-[12px] font-semibold text-[#2563EB] hover:bg-[#F8FAFC]"
                        >
                          Open Intent Journal
                        </Link>
                        <Link
                          href={POLICY_STUDIO_LINKS.controlReview}
                          className="inline-flex h-8 items-center border border-[#CBD5E1] bg-white px-2.5 text-[12px] font-semibold text-[#2563EB] hover:bg-[#F8FAFC]"
                        >
                          Open Control Review
                        </Link>
                        <Link
                          href={POLICY_STUDIO_LINKS.demoBatchJournal}
                          className="inline-flex h-8 items-center border border-[#CBD5E1] bg-white px-2.5 text-[12px] font-semibold text-[#0B1324] hover:bg-[#F8FAFC]"
                        >
                          Open batch
                        </Link>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={attachSelectedPackToDemoBatch}
                          className="inline-flex h-8 items-center bg-[#0B1324] px-2.5 text-[12px] font-semibold text-white hover:bg-[#1E293B]"
                        >
                          Attach to {DEMO_SMOKE_BATCH_ID}
                        </button>
                        <button
                          type="button"
                          onClick={() => runPolicyTest('version')}
                          className="inline-flex h-8 items-center border border-[#CBD5E1] bg-white px-2.5 text-[12px] font-semibold text-[#0B1324] hover:bg-[#F8FAFC]"
                        >
                          Test on batch first
                        </button>
                      </>
                    )}
                  </div>
                </section>

                <section className="border border-[#E9E5FF] bg-[#FAF9FF] px-4 py-3.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6D4AFF]">
                      Ask Zord · policy follow
                    </p>
                    <span className="inline-flex h-5 items-center rounded-sm bg-white px-1.5 text-[10px] font-semibold text-[#6D4AFF] ring-1 ring-[#E9E5FF]">
                      Sandbox
                    </span>
                  </div>
                  <p className="mt-1.5 text-[14px] font-semibold text-[#0B1324]">
                    {followInsight.headline}
                  </p>
                  <p className="mt-1 text-[12px] leading-relaxed text-[#475569]">
                    {followInsight.summary}
                  </p>
                  {followInsight.mode !== 'not_attached' ? (
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <div className="bg-white/80 px-2.5 py-2">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#94A3B8]">
                          Followed
                        </p>
                        <p className="mt-0.5 text-[18px] font-semibold tabular-nums text-[#0B1324]">
                          {followInsight.followedCleanly}
                        </p>
                      </div>
                      <div className="bg-white/80 px-2.5 py-2">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#94A3B8]">
                          Needs review
                        </p>
                        <p className="mt-0.5 text-[18px] font-semibold tabular-nums text-[#0B1324]">
                          {followInsight.needsReview}
                        </p>
                      </div>
                      <div className="bg-white/80 px-2.5 py-2">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#94A3B8]">
                          Blocked
                        </p>
                        <p className="mt-0.5 text-[18px] font-semibold tabular-nums text-[#0B1324]">
                          {followInsight.blocked}
                        </p>
                      </div>
                    </div>
                  ) : null}
                  <ul className="mt-3 space-y-1.5">
                    {followInsight.citations.map((c) => (
                      <li key={c.label} className="text-[12px] leading-snug text-[#3B2E7A]">
                        <span className="font-semibold">{c.label}: </span>
                        {c.detail}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-[11px] leading-relaxed text-[#6D4AFF]/90">
                    {followInsight.disclaimer}
                  </p>
                </section>
              </div>
            ) : null}

            <div className="mt-4 border-t border-[#E2E8F0] pt-3">
              <p className="text-[12px] font-semibold text-[#0B1324]">What must be proven</p>
              <p className="mt-1 text-[13px] text-[#475569]">
                Proof level{' '}
                <span className="font-semibold text-[#0B1324]">
                  {selectedVersion.evidenceRequirement.proofLevel}
                </span>
                <span className="mx-2 text-[#CBD5E1]">·</span>
                Keep records of{' '}
                <span className="font-medium text-[#0B1324]">
                  {selectedVersion.evidenceRequirement.mandatoryArtifacts
                    .map((a) => a.replace(/_/g, ' '))
                    .join(', ')}
                </span>
              </p>
            </div>

            {selectedVersion.conflicts.length > 0 ? (
              <div className="mt-3 border border-[#0B1324]/20 bg-[#F1F5F9] px-3 py-2.5">
                <p className="text-[12px] font-semibold text-[#0B1324]">Policy conflicts</p>
                <ul className="mt-1 space-y-1">
                  {selectedVersion.conflicts.map((c) => (
                    <li key={`${c.ruleA}-${c.ruleB}`} className="text-[12px] text-[#0B1324]">
                      <span className="font-mono">{c.ruleA}</span> ↔{' '}
                      <span className="font-mono">{c.ruleB}</span> - {c.detail}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>

          {showCompare && compareTarget ? (
            <section className="border border-[#E2E8F0] bg-white px-4 py-4 sm:px-5">
              <p className="text-[13px] font-semibold text-[#0B1324]">
                Compare {selectedVersion.version} → {compareTarget.version}
              </p>
              <p className="mt-1 text-[12px] text-[#64748B]">
                Rules in selected: {selectedVersion.rules.length} · Compared:{' '}
                {compareTarget.rules.length}
              </p>
              <ul className="mt-3 space-y-1.5 text-[12px] text-[#475569]">
                {selectedVersion.rules
                  .filter((r) => !compareTarget.rules.some((x) => x.id === r.id))
                  .map((r) => (
                    <li key={r.id}>
                      <span className="font-semibold text-[#0B1324]">+ added</span> {r.pattern}
                    </li>
                  ))}
                {compareTarget.rules
                  .filter((r) => !selectedVersion.rules.some((x) => x.id === r.id))
                  .map((r) => (
                    <li key={r.id}>
                      <span className="font-semibold text-[#0B1324]">− removed</span> {r.pattern}
                    </li>
                  ))}
                {selectedVersion.rules.every((r) => compareTarget.rules.some((x) => x.id === r.id)) &&
                compareTarget.rules.every((r) => selectedVersion.rules.some((x) => x.id === r.id)) ? (
                  <li>No rule set differences.</li>
                ) : null}
              </ul>
            </section>
          ) : null}

          <section className="border border-[#E2E8F0] bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E8F0] px-4 py-3">
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() => setCategory('all')}
                  className={`h-8 px-2.5 text-[12px] font-semibold ${
                    category === 'all' ? 'bg-[#0B1324] text-white' : 'bg-[#F1F5F9] text-[#64748B]'
                  }`}
                >
                  All
                </button>
                {POLICY_RULE_CATEGORIES.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCategory(c.id)}
                    className={`h-8 px-2.5 text-[12px] font-semibold ${
                      category === c.id ? 'bg-[#0B1324] text-white' : 'bg-[#F1F5F9] text-[#64748B]'
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setViewMode('builder')}
                  className={`h-8 px-2.5 text-[12px] font-semibold ${
                    viewMode === 'builder' ? 'bg-[#0B1324] text-white' : 'bg-[#F1F5F9] text-[#64748B]'
                  }`}
                >
                  Controls
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('json')}
                  className={`h-8 px-2.5 text-[12px] font-semibold ${
                    viewMode === 'json' ? 'bg-[#0B1324] text-white' : 'bg-[#F1F5F9] text-[#64748B]'
                  }`}
                >
                  Technical view
                </button>
              </div>
            </div>

            {viewMode === 'json' ? (
              <pre className="max-h-[420px] overflow-auto px-4 py-3 font-mono text-[11px] leading-relaxed text-[#334155]">
                {versionJson(selectedVersion)}
              </pre>
            ) : (
              <div className="divide-y divide-[#E2E8F0]">
                {visibleRules.length === 0 ? (
                  <p className="px-4 py-6 text-[13px] text-[#64748B]">No controls in this area yet.</p>
                ) : (
                  visibleRules.map((r) => (
                    <div key={r.id} className="flex flex-wrap items-start justify-between gap-2 px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-[#0B1324]">
                          {r.businessLabel || r.pattern}
                        </p>
                        {r.businessLabel ? (
                          <p className="mt-0.5 text-[12px] text-[#64748B]">{r.pattern}</p>
                        ) : null}
                        <p className="mt-0.5 text-[11px] text-[#94A3B8]">
                          {POLICY_RULE_CATEGORIES.find((c) => c.id === r.category)?.label}
                        </p>
                      </div>
                      <span className={`text-[12px] font-semibold ${effectTone(r.effect)}`}>
                        {effectLabel(r.effect)}
                      </span>
                    </div>
                  ))
                )}

                {canEdit ? (
                  <div className="space-y-3 bg-[#F8FAFC] px-4 py-4">
                    <p className="text-[12px] font-semibold text-[#0B1324]">Add a control</p>
                    <p className="text-[12px] text-[#64748B]">
                      Prefer Ask Zord for business wording - use this only for a precise override.
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                      <select
                        className="h-9 border border-[#CBD5E1] bg-white px-2 text-[12px]"
                        value={draftRule.category}
                        onChange={(e) =>
                          setDraftRule((d) => ({
                            ...d,
                            category: e.target.value as PolicyRuleCategory,
                          }))
                        }
                      >
                        {POLICY_RULE_CATEGORIES.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                      <input
                        className="h-9 border border-[#CBD5E1] bg-white px-2 text-[12px]"
                        value={draftRule.whenField}
                        onChange={(e) => setDraftRule((d) => ({ ...d, whenField: e.target.value }))}
                        placeholder="field"
                      />
                      <input
                        className="h-9 border border-[#CBD5E1] bg-white px-2 text-[12px]"
                        value={draftRule.operator}
                        onChange={(e) => setDraftRule((d) => ({ ...d, operator: e.target.value }))}
                        placeholder="operator"
                      />
                      <input
                        className="h-9 border border-[#CBD5E1] bg-white px-2 text-[12px]"
                        value={draftRule.value}
                        onChange={(e) => setDraftRule((d) => ({ ...d, value: e.target.value }))}
                        placeholder="value"
                      />
                      <select
                        className="h-9 border border-[#CBD5E1] bg-white px-2 text-[12px]"
                        value={draftRule.effect}
                        onChange={(e) =>
                          setDraftRule((d) => ({ ...d, effect: e.target.value as PolicyEffect }))
                        }
                      >
                        {POLICY_EFFECTS.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={addRule}
                      className="inline-flex h-9 items-center bg-[#0B1324] px-3.5 text-[13px] font-semibold text-white hover:bg-[#1E293B]"
                    >
                      Add rule
                    </button>
                  </div>
                ) : (
                  <div className="px-4 py-3 text-[12px] text-[#64748B]">
                    Active versions are immutable. Create a draft to add or edit rules.
                  </div>
                )}
              </div>
            )}
          </section>

          {/* AI suggestions - labelled, never auto-activate */}
          <section className="border border-[#E9E5FF] bg-white px-4 py-4 sm:px-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[13px] font-semibold text-[#0B1324]">Zord suggestions</p>
                  <span className="inline-flex h-5 items-center rounded-sm bg-[#FAF9FF] px-1.5 text-[10px] font-semibold text-[#6D4AFF] ring-1 ring-[#E9E5FF]">
                    AI · Sandbox
                  </span>
                </div>
                <p className="mt-0.5 text-[12px] text-[#64748B]">
                  Ideas only - you accept them into a draft. Zord never activates policy or bypasses
                  Control Review.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCreateGuideOpen(true)}
                className="text-[12px] font-semibold text-[#6D4AFF] hover:underline"
              >
                Ask Zord to draft
              </button>
            </div>
            <ul className="mt-3 space-y-2">
              {suggestions.map((s) => (
                <li
                  key={s.id}
                  className="flex flex-wrap items-start justify-between gap-2 border border-[#E2E8F0] bg-[#FAFBFC] px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#6D4AFF]">
                      Suggestion
                    </p>
                    <p className="mt-0.5 text-[13px] font-semibold text-[#0B1324]">{s.pattern}</p>
                    <p className="mt-0.5 text-[12px] text-[#475569]">{s.impact}</p>
                    {s.why ? (
                      <p className="mt-1 text-[11px] leading-snug text-[#64748B]">
                        <span className="font-semibold text-[#6D4AFF]">Why: </span>
                        {s.why}
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    disabled={s.accepted || selectedVersion?.immutable}
                    onClick={() => acceptSuggestion(s.id)}
                    className="inline-flex h-8 shrink-0 items-center border border-[#CBD5E1] bg-white px-2.5 text-[12px] font-semibold text-[#0B1324] hover:bg-[#F1F5F9] disabled:opacity-40"
                  >
                    {s.accepted ? 'Added' : 'Add to draft'}
                  </button>
                </li>
              ))}
            </ul>
          </section>

          {showTest ? (
            <section
              ref={testResultsRef}
              className="border border-[#E2E8F0] bg-white px-4 py-4 sm:px-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-[13px] font-semibold text-[#0B1324]">Test results</p>
                  <p className="mt-0.5 text-[12px] text-[#64748B]">
                    Impact on batch{' '}
                    <span className="font-mono text-[#0B1324]">{DEMO_POLICY_TEST_RESULT.batchId}</span>
                    {' · '}
                    live data not affected
                    {testRunAt ? (
                      <>
                        {' · '}
                        last run {testRunAt}
                      </>
                    ) : null}
                  </p>
                </div>
                <Link
                  href={POLICY_STUDIO_LINKS.demoBatchJournal}
                  className="text-[12px] font-semibold text-[#2563EB] hover:underline"
                >
                  Open batch
                </Link>
              </div>
              <div className="mt-3 flex flex-wrap gap-4 text-[13px] text-[#475569]">
                <span>
                  <span className="font-semibold tabular-nums text-[#0B1324]">
                    {DEMO_POLICY_TEST_RESULT.totals.allow}
                  </span>{' '}
                  allow
                </span>
                <span>
                  <span className="font-semibold tabular-nums text-[#0B1324]">
                    {DEMO_POLICY_TEST_RESULT.totals.warn}
                  </span>{' '}
                  warn
                </span>
                <span>
                  <span className="font-semibold tabular-nums text-[#0B1324]">
                    {DEMO_POLICY_TEST_RESULT.totals.block}
                  </span>{' '}
                  block
                </span>
                <span>
                  <span className="font-semibold tabular-nums text-[#0B1324]">
                    {DEMO_POLICY_TEST_RESULT.totals.requireApproval}
                  </span>{' '}
                  require approval
                </span>
              </div>
              <ul className="mt-3 divide-y divide-[#E2E8F0] border border-[#E2E8F0]">
                {DEMO_POLICY_TEST_RESULT.sampleImpacts.map((row) => (
                  <li key={row.obligationId} className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2.5">
                    <div>
                      <p className="font-mono text-[12px] font-semibold text-[#0B1324]">
                        {row.obligationId}
                      </p>
                      <p className="text-[12px] text-[#64748B]">{row.rulePattern}</p>
                    </div>
                    <span className={`text-[12px] font-semibold ${effectTone(row.effect)}`}>
                      {effectLabel(row.effect)}
                    </span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => runPolicyTest('panel')}
                className="mt-3 inline-flex h-9 items-center bg-[#0B1324] px-3.5 text-[13px] font-semibold text-white hover:bg-[#1E293B]"
              >
                Test policy on batch
              </button>
            </section>
          ) : (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => runPolicyTest('panel')}
                className="inline-flex h-9 items-center bg-[#0B1324] px-4 text-[13px] font-semibold text-white hover:bg-[#1E293B]"
              >
                Test policy on batch
              </button>
            </div>
          )}
        </div>
      </div>

      <CreatePolicyGuideDrawer
        open={createGuideOpen}
        packs={[...packs, ...DEMO_POLICY_PACKS.filter((d) => !packs.some((p) => p.id === d.id))]}
        defaultPackId={selectedPack.id}
        onClose={() => setCreateGuideOpen(false)}
        onComplete={applyCreateGuide}
      />
    </div>
  )
}
