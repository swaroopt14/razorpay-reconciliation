'use client'

import { SolutionsDemoCta } from '@/components/landing-final/SolutionsDemoCta'
import { SolutionsInstitutionalSection } from '@/components/landing-final/SolutionsInstitutionalSection'
import { SolutionsMoatSection } from '@/components/landing-final/SolutionsMoatSection'
import { SolutionsWorkflowMarquee } from '@/components/landing-final/SolutionsWorkflowMarquee'

export function SolutionsCapabilityCatalog() {
  return (
    <div>
      <SolutionsWorkflowMarquee />

      <SolutionsMoatSection />

      <div className="mx-auto mt-16 max-w-3xl px-5 md:px-8">
        <SolutionsInstitutionalSection />

        <SolutionsDemoCta />
      </div>
    </div>
  )
}
