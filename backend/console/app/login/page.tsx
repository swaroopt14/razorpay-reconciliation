import { redirect } from 'next/navigation'
import YcDemoLoginClient from './YcDemoLoginClient'

export default function LoginPage() {
  if (process.env.ZORD_DEMO_LOGIN_ENABLED !== '1') {
    redirect('/signin')
  }
  return <YcDemoLoginClient />
}
