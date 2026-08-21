/** Customer-facing copy for Payment Command Center (home). */

export const PAYMENT_COMMAND_CENTER = {
  pageTitle: 'Payment Command Center',
  pageSubtitle:
    'Track payment instructions, observed settlement outcomes, settlement gaps, and proof readiness in one place.',
  sectionTitle: "Today's payment health",
  sectionSubtitle:
    'Current status of intended value, observed outcomes, match quality, and review items across connected systems.',
  intendedHelper:
    'This is the value your system intended to pay. Observed outcomes are reported separately and are not the same as matched allocation.',
  bankPending:
    'No observed settlement outcomes in this period yet. Upload a settlement file or connect a source to populate observed value.',
  chartTitle: 'Payment Value: Intended vs Observed',
  chartSubtitle:
    'Shows how payment instructions compare with observed settlement outcomes over time. Observed is not matched allocation or bank confirmation.',
  legendIntended: 'Intended Payment Value',
  legendConfirmed: 'Observed Outcome Value',
  legendReview: 'Exposure amount',
  chipHighValue: 'High value',
  chipConfirmationGap: 'Confirmation gap',
  chipReviewNeeded: 'Review needed',
} as const
