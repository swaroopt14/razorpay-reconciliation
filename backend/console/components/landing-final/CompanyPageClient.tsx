'use client'

import { FinalLandingPageScaffold } from '@/components/landing-final/FinalLandingPageScaffold'

const milestones = [
  {
    title: 'Google Agentic AI Hackathon 2025',
    detail:
      'Recognized among 53,000+ teams for an AI system built to help real-world decisions at city scale.',
  },
  {
    title: 'IIT Bombay National Showcase',
    detail:
      'Selected as one of India’s standout deep-tech innovations for practical AI in enterprise work.',
  },
  {
    title: 'Wadhwani Foundation Liftoff Program',
    detail:
      'Chosen as a high-potential AI startup building useful tools for day-to-day business operations.',
  },
] as const

const team = [
  {
    name: 'Abhishek J. Shirsath',
    role: 'Founder & CEO',
    summary:
      'Leads the Arealis vision for software that does not just show data - it helps teams act on it with clear reasons.',
  },
  {
    name: 'Sahil Kirad',
    role: 'Fullstack and Backend Developer',
    summary:
      'Builds the product and backend foundations that let ZORD and other Arealis systems run cleanly in production.',
  },
  {
    name: 'Yashwanth Reddy',
    role: 'Cloud DevOps Engineer',
    summary:
      'Designs secure, scalable cloud systems for enterprise AI operations and reliable platform delivery.',
  },
  {
    name: 'Swaroop Thakare',
    role: 'AI & Development Engineer',
    summary:
      'Focuses on system logic, helpful automation, and the product experience across agent-led workflows.',
  },
  {
    name: 'Prathamesh Bhamare',
    role: 'Machine Learning Engineer',
    summary:
      'Builds the models that support decisions across the Arealis platform.',
  },
] as const

const pageCardStyle = {
  background:
    'linear-gradient(180deg, rgba(22,28,38,0.94) 0%, rgba(11,13,18,0.98) 100%)',
  boxShadow: '0 24px 64px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)',
} as const

export default function CompanyPageClient() {
  return (
    <FinalLandingPageScaffold
      active="Company"
      eyebrow="About Arealis"
      title="Building software that helps teams act - with ZORD for payouts."
      description="Arealis builds tools for real enterprise workflows. ZORD sits next to the payment systems you already use, helping teams see, check, match, and prove payouts."
      primaryAction={{ label: 'Contact Zord', href: 'mailto:Support@zordnet.com?subject=Talk%20to%20Zord' }}
      secondaryAction={{ label: 'Back to product', href: '/' }}
      heroVisual={{
        src: '/login/login-hero5.jpg',
        alt: 'Enterprise team collaborating around a digital operations workspace',
        eyebrow: 'Company vision',
        title: 'Arealis builds software that helps teams act inside real workflows.',
        body: 'ZORD is one product in that system: a shared place to see payouts, clear mismatches, and prove what happened - not a replacement for your bank or payment processor.',
        stats: [
          { value: '2', label: 'product tracks' },
          { value: 'Research', label: 'to operations' },
          { value: 'AI-first', label: 'enterprise tools' },
        ],
        imagePosition: 'right',
        imageClassName: 'object-cover object-center',
      }}
    >
      <section className="mx-auto mt-12 max-w-6xl">
        <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-[2rem] border border-white/10 p-8" style={pageCardStyle}>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Our story and vision</div>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white">
              From AI research to tools teams use every day
            </h2>
            <p className="mt-5 text-[16px] leading-8 text-slate-300">
              At Arealis, the long-term vision is software that lives inside real workflows - not only dashboards and reports.
            </p>
            <p className="mt-4 text-[16px] leading-8 text-slate-400">
              The company started as an AI research project and evolved into an enterprise software company. ZORD brings that focus to payouts: a clear view of payments, matching, and proof packs finance and ops can stand behind.
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <div className="rounded-[1.3rem] border border-white/10 bg-white/[0.03] p-5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Products</div>
                <div className="mt-3 text-lg font-semibold text-white">ZORD + Gateway</div>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  ZORD focuses on seeing payouts clearly and proving what happened. Arealis continues building broader enterprise tools around it.
                </p>
              </div>
              <div className="rounded-[1.3rem] border border-white/10 bg-white/[0.03] p-5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Supported by</div>
                <div className="mt-3 text-lg font-semibold text-white">AWS + Microsoft</div>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Arealis is supported through AWS Founders Hub and Microsoft for Startups, backing secure and scalable systems for enterprise teams.
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-6">
            <div className="rounded-[2rem] border border-white/10 p-8" style={pageCardStyle}>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Recognitions & milestones</div>
              <div className="mt-6 space-y-4">
                {milestones.map((item, index) => (
                  <div
                    key={item.title}
                    className="rounded-[1.35rem] border border-white/10 p-5"
                    style={
                      index === 0
                        ? {
                            background:
                              'radial-gradient(circle at 100% 0%, rgba(198,239,207,0.12), transparent 32%), linear-gradient(180deg, rgba(31,35,44,0.98) 0%, rgba(14,17,23,0.98) 100%)',
                          }
                        : { background: 'rgba(255,255,255,0.03)' }
                    }
                  >
                    <div className="text-base font-semibold text-white">{item.title}</div>
                    <p className="mt-2 text-sm leading-7 text-slate-400">{item.detail}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/10 p-8" style={pageCardStyle}>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Founder note</div>
              <p className="mt-4 text-[16px] leading-8 text-slate-300">
                “At Arealis, we’re building software that does not just analyze data - it helps teams act on it. Our goal is systems that learn and adapt while staying clear and secure.”
              </p>
              <div className="mt-5 text-sm font-semibold text-white">Abhishek J. Shirsath, Founder & CEO</div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto mt-8 max-w-6xl pb-8">
        <div className="mb-8 max-w-2xl">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Team</div>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white">People building ZORD and Arealis.</h2>
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {team.map((person) => (
            <div key={person.name} className="rounded-[2rem] border border-white/10 p-8" style={pageCardStyle}>
              <div className="text-lg font-semibold tracking-tight text-white">{person.name}</div>
              <div className="mt-1 text-[13px] font-medium text-[#c6efcf]">{person.role}</div>
              <p className="mt-5 text-[15px] leading-7 text-slate-300">{person.summary}</p>
            </div>
          ))}
        </div>
      </section>
    </FinalLandingPageScaffold>
  )
}
