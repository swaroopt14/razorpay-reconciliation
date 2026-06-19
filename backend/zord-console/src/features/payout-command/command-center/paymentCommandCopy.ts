/** Customer-facing copy for Payment Command Center (home). */

export const PAYMENT_COMMAND_CENTER = {
  pageTitle: 'Payment Command Center',
  pageSubtitle:
    'Track payment instructions, bank confirmations, settlement gaps, and proof readiness in one place.',
  sectionTitle: "Today's payment health",
  sectionSubtitle:
    'Current status of payment value, confirmation, and review items across connected systems.',
  intendedHelper:
    'This is the value your system intended to pay. Confirmation depends on bank/settlement data.',
  bankPending:
    'Bank confirmation data is not connected yet. Upload a bank statement or settlement file to verify outcomes.',
  chartTitle: 'Payment Value: Intended vs Bank-Confirmed',
  chartSubtitle:
    'Shows how payment instructions compare with bank/settlement confirmations over time.',
  legendIntended: 'Intended Payment Value',
  legendConfirmed: 'Bank-Confirmed Value',
  legendReview: 'Value Needing Review',
  chipHighValue: 'High value',
  chipConfirmationGap: 'Confirmation gap',
  chipReviewNeeded: 'Review needed',
} as const
