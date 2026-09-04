import {
  AGENT_ID,
  CROSS_BORDER_TENANT,
  EXCEPTION_ID,
  GRAPH,
  PAC_ID,
  PROPOSAL_ID,
  TRACE_ID,
  getTraceBundle,
  lifecycleNodes,
  protocolCatalog,
  replayLifecycle,
  verifyProofPack,
} from './store.js'
import { getAgent, listAgents } from './agentRegistry.js'
import { verifySealedObject } from './crypto.js'
import {
  findActionDemo,
  isKnownActionId,
  listActionSummaries,
  dispatchViewForDemo,
  lifecycleNodesForDemo,
  projectGraphForDemo,
  batchPortfolioTotals,
} from './actionsCatalog.js'
import {
  attachAgentStructure,
  batchPaymentInstructions,
  enrichDispatchView,
  enrichLifecycleForDispatchGate,
  enrichSignalsForDispatchGate,
  executeUserDispatch,
  getAgentStructure,
  getDispatchGate,
  getLatestAttachedStructure,
  listAgentStructures,
  resolveAgentAllowedRails,
  updateAgentStructure,
  withStructureOverlay,
} from './structures.js'
import {
  hasIngestedIntentFile,
  hasIngestedSettlementFile,
} from '../uploadReadiness.js'

const EMPTY_BATCH_TOTALS = {
  intent_count: 0,
  intended_minor: 0,
  intended_display: '₹0.00',
  intended_rupees: 0,
  currency: 'INR',
}

function obligationUploadRequired(pathname) {
  return json(
    {
      error: 'obligation_upload_required',
      message: 'Upload an obligation / intent file before protocol payout objects are available.',
      path: pathname,
    },
    404,
  )
}

function settlementUploadRequired(pathname) {
  return json(
    {
      error: 'settlement_upload_required',
      message: 'Upload a settlement file before proof packs are available.',
      path: pathname,
    },
    404,
  )
}

