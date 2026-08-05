import { redirect } from 'next/navigation'

/** Legacy URL — canonical home is `/`. */
export default function FinalLandingRedirectPage() {
  redirect('/')
}
