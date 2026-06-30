'use client'

import { FinalLandingPageScaffold } from '@/components/landing-final/FinalLandingPageScaffold'

const resourceCards = [
  {
    eyebrow: 'Product walkthrough',
    title: 'See how ZORD operates across confirmation, matching, and proof',
    body:
      'Start with the operating model if your team needs the fastest explanation of how ZORD works in production.',
    href: '/final-landing/how-it-works',
    cta: 'Open how it works',
  },
  {
    eyebrow: 'Security and trust',
    title: 'Review controls, bank-side visibility, and finance-ready evidence',
    body:
      'Use this path when security, proof, auditability, and operational trust matter before rollout.',
    href: '/#security',
    cta: 'Review security',
  },
  {
    eyebrow: 'Pricing and rollout',
    title: 'Understand plan structure, buying motion, and implementation fit',
    body:
      'See pricing logic, rollout paths, and when teams move from pilot to deeper operational adoption.',
    href: '/final-landing/pricing',
    cta: 'View pricing',
  },
  {
    eyebrow: 'Talk to the team',
    title: 'Get product access, technical answers, or onboarding support',
    body:
      'Reach Arealis directly for demos, integration questions, enterprise rollout discussions, or support.',
    href: 'mailto:Support@zordnet.com?subject=ZORD%20resources%20and%20support',
    cta: 'Contact Zord',
  },
] as const

const learningPaths = [
  {
    title: 'For operators',
    body:
      'Focus on payout posture, connector performance, queue ownership, and the decision patterns teams use when something starts to drift.',
  },
  {
    title: 'For finance',
    body:
      'Use ZORD resources to understand finality, reconciliation, finance-ready exports, and why the proof layer matters at close.',
  },
  {
    title: 'For engineering',
    body:
      'Start with the system model, then move into docs, contracts, and platform entry points that explain how ZORD fits into live infra.',
  },
] as const

const pageCardStyle = {
  background:
    'linear-gradient(180deg, rgba(22,28,38,0.94) 0%, rgba(11,13,18,0.98) 100%)',
  boxShadow: '0 24px 64px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)',
} as const

export default function ResourcesPageClient() {
  return (
    <FinalLandingPageScaffold
      active="Resources"
      eyebrow="Resources"
      title="Everything teams need to evaluate, learn, and roll out ZORD."
      description="Use the resource layer to understand the operating model, security posture, commercial fit, and the fastest path to working with the Arealis team."
      primaryAction={{ label: 'Talk to the team', href: 'mailto:Support@zordnet.com?subject=ZORD%20resources%20request' }}
      secondaryAction={{ label: 'Back to product', href: '/' }}
      heroVisual={{
        src: '/final-landing/concepts/unified-control-system.png',
        alt: 'Unified control system showing layered operating infrastructure across financial workflows',
        eyebrow: 'Resource map',
        title: 'Move from high-level understanding to rollout confidence without bouncing between scattered documents.',
        body: 'The resources layer should help operators, finance teams, and engineers learn the model quickly, then go deeper into security, pricing, and implementation when they are ready.',
        stats: [
          { value: '3', label: 'buyer paths' },
          { value: '1', label: 'operating model' },
          { value: 'Demo', label: 'support path' },
        ],
        imagePosition: 'right',
        imageClassName: 'object-cover object-center',
      }}
    >
      <section className="mx-auto mt-12 max-w-6xl">
        <div className="grid gap-6 md:grid-cols-2">
          {resourceCards.map((item, index) => (
            <a
              key={item.title}
              href={item.href}
              className="rounded-[1.8rem] border border-white/10 p-8 transition hover:border-white/16 hover:bg-white/[0.03]"
              style={{
                ...pageCardStyle,
                background:
                  index === 0
                    ? 'radial-gradient(circle at 100% 0%, rgba(198,239,207,0.12), transparent 30%), linear-gradient(180deg, rgba(22,28,38,0.94) 0%, rgba(11,13,18,0.98) 100%)'
                    : pageCardStyle.background,
              }}
            >
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{item.eyebrow}</div>
              <h2 className="mt-4 text-2xl font-semibold tracking-tight text-white">{item.title}</h2>
              <p className="mt-4 text-lg leading-relaxed text-slate-400">{item.body}</p>
              <div className="mt-6 inline-flex items-center gap-2 text-[13px] font-semibold text-[#c6efcf]">
                <span>{item.cta}</span>
                <span>↗</span>
              </div>
            </a>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-8 max-w-6xl rounded-[2rem] border border-white/10 p-6 sm:p-8" style={pageCardStyle}>
        <div className="max-w-2xl">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Learning paths</div>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white">Start from the buyer lens your team actually has.</h2>
        </div>

        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {learningPaths.map((path) => (
            <div key={path.title} className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-6">
              <div className="text-xl font-semibold text-white">{path.title}</div>
              <p className="mt-4 text-sm leading-7 text-slate-400">{path.body}</p>
            </div>
          ))}
        </div>
      </section>
    </FinalLandingPageScaffold>
  )
}
