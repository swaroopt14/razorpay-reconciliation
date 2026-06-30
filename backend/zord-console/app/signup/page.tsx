import { DemoLeadFlow } from '@/components/auth/DemoLeadFlow'

/**
 * /signup is the customer "Book a demo" lead-capture flow — NOT account creation.
 * Prospects share their payment use case + company details; the sales team follows
 * up and provisions access. Actual tenant creation lives at /register.
 */
export default function SignUpPage() {
  return <DemoLeadFlow />
}
