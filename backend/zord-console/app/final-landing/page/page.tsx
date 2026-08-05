import { redirect } from 'next/navigation'

/** Legacy nested URL — canonical home is `/`. */
export default function FinalLandingNestedRedirectPage() {
  redirect('/')
}
