'use client'

import { HOME_TITLE_BLACK } from '../command-center/homeCommandCenterTokens'
import { ZORD_SURFACE_CLASS, ZORD_SURFACE_MUTED } from '../command-center/homeSurfaceFonts'

type DeferredCapabilitySurfaceProps = {
  title: string
  capability: string
}

/** Live V1 placeholder — no mock/sandbox data. */
export function DeferredCapabilitySurface({ title, capability }: DeferredCapabilitySurfaceProps) {
  return (
    <div className={ZORD_SURFACE_CLASS}>
      <h1 className={HOME_TITLE_BLACK}>{title}</h1>
      <p className={`mt-3 max-w-2xl ${ZORD_SURFACE_MUTED}`}>
        {capability} is not part of live V1. This screen is deferred so the live console never
        presents mock borrower, monitoring, or connector data as production truth.
      </p>
    </div>
  )
}
