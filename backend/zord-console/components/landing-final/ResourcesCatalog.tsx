'use client'

import { ResourcesCardsSection } from '@/components/landing-final/ResourcesCardsSection'
import { ResourcesDemoCta } from '@/components/landing-final/ResourcesDemoCta'
import { ResourcesInstitutionalSection } from '@/components/landing-final/ResourcesInstitutionalSection'
import { ResourcesLearningSection } from '@/components/landing-final/ResourcesLearningSection'
import { ResourcesValueSection } from '@/components/landing-final/ResourcesValueSection'

export function ResourcesCatalog() {
  return (
    <div>
      <ResourcesCardsSection />

      <ResourcesLearningSection />

      <ResourcesValueSection />

      <div className="mx-auto max-w-5xl px-5 md:px-8">
        <ResourcesInstitutionalSection />
      </div>

      <div className="mx-auto mt-8 max-w-3xl px-5 md:px-8">
        <ResourcesDemoCta />
      </div>
    </div>
  )
}