function isProofPath(pathname, parts) {
  if (pathname.startsWith('/v1/proof-packs')) return true
  return parts[0] === 'v1' && parts[1] === 'actions' && parts[3] === 'proof-pack'
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

function notFound(pathname) {
  return json({ error: 'protocol_not_found', path: pathname }, 404)
}

function segments(pathname) {
  return pathname.replace(/\/+$/, '').split('/').filter(Boolean)
}

async function readBody(request) {
  try {
    return await request.json()
  } catch {
    return {}
  }
}

function matchesTrace(id) {
  return !id || isKnownActionId(id) || id === CROSS_BORDER_TENANT
}

/**
 * Spec §11.4 protocol APIs plus GET helpers the Cross border console needs.
 * Existing INR /api/prod/* routes are untouched.
 */
export async function handleProtocolRequest(request) {
  const url = new URL(request.url)
  const { pathname } = url
  const method = request.method.toUpperCase()
  const parts = segments(pathname)

  if (method === 'GET' && pathname === '/v1/protocol/schemas') {
    const unlocked = hasIngestedIntentFile(request)
    return json({
      ...protocolCatalog(),
      batch_actions: unlocked ? listActionSummaries() : [],
      batch_totals: unlocked ? batchPortfolioTotals() : EMPTY_BATCH_TOTALS,
    })
  }
  if (method === 'GET' && pathname === '/v1/protocol/jwks') {
    return json(GRAPH.jwks)
  }

  if (!hasIngestedIntentFile(request)) {
    if (
      method === 'GET' &&
      (pathname === '/v1/actions' || pathname === '/v1/agents' || pathname === '/v1/exceptions')
    ) {
      return json({ items: [], count: 0, default_trace_id: null })
    }
    if (
      pathname.startsWith('/v1/action') ||
      pathname.startsWith('/v1/payment-action') ||
      pathname.startsWith('/v1/agents') ||
      pathname.startsWith('/v1/exceptions') ||
      pathname.startsWith('/v1/proof')
    ) {
      return obligationUploadRequired(pathname)
    }
  }

  if (isProofPath(pathname, parts) && !hasIngestedSettlementFile(request)) {
    return settlementUploadRequired(pathname)
  }
  if (method === 'GET' && pathname === '/v1/agents') {
    return json({ items: listAgents() })
  }
  if (method === 'GET' && pathname === `/v1/agents/${AGENT_ID}`) {
    const agent = getAgent(AGENT_ID)
    const structures = listAgentStructures(AGENT_ID)
    const latest = getLatestAttachedStructure(AGENT_ID)
    return json({
      ...agent,
      attached_structures: structures,
      latest_structure: latest,
    })
  }
  if (method === 'GET' && pathname === `/v1/agents/${AGENT_ID}/structures`) {
    return json({
      agent_id: AGENT_ID,
      items: listAgentStructures(AGENT_ID),
      latest: getLatestAttachedStructure(AGENT_ID),
    })
  }
  if (method === 'POST' && pathname === `/v1/agents/${AGENT_ID}/structures`) {
    try {
      const body = await readBody(request)
      const structure = attachAgentStructure(AGENT_ID, body)
      return json({ ok: true, structure, agent_id: AGENT_ID }, 201)
    } catch (err) {
      const status = Number(err?.status) || 500
      return json({ error: err?.message || 'attach_failed' }, status)
    }
  }
  if (
    (method === 'GET' || method === 'PATCH' || method === 'PUT') &&
    parts[0] === 'v1' &&
    parts[1] === 'agents' &&
    parts[2] === AGENT_ID &&
    parts[3] === 'structures' &&
    parts[4]
  ) {
    const structureId = decodeURIComponent(parts[4])
    if (method === 'GET') {
      const structure = getAgentStructure(AGENT_ID, structureId)
      if (!structure) return json({ error: 'structure_not_found' }, 404)
      return json({ ok: true, structure })
    }
    try {
      const body = await readBody(request)
      const structure = updateAgentStructure(AGENT_ID, structureId, body)
      return json({ ok: true, structure, agent_id: AGENT_ID })
    } catch (err) {
      const status = Number(err?.status) || 500
      return json({ error: err?.message || 'update_failed' }, status)
    }
  }

  if (method === 'POST' && pathname === '/v1/action-proposals') {
    return json(GRAPH.actionProposal, 201)
  }
  if (method === 'GET' && pathname === `/v1/action-proposals/${PROPOSAL_ID}`) {
    return json(withStructureOverlay(GRAPH.actionProposal, 'proposal'))
  }

  if (method === 'POST' && pathname === `/v1/actions/${PROPOSAL_ID}/authority/evaluate`) {
    return json({
      result: 'PASS',
      trace_id: TRACE_ID,
      credentials: GRAPH.authorityCredentials,
      policy_decision: GRAPH.policyDecision,
      blocked: false,
    })
  }
  if (method === 'POST' && pathname === `/v1/actions/${PROPOSAL_ID}/approvals`) {
    return json({
      required: ['Treasury Controller', 'CFO'],
      received: GRAPH.pac.authority.approval_refs,
      separation_of_duties: true,
      status: 'COMPLETE',
    })
  }

  if (method === 'POST' && pathname === '/v1/payment-action-contracts') {
    return json(GRAPH.pac, 201)
  }
  if (method === 'GET' && pathname === `/v1/payment-action-contracts/${PAC_ID}`) {
    return json(withStructureOverlay(GRAPH.pac, 'pac'))
  }
  if (
    method === 'POST' &&
    parts[0] === 'v1' &&
    parts[1] === 'payment-action-contracts' &&
    parts[2] &&
    parts[3] === 'verify'
  ) {
    const pacId = decodeURIComponent(parts[2])
    const demo = findActionDemo(pacId)
    if (!demo) return json({ error: 'unknown_pac', pac_id: pacId }, 404)
    const graph = projectGraphForDemo(demo)
    const pac = graph.pac
    const body = await readBody(request)
    if (body?.tamper_amount_minor != null) {
      return json(
        verifySealedObject({
          ...pac,
          action: { ...(pac.action || {}), amount_minor: Number(body.tamper_amount_minor) },
        }),
      )
    }
    if (body?.object) return json(verifySealedObject(body.object))
    return json(verifySealedObject(pac))
  }
  if (method === 'POST' && pathname === `/v1/payment-action-contracts/${PAC_ID}/dispatch`) {
    const receipt = executeUserDispatch(PAC_ID)
    return json({ ok: true, receipt, dispatch_gate: getDispatchGate(TRACE_ID) })
  }
  // Dispatch any catalog PAC by id
  if (
    method === 'POST' &&
    parts[0] === 'v1' &&
    parts[1] === 'payment-action-contracts' &&
    parts[2] &&
    parts[3] === 'dispatch'
  ) {
    const pacId = decodeURIComponent(parts[2])
    const demo = findActionDemo(pacId)
    if (!demo) return json({ error: 'unknown_pac', pac_id: pacId }, 404)
    const receipt = executeUserDispatch(pacId)
    return json({ ok: true, receipt, dispatch_gate: getDispatchGate(demo.trace_id) })
  }

  if (method === 'GET' && pathname === '/v1/actions') {
    return json({
      items: listActionSummaries(),
      default_trace_id: TRACE_ID,
      count: listActionSummaries().length,
    })
  }

  if (method === 'GET' && pathname === '/v1/actions/new') {
    const structure = getLatestAttachedStructure(AGENT_ID)
    const policyRails = resolveAgentAllowedRails(AGENT_ID)
    const instructions = batchPaymentInstructions()
    const totals = batchPortfolioTotals()
    return json({
      agent: {
        ...GRAPH.agentProfile,
        allowed_rails: policyRails,
        allowed_rails_source: policyRails.length ? 'policy_structure' : 'unbound',
        settlement_currency: structure?.settlement_currency ?? null,
        latest_structure: structure,
        attached_structures: listAgentStructures(AGENT_ID),
      },
      source: {
        ...GRAPH.rawEnvelope,
        instruction: `Batch 001 · ${totals.intent_count} payment instructions · ${totals.intended_display} to approved vendors.`,
        batch_id: 'batch-001',
        invoice_refs: instructions.map((r) => r.human_ref),
      },
      proposal: withStructureOverlay(GRAPH.actionProposal, 'proposal'),
      attached_structure: structure,
      batch: {
        batch_id: 'batch-001',
        label: 'Batch 001',
        intent_count: totals.intent_count,
        intended_rupees: totals.intended_rupees,
        intended_display: totals.intended_display,
        currency: 'INR',
      },
      payment_instructions: instructions,
      invoices: instructions.map((row) => ({
        id: row.human_ref,
        amount_minor: row.amount_minor,
        currency: row.currency,
        vendor: row.beneficiary,
        trace_id: row.trace_id,
        intent_id: row.intent_id,
        rail: row.rail,
        current_state: row.current_state,
      })),
      purchase_orders: [{ id: 'BATCH-001', vendor: 'Zordnet Operations · 20 supplier payouts' }],
    })
  }

  if (parts[0] === 'v1' && parts[1] === 'actions' && parts[2]) {
    const traceId = decodeURIComponent(parts[2])
    if (!matchesTrace(traceId) && traceId !== CROSS_BORDER_TENANT) {
      return json({ error: 'unknown_trace', trace_id: traceId }, 404)
    }
    const demo = findActionDemo(traceId) ?? findActionDemo(TRACE_ID)
    const graph = projectGraphForDemo(demo)
    if (method === 'GET' && parts.length === 3) {
      return json(demo?.primary ? getTraceBundle() : graph)
    }
    if (method === 'GET' && parts[3] === 'authority') {
      const totals = batchPortfolioTotals()
      const action = graph.pac?.action ?? graph.actionProposal?.action ?? {}
      return json({
        trace_id: demo.trace_id,
        demo: {
          trace_id: demo.trace_id,
          pac_id: demo.pac_id,
          human_ref: demo.human_ref,
          beneficiary: demo.beneficiary,
          debtor: demo.debtor,
          amount_minor: demo.amount_minor,
          amount_display: (demo.amount_minor / 100).toLocaleString('en-IN', {
            style: 'currency',
            currency: demo.currency,
            minimumFractionDigits: 2,
          }),
          currency: demo.currency,
          rail: demo.rail,
          current_state: demo.current_state,
          primary: Boolean(demo.primary),
        },
        batch_totals: totals,
        payment_instructions: batchPaymentInstructions(),
        nodes: [
          { id: 'org', label: demo.debtor, kind: 'enterprise_root', credential: graph.authorityCredentials[0] },
          { id: 'controller', label: 'Treasury Controller', kind: 'human', credential: graph.authorityCredentials[1] },
          { id: 'cfo', label: 'CFO', kind: 'human', credential: graph.authorityCredentials[2] },
          { id: 'agent', label: 'Treasury Action Agent', kind: 'agent', credential: graph.authorityCredentials[3] },
          {
            id: 'proposal',
            label: `ActionProposal · ${demo.human_ref}`,
            kind: 'proposal',
            object: withStructureOverlay(graph.actionProposal, 'proposal'),
          },
          {
            id: 'policy',
            label: `PolicyDecision · ${demo.human_ref}`,
            kind: 'policy',
            object: graph.policyDecision,
          },
          {
            id: 'pac',
            label: `PAC · ${demo.human_ref} · ${(demo.amount_minor / 100).toLocaleString('en-IN', { style: 'currency', currency: demo.currency, maximumFractionDigits: 0 })}`,
            kind: 'pac',
            object: withStructureOverlay(graph.pac, 'pac'),
          },
        ],
        edges: [
          ['org', 'controller'],
          ['org', 'cfo'],
          ['controller', 'agent'],
          ['agent', 'proposal'],
          ['proposal', 'policy'],
          ['controller', 'pac'],
          ['cfo', 'pac'],
          ['policy', 'pac'],
        ],
        payout: {
          human_ref: demo.human_ref,
          beneficiary: demo.beneficiary,
          amount_minor: demo.amount_minor,
          currency: demo.currency,
          rail: demo.rail,
          action,
        },
      })
    }
    if (method === 'GET' && parts[3] === 'contract') {
      const pac = withStructureOverlay(graph.pac, 'pac')
      const totals = batchPortfolioTotals()
      return json({
        ...pac,
        demo: {
          trace_id: demo.trace_id,
          pac_id: demo.pac_id,
          human_ref: demo.human_ref,
          beneficiary: demo.beneficiary,
          debtor: demo.debtor,
          amount_minor: demo.amount_minor,
          amount_display: (demo.amount_minor / 100).toLocaleString('en-IN', {
            style: 'currency',
            currency: demo.currency,
            minimumFractionDigits: 2,
          }),
          currency: demo.currency,
          rail: demo.rail,
          current_state: demo.current_state,
          primary: Boolean(demo.primary),
        },
        batch_totals: totals,
      })
    }
    if (method === 'GET' && parts[3] === 'dispatch') {
      const baseView = dispatchViewForDemo(demo)
      return json(
        enrichDispatchView(
          {
            ...baseView,
            pac: withStructureOverlay(baseView.pac, 'pac'),
            preflight: [
              ...baseView.preflight,
              {
                check: 'Policy Studio structure bound (advisory)',
                result: getLatestAttachedStructure() ? 'PASS' : 'SKIP',
              },
            ],
          },
          demo.trace_id,
        ),
      )
    }
    if (method === 'GET' && parts[3] === 'signals') {
      const totals = batchPortfolioTotals()
      const payload = enrichSignalsForDispatchGate({ items: graph.signals }, demo.trace_id)
      return json({
        ...payload,
        demo: {
          trace_id: demo.trace_id,
          pac_id: demo.pac_id,
          human_ref: demo.human_ref,
          beneficiary: demo.beneficiary,
          amount_minor: demo.amount_minor,
          amount_display: (demo.amount_minor / 100).toLocaleString('en-IN', {
            style: 'currency',
            currency: demo.currency,
            minimumFractionDigits: 2,
          }),
          currency: demo.currency,
          rail: demo.rail,
          provider_reference: demo.provider_reference || null,
          connector_name: demo.connector_name,
          current_state: demo.current_state,
        },
        batch_totals: totals,
      })
    }
    if (method === 'GET' && parts[3] === 'lifecycle') {
      return json(
        enrichLifecycleForDispatchGate(lifecycleNodesForDemo(demo), demo.trace_id),
      )
    }
    if (method === 'POST' && parts[3] === 'replay') return json(replayLifecycle())
    if (method === 'GET' && parts[3] === 'proof-pack') {
      return json({
        pack: graph.proofPack,
        pac: graph.pac,
        authority: graph.authorityCredentials,
        execution: graph.dispatchReceipt,
        observation: graph.signals,
        lifecycle: graph.transitions,
        finality: graph.finality,
        verification: verifyProofPack(),
      })
    }
  }

  if (method === 'GET' && pathname === `/v1/exceptions/${EXCEPTION_ID}`) {
    return json({
      ...GRAPH.exception,
      proposal: GRAPH.actionProposal,
      pac_id: PAC_ID,
    })
  }
  if (method === 'GET' && pathname === '/v1/exceptions') {
    return json({ items: [GRAPH.exception] })
  }

  if (method === 'GET' && pathname === `/v1/proof-packs/${GRAPH.proofPack.pack_id}`) {
    return json({ pack: GRAPH.proofPack, verification: verifyProofPack() })
  }
  if (method === 'POST' && pathname === '/v1/proof-packs/verify') {
    const body = await readBody(request)
    return json(verifyProofPack({ mutateDigest: Boolean(body?.tamper || body?.mutate_evidence) }))
  }

  if (pathname.startsWith('/v1/action') || pathname.startsWith('/v1/payment-action') || pathname.startsWith('/v1/proof') || pathname.startsWith('/v1/protocol') || pathname.startsWith('/v1/agents') || pathname.startsWith('/v1/exceptions')) {
    return notFound(pathname)
  }

  return null
}
