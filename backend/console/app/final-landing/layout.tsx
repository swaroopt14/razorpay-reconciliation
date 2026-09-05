import { redirect } from 'next/navigation'

/** Landing is off for the demo. Remove this redirect to restore /final-landing. */
export default function FinalLandingLayout({ children: _children }: { children: React.ReactNode }) {
  redirect('/signin')
}
