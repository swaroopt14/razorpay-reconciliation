export type PaymentCommandLifecycleState =
  | 'full_lifecycle'
  | 'intent_only'
  | 'settlement_only'
  | 'empty'

export type PaymentCommandDataStateInput = {
  intendedMinor: number | null
  confirmedMinor: number | null
  reviewMinor: number | null
  hasAmbiguitySignal: boolean
  hasPatternsSignal: boolean
}

export type PaymentCommandDataState = {
  lifecycle: PaymentCommandLifecycleState
  heroMessage: string | null
  showLeakageEmphasis: boolean
}

export function derivePaymentCommandDataState(input: PaymentCommandDataStateInput): PaymentCommandDataState {
  const { intendedMinor, confirmedMinor, reviewMinor, hasAmbiguitySignal, hasPatternsSignal } = input
  const intended = intendedMinor ?? 0
  const confirmed = confirmedMinor ?? 0

  if (intended > 0 && confirmed <= 0) {
    return {
      lifecycle: 'intent_only',
      heroMessage:
        'Payment instructions received. Bank/settlement confirmation is pending.',
      showLeakageEmphasis: false,
    }
  }

  if (intended <= 0 && confirmed > 0) {
    return {
      lifecycle: 'settlement_only',
      heroMessage:
        'Settlement data received, but original payment intent data is missing.',
      showLeakageEmphasis: false,
    }
  }

  if (intended > 0 && confirmed > 0) {
    return {
      lifecycle: 'full_lifecycle',
      heroMessage: 'Full payment lifecycle analysis available.',
      showLeakageEmphasis: true,
    }
  }

  let heroMessage: string | null = null
  if (hasPatternsSignal && reviewMinor === 0 && !hasAmbiguitySignal) {
    heroMessage = 'No ambiguous payment matches detected.'
  }

  return {
    lifecycle: 'empty',
    heroMessage,
    showLeakageEmphasis: (reviewMinor ?? 0) > 0,
  }
}
