'use client'

import { PricingDemoCta } from '@/components/landing-final/PricingDemoCta'
import { PricingFaqSection } from '@/components/landing-final/PricingFaqSection'
import { PricingInstitutionalSection } from '@/components/landing-final/PricingInstitutionalSection'
import { PricingPlansSection } from '@/components/landing-final/PricingPlansSection'
import { PricingValueSection } from '@/components/landing-final/PricingValueSection'

export function PricingCatalog() {
  return (
    <div>
      <PricingPlansSection />

      <PricingValueSection />

      <div className="mx-auto max-w-5xl px-5 md:px-8">
        <PricingInstitutionalSection />
      </div>

      <div className="mx-auto mt-8 max-w-3xl px-5 md:px-8">
        <PricingFaqSection />

        <PricingDemoCta />
      </div>
    </div>
  )
}
