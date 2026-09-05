/** Everyday language for the Resources hub. */

export const resourceCards = [
  {
    eyebrow: 'Product walkthrough',
    title: 'See how Zord follows a payout from instruction to proof',
    body: 'Start here if your team needs the fastest explanation of how Zord works day to day.',
    href: '/final-landing/how-it-works',
    cta: 'Open how it works',
  },
  {
    eyebrow: 'Trust and proof',
    title: 'See how proof packs support finance and audit questions',
    body: 'Use this path when trust in the numbers, and proof you can show others, matter before you go live.',
    href: '/#security',
    cta: 'Review trust',
  },
  {
    eyebrow: 'Pricing and getting started',
    title: 'Understand how teams try, demo, and buy Zord',
    body: 'See how to try first, book a demo, and when teams move to production pricing.',
    href: '/final-landing/pricing',
    cta: 'View pricing',
  },
  {
    eyebrow: 'Talk to the team',
    title: 'Get a demo, onboarding help, or product answers',
    body: 'Reach Arealis for demos, go-live discussions, or support.',
    href: 'mailto:Support@zordnet.com?subject=ZORD%20resources%20and%20support',
    cta: 'Contact Zord',
  },
] as const

export const learningPaths = [
  {
    title: 'For operators',
    body: 'Focus on payout health, batch progress, payment gaps, and the review list when something is unclear.',
  },
  {
    title: 'For finance',
    body: 'Focus on money meant to pay vs bank-confirmed amounts, gaps to close, and proof packs ready for close and audit.',
  },
  {
    title: 'For engineering',
    body: 'Focus on how Zord sits next to your existing payment systems and why teams share one payout record.',
  },
] as const

export const resourceHighlights = [
  'One shared explanation for ops, finance, and engineering - not scattered docs.',
  'Clear paths for trust, pricing, and going live when teams are ready to go deeper.',
  'Direct access to Arealis for demos and go-live conversations.',
] as const
