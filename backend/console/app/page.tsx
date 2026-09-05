import { redirect } from 'next/navigation'

// Landing is off for the demo. Uncomment to restore the marketing home.
// import LandingPageFinalClient from '@/components/landing-final/LandingPageFinalClient'
// export default function HomePage() {
//   return <LandingPageFinalClient />
// }

export default function HomePage() {
  redirect('/signin')
}
