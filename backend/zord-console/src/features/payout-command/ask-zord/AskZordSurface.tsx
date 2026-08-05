'use client'

import Link from 'next/link'
import { useCallback, useMemo, useState } from 'react'
import {
  ASK_MODES,
  ASK_ZORD_HEADER,
  DEMO_AGENT_ACTIVITY,
  resolveAskZordDemo,
  SLASH_COMMANDS,
  type AskAgentEvent,
  type AskMode,
  type AskReply,
} from '@/services/payout-command/demo/askZordDemo'
import { useDemoBatchReady } from '@/services/payout-command/demo/demoBatchReadiness'
import { DEMO_SMOKE_BATCH_ID, DEMO_WORKSPACE_NAME } from '@/services/payout-command/demo/ycDemoConstants'
import { AwaitingUploadsEmptyState } from '../demo/AwaitingUploadsEmptyState'
import { PageExplainerBanner } from '../demo/PageExplainerBanner'
import { AskZordOrb } from '../workspace/AskZordOrb'

type ChatTurn = {
  id: string
  role: 'user' | 'assistant'
  text?: string
  reply?: AskReply
}

/**
  * Spec 7.16 - Ask Zord (Razorpay-clean shell + Siri hologram while thinking).
  */
export function AskZordSurface() {
  const { ready, readiness } = useDemoBatchReady()
  const [mode, setMode] = useState<AskMode>('ask')
  const [input, setInput] = useState('')
  const [turns, setTurns] = useState<ChatTurn[]>([])
  const [activity, setActivity] = useState<AskAgentEvent[]>(DEMO_AGENT_ACTIVITY)
  const [confirmDraft, setConfirmDraft] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [thinking, setThinking] = useState(false)
  const [thinkingSteps, setThinkingSteps] = useState<string[]>([])
  const [thinkingStepIndex, setThinkingStepIndex] = useState(0)

  const scopeLine = useMemo(
    () =>
      ready
        ? `${DEMO_WORKSPACE_NAME} · ${DEMO_SMOKE_BATCH_ID} · Sandbox`
        : `${DEMO_WORKSPACE_NAME} · Awaiting uploads · Sandbox`,
    [ready],
  )

  const flash = useCallback((msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(null), 2800)
  }, [])

  const investigationStepsFor = useCallback((prompt: string): string[] => {
    const p = prompt.toLowerCase()
    if (p.includes('trace') || p.includes('payment')) {
      return [
        'Searching payouts in this batch…',
        'Opening sealed Payment Action Contract…',
        'Reading dispatch attempts and provider ack…',
        'Checking settlement / outcome signals…',
        'Attaching evidence pack citations…',
      ]
    }
    if (p.includes('proof') || p.includes('verify') || p.includes('evidence')) {
      return [
        'Searching evidence packs…',
        'Checking integrity hash and merkle root…',
        'Comparing coverage ladder (P0–P5)…',
        'Linking contract and outcome artefacts…',
        'Preparing citation list…',
      ]
    }
    if (p.includes('exception') || p.includes('short') || p.includes('compare')) {
      return [
        'Searching outcome exceptions…',
        'Loading sealed expected amount from contract…',
        'Comparing observed settlement credit…',
        'Ranking root-cause candidates (non-binding)…',
        'Citing Outcome Review and Settlement Journal…',
      ]
    }
    if (p.includes('batch') || p.includes('summar')) {
      return [
        'Scanning batch payouts…',
        'Aggregating intended vs observed value…',
        'Flagging blocked, short, and return cases…',
        'Checking proof-ready coverage…',
        'Drafting batch summary with citations…',
      ]
    }
    return [
      'Searching workspace payouts…',
      'Reading sealed contracts and policy decisions…',
      'Checking settlement journal signals…',
      'Looking up evidence packs…',
      'Composing answer with citations…',
    ]
  }, [])

  const runPrompt = useCallback(
    (raw: string) => {
      const prompt = raw.trim()
      if (!prompt || thinking) return

      const userTurn: ChatTurn = { id: `u_${Date.now()}`, role: 'user', text: prompt }
      setTurns((prev) => [...prev, userTurn])
      setInput('')
      setThinking(true)
      setConfirmDraft(null)

      const steps = investigationStepsFor(prompt)
      setThinkingSteps(steps)
      setThinkingStepIndex(0)

      const stepTimers: number[] = []
      steps.forEach((_, i) => {
        if (i === 0) return
        stepTimers.push(
          window.setTimeout(() => {
            setThinkingStepIndex(i)
          }, 450 * i),
        )
      })

      const finishAt = 450 * steps.length + 200
      window.setTimeout(() => {
        const reply = resolveAskZordDemo(prompt, mode)
        const assistantTurn: ChatTurn = { id: reply.id, role: 'assistant', reply }
        setTurns((prev) => [...prev, assistantTurn])
        setActivity((prev) => [
          {
            id: `ag_${Date.now()}`,
            at: 'Just now',
            actor: 'Ask Zord',
            action: `Answered in ${mode.toUpperCase()} · cited ${reply.citations.length} objects`,
            mode,
          },
          ...prev,
        ])
        if (reply.draftPreview && (mode === 'act' || mode === 'build')) {
          setConfirmDraft(reply.draftPreview)
        }
        setThinking(false)
        setThinkingSteps([])
        setThinkingStepIndex(0)
        stepTimers.forEach((id) => window.clearTimeout(id))
      }, finishAt)
    },
    [mode, thinking, investigationStepsFor],
  )

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    runPrompt(input)
  }

  function confirmPreviewedAction() {
    if (!confirmDraft) return
    setActivity((prev) => [
      {
        id: `ag_confirm_${Date.now()}`,
        at: 'Just now',
        actor: 'Reviewer',
        action: 'Confirmed draft preview - re-enters policy/auth before any money impact (sandbox)',
        mode: 'act',
      },
      ...prev,
    ])
    setConfirmDraft(null)
    flash('Draft acknowledged - deterministic policy/auth still required. No auto-seal or dispatch.')
  }

  const empty = turns.length === 0 && !thinking

  if (!ready) {
    return (
      <div className="relative min-h-0 flex-1 overflow-y-auto bg-[#F7F8FB]">
        <div className="relative mx-auto flex w-full max-w-[1080px] flex-col space-y-5 px-5 py-6 sm:px-8 lg:px-10">
          <PageExplainerBanner page="ask" />
          <div>
            <h1 className="text-[28px] font-semibold tracking-[-0.03em] text-[#0B1324]">
              {ASK_ZORD_HEADER.title}
            </h1>
            <p className="mt-1 max-w-xl text-[14px] leading-relaxed text-[#64748B]">
              {ASK_ZORD_HEADER.subtitle}
            </p>
          </div>
          <AwaitingUploadsEmptyState
            title="Ask Zord needs a completed batch"
            readiness={readiness}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-0 flex-1 overflow-y-auto bg-[#F7F8FB]">
      {/* Soft page atmosphere - Razorpay-clean, not loud */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(ellipse_at_50%_0%,rgba(0,102,255,0.07)_0%,rgba(14,165,233,0.05)_40%,transparent_72%)]"
        aria-hidden
      />

      <div className="relative mx-auto flex w-full max-w-[1080px] flex-col px-5 py-6 sm:px-8 lg:px-10">
        <PageExplainerBanner page="ask" />
        {/* Compact product header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-[28px] font-semibold tracking-[-0.03em] text-[#0B1324]">
              {ASK_ZORD_HEADER.title}
            </h1>
            <p className="mt-1 max-w-xl text-[14px] leading-relaxed text-[#64748B]">
              {ASK_ZORD_HEADER.subtitle}
            </p>
          </div>
          <div className="rounded-xl border border-[#E8ECF4] bg-white/90 px-3.5 py-2.5 text-[12px] shadow-[0_1px_2px_rgba(15,23,42,0.04)] backdrop-blur">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">Scope</p>
            <p className="mt-0.5 font-medium text-[#0B1324]">{scopeLine}</p>
          </div>
        </div>

        {/* Mode segmented control - Razorpay-style */}
        <div className="mt-5 inline-flex w-fit rounded-xl border border-[#E8ECF4] bg-white p-1 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          {ASK_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              title={m.hint}
              className={`h-9 rounded-lg px-4 text-[13px] font-semibold transition ${
                mode === m.id ? 'text-white shadow-sm' : 'text-[#64748B] hover:text-[#0B1324]'
              }`}
              style={mode === m.id ? { backgroundColor: '#0066FF' } : undefined}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[12px] text-[#94A3B8]">
          <span className="font-medium text-[#0066FF]">{ASK_ZORD_HEADER.tagline}</span>
          {' · '}
          {ASK_MODES.find((m) => m.id === mode)?.hint}
        </p>

        {/* Hero hologram when idle / thinking */}
        {(empty || thinking) && (
          <div className="mt-8 flex flex-col items-center">
            <AskZordOrb active={thinking} size="lg" />
            <p className="mt-5 text-center text-[15px] font-medium text-[#0B1324]">
              {thinking
                ? thinkingSteps[thinkingStepIndex] ?? 'Investigating…'
                : 'What do you want to investigate?'}
            </p>
            {!thinking ? (
              <p className="mt-1 text-center text-[13px] text-[#94A3B8]">
                Slash a command or ask in plain language
              </p>
            ) : (
              <ul className="mt-3 w-full max-w-sm space-y-1.5 px-4 text-left">
                {thinkingSteps.map((step, i) => (
                  <li
                    key={step}
                    className={`flex items-center gap-2 text-[12px] ${
                      i < thinkingStepIndex
                        ? 'text-[#64748B]'
                        : i === thinkingStepIndex
                          ? 'font-semibold text-[#0066FF]'
                          : 'text-[#CBD5E1]'
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        i < thinkingStepIndex
                          ? 'bg-[#94A3B8]'
                          : i === thinkingStepIndex
                            ? 'animate-pulse bg-[#0066FF]'
                            : 'bg-[#E2E8F0]'
                      }`}
                    />
                    {step}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Compact orb while thread is active */}
        {!empty && !thinking ? (
          <div className="mt-6 flex items-center gap-3">
            <AskZordOrb active={false} size="md" />
            <div>
              <p className="text-[13px] font-semibold text-[#0B1324]">Ask Zord</p>
              <p className="text-[12px] text-[#94A3B8]">Ready · citations attached to answers</p>
            </div>
          </div>
        ) : null}

        <div className={`grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px] ${empty ? 'mt-8' : 'mt-5'}`}>
          <div className="min-w-0 space-y-4">
            {/* Slash chips */}
            <div className="flex flex-wrap gap-2">
              {SLASH_COMMANDS.map((s) => (
                <button
                  key={s.cmd}
                  type="button"
                  disabled={thinking}
                  onClick={() => runPrompt(s.example)}
                  className="rounded-full border border-[#E8ECF4] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#0B1324] shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition hover:border-[#0066FF]/40 hover:text-[#0066FF] disabled:opacity-50"
                >
                  {s.cmd}
                </button>
              ))}
            </div>

            {/* Thread */}
            {turns.length > 0 ? (
              <div className="space-y-4 rounded-2xl border border-[#E8ECF4] bg-white px-4 py-5 shadow-[0_8px_30px_rgba(15,23,42,0.04)] sm:px-6">
                {turns.map((t) =>
                  t.role === 'user' ? (
                    <div key={t.id} className="flex justify-end">
                      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-[#0B1324] px-4 py-2.5 text-[13px] leading-relaxed text-white">
                        {t.text}
                      </div>
                    </div>
                  ) : t.reply ? (
                    <article key={t.id} className="max-w-[95%] space-y-3">
                      <div className="rounded-2xl rounded-bl-md border border-[#DBEAFE] bg-gradient-to-br from-[#EFF6FF] to-white px-4 py-3.5">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#0066FF]">
                          Scope
                        </p>
                        <p className="mt-1 text-[12px] text-[#64748B]">{t.reply.scope}</p>
                        <p className="mt-3 text-[14px] leading-relaxed text-[#0B1324]">
                          {t.reply.finding}
                        </p>
                        {t.reply.caveat ? (
                          <p className="mt-2 text-[12px] text-[#0B1324]">{t.reply.caveat}</p>
                        ) : null}
                      </div>

                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">
                          Citations · Open source
                        </p>
                        <ul className="mt-2 space-y-1.5">
                          {t.reply.citations.map((c) => (
                            <li key={c.id}>
                              <Link
                                href={c.href}
                                className="flex flex-wrap items-baseline gap-x-2 rounded-lg border border-transparent px-2 py-1.5 text-[13px] transition hover:border-[#DBEAFE] hover:bg-[#F1F5F9]"
                              >
                                <span className="font-semibold text-[#0066FF]">{c.label}</span>
                                <span className="text-[11px] text-[#94A3B8]">{c.objectKind}</span>
                                <span className="text-[12px] text-[#64748B]">{c.detail}</span>
                                <span className="text-[11px] font-semibold text-[#2E5BFF]">
                                  Open source →
                                </span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {t.reply.draftPreview ? (
                        <div className="rounded-xl border border-[#0B1324]/20 bg-[#F1F5F9] px-3.5 py-2.5 text-[12px] text-[#0B1324]">
                          <p className="font-semibold">Action preview (not executed)</p>
                          <p className="mt-1 leading-relaxed">{t.reply.draftPreview}</p>
                        </div>
                      ) : null}

                      <div className="flex flex-wrap gap-2">
                        {t.reply.suggestedActions.map((a) =>
                          a.href ? (
                            <Link
                              key={a.label}
                              href={a.href}
                              className="rounded-full border border-[#E8ECF4] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#2E5BFF] hover:border-[#2E5BFF]/30"
                            >
                              {a.label}
                              {a.previewOnly ? ' · preview' : ''}
                            </Link>
                          ) : (
                            <button
                              key={a.label}
                              type="button"
                              onClick={() => runPrompt(a.label.replace(/^Run\s+/i, ''))}
                              className="rounded-full border border-[#E8ECF4] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#0066FF]"
                            >
                              {a.label}
                            </button>
                          ),
                        )}
                      </div>
                    </article>
                  ) : null,
                )}

                {thinking ? (
                  <div className="space-y-2 rounded-xl border border-[#DBEAFE] bg-[#F8FBFF] px-3.5 py-3">
                    <div className="flex items-center gap-2 text-[13px] font-semibold text-[#0066FF]">
                      <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-[#0066FF]" />
                      {thinkingSteps[thinkingStepIndex] ?? 'Investigating…'}
                    </div>
                    <ul className="space-y-1">
                      {thinkingSteps.map((step, i) => (
                        <li
                          key={step}
                          className={`text-[11px] ${
                            i < thinkingStepIndex
                              ? 'text-[#94A3B8] line-through'
                              : i === thinkingStepIndex
                                ? 'font-medium text-[#0B1324]'
                                : 'text-[#CBD5E1]'
                          }`}
                        >
                          {i < thinkingStepIndex ? '✓ ' : i === thinkingStepIndex ? '→ ' : '· '}
                          {step}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}

            {confirmDraft ? (
              <div className="rounded-2xl border border-[#0B1324]/20 bg-[#F1F5F9] px-4 py-3">
                <p className="text-[13px] font-semibold text-[#0B1324]">Confirm draft preview</p>
                <p className="mt-1 text-[12px] text-[#0B1324]">{confirmDraft}</p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={confirmPreviewedAction}
                    className="h-9 rounded-lg bg-[#0B1324] px-3.5 text-[13px] font-semibold text-white"
                  >
                    Confirm (sandbox)
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDraft(null)}
                    className="h-9 px-3 text-[13px] font-semibold text-[#64748B]"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ) : null}

            {/* Composer - Razorpay floating input */}
            <form
              onSubmit={onSubmit}
              className="sticky bottom-4 rounded-2xl border border-[#E8ECF4] bg-white px-4 py-3 shadow-[0_12px_40px_rgba(15,23,42,0.08)]"
            >
              <label className="sr-only" htmlFor="ask-zord-input">
                Ask Zord prompt
              </label>
              <textarea
                id="ask-zord-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                rows={2}
                disabled={thinking}
                placeholder="Ask anything - or /explain exception · /trace PAY-0019 · /verify proof"
                className="w-full resize-none border-0 bg-transparent text-[14px] text-[#0B1324] placeholder:text-[#94A3B8] focus:outline-none disabled:opacity-60"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    runPrompt(input)
                  }
                }}
              />
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-[#F1F5F9] pt-2">
                <p className="text-[11px] text-[#94A3B8]">
                  Mode <span className="font-semibold text-[#0066FF]">{mode}</span>
                  {thinking ? ' · hologram listening' : ''}
                </p>
                <button
                  type="submit"
                  disabled={thinking || !input.trim()}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg px-4 text-[13px] font-semibold text-white transition disabled:cursor-not-allowed"
                  style={{
                    backgroundColor: thinking || !input.trim() ? '#93C5FD' : '#0066FF',
                  }}
                >
                  {thinking ? 'Thinking…' : mode === 'ask' ? 'Ask' : mode === 'act' ? 'Draft' : 'Build'}
                </button>
              </div>
            </form>
          </div>

          <aside className="space-y-3 lg:pt-1">
            <section className="rounded-2xl border border-[#E8ECF4] bg-white px-3.5 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
              <p className="text-[12px] font-semibold text-[#0B1324]">Agent activity</p>
              <p className="mt-0.5 text-[11px] text-[#94A3B8]">Audited · never silent</p>
              <ul className="mt-3 space-y-2.5">
                {activity.slice(0, 6).map((a) => (
                  <li key={a.id} className="border-b border-[#F1F5F9] pb-2 last:border-0">
                    <p className="text-[12px] font-medium leading-snug text-[#0B1324]">{a.action}</p>
                    <p className="mt-0.5 text-[11px] text-[#94A3B8]">
                      {a.at} · {a.mode}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
            <section className="rounded-2xl border border-[#E8ECF4] bg-white px-3.5 py-3 text-[11px] leading-relaxed text-[#64748B]">
              <p className="font-semibold text-[#0B1324]">Safety</p>
              <ul className="mt-2 space-y-1.5">
                <li className="flex gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#0066FF]" />
                  Cite scope + evidence
                </li>
                <li className="flex gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#0066FF]" />
                  Preview before Act / Build
                </li>
                <li className="flex gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#0066FF]" />
                  Never auto-seal or dispatch
                </li>
              </ul>
            </section>
          </aside>
        </div>
      </div>

      {toast ? (
        <div
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-[#0B1324] px-4 py-2.5 text-[13px] font-medium text-white shadow-lg"
          role="status"
        >
          {toast}
        </div>
      ) : null}
    </div>
  )
}
