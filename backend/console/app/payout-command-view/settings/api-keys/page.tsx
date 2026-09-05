import { redirect } from 'next/navigation'

/** Credentials live on Spec 7.17 Developer - not Settings. */
export default function ApiKeysPage() {
  redirect('/developer?demo=sandbox&tab=keys')
}
