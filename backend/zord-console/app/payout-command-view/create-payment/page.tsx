import type { Metadata } from 'next'
import { CreatePaymentRequestForm } from '@/features/payout-command/create-payment/CreatePaymentRequestForm'

export const metadata: Metadata = {
  title: 'Create Payment Request | Zord',
  description: 'Create a single payment intent manually via the live payout command view.',
}

export default function CreatePaymentPage() {
  return <CreatePaymentRequestForm />
}
