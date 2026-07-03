'use client'

import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'framer-motion'

import {
  createMagneticMossEngine,
  type MagneticMossConfig,
  type MagneticMossEngine,
  type MossMode,
} from './magnetic-moss/engine'

export type LandingMagneticMossProps = MagneticMossConfig & {
  className?: string
  aspectRatio: string
  interactionEnabled?: boolean
}

function resolveMode(reduced: boolean): MossMode {
  if (reduced) return 'reduced'
  if (typeof window === 'undefined') return 'desktop'
  const vw = window.innerWidth
  if (vw < 768) return 'mobile'
  if (vw < 1024) return 'tablet'
  return 'desktop'
}

export function LandingMagneticMoss({
  className = '',
  aspectRatio,
  drySrc,
  mossSrc,
  radiusDesktop,
  radiusTablet,
  distortPx,
  anchorBottom,
  interactionEnabled = true,
}: LandingMagneticMossProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particleRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<MagneticMossEngine | null>(null)
  const rafRef = useRef<number>(0)
  const lastTimeRef = useRef<number>(0)
  const [ready, setReady] = useState(false)
  const shouldReduceMotion = useReducedMotion()
  const interactionEnabledRef = useRef(interactionEnabled)
  interactionEnabledRef.current = interactionEnabled

  useEffect(() => {
    const canvas = canvasRef.current
    const particleCanvas = particleRef.current
    const wrap = wrapRef.current
    if (!canvas || !particleCanvas || !wrap) return

    let cancelled = false
    let engine: MagneticMossEngine | null = null
    let ro: ResizeObserver | null = null
    let onPointerMove: ((e: PointerEvent) => void) | null = null
    let onPointerLeave: (() => void) | null = null
    let onResize: (() => void) | null = null

    const config: MagneticMossConfig = {
      drySrc,
      mossSrc,
      radiusDesktop,
      radiusTablet,
      distortPx,
      anchorBottom,
    }

    const start = async () => {
      try {
        engine = await createMagneticMossEngine(canvas, config)
        if (cancelled) {
          engine.destroy()
          return
        }
        engineRef.current = engine

        onResize = () => {
          const rect = wrap.getBoundingClientRect()
          if (rect.width < 2 || rect.height < 2) return
          const dpr = Math.min(window.devicePixelRatio || 1, 2)
          engine?.resize(rect.width, rect.height, dpr)
          particleCanvas.width = Math.floor(rect.width * dpr)
          particleCanvas.height = Math.floor(rect.height * dpr)
          particleCanvas.style.width = `${rect.width}px`
          particleCanvas.style.height = `${rect.height}px`
          engine?.setMode(resolveMode(Boolean(shouldReduceMotion)))
        }

        onResize()
        setReady(true)

        ro = new ResizeObserver(onResize)
        ro.observe(wrap)
        window.addEventListener('resize', onResize)

        onPointerMove = (e: PointerEvent) => {
          if (!interactionEnabledRef.current) return
          const rect = canvas.getBoundingClientRect()
          const dpr = canvas.width / rect.width
          const x = (e.clientX - rect.left) * dpr
          const y = (e.clientY - rect.top) * dpr
          engine?.setPointer(x, y, true)
        }

        onPointerLeave = () => {
          engine?.setPointer(0, 0, false)
        }

        canvas.addEventListener('pointermove', onPointerMove)
        canvas.addEventListener('pointerenter', onPointerMove)
        canvas.addEventListener('pointerleave', onPointerLeave)

        const loop = (now: number) => {
          if (!engine || cancelled) return
          engine.setInteractionEnabled(interactionEnabledRef.current)
          const last = lastTimeRef.current || now
          const dt = (now - last) / 1000
          lastTimeRef.current = now
          engine.tick(dt)
          engine.draw()
          const pctx = particleCanvas.getContext('2d')
          if (pctx) {
            engine.drawParticles(pctx, particleCanvas.width, particleCanvas.height)
          }
          rafRef.current = requestAnimationFrame(loop)
        }
        rafRef.current = requestAnimationFrame(loop)
      } catch (error) {
        console.error('[LandingMagneticMoss] engine failed:', error)
        setReady(false)
      }
    }

    void start()

    return () => {
      cancelled = true
      cancelAnimationFrame(rafRef.current)
      ro?.disconnect()
      if (onResize) window.removeEventListener('resize', onResize)
      if (onPointerMove) {
        canvas.removeEventListener('pointermove', onPointerMove)
        canvas.removeEventListener('pointerenter', onPointerMove)
      }
      if (onPointerLeave) canvas.removeEventListener('pointerleave', onPointerLeave)
      engine?.destroy()
      engineRef.current = null
    }
  }, [anchorBottom, distortPx, drySrc, mossSrc, radiusDesktop, radiusTablet, shouldReduceMotion])

  const encodedDrySrc =
    drySrc.lastIndexOf('/') >= 0
      ? `${drySrc.slice(0, drySrc.lastIndexOf('/') + 1)}${encodeURIComponent(drySrc.slice(drySrc.lastIndexOf('/') + 1))}`
      : encodeURIComponent(drySrc)

  return (
    <div
      ref={wrapRef}
      className={`relative w-full select-none ${className}`}
      style={{ aspectRatio }}
      aria-hidden
    >
      {!ready ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={encodedDrySrc}
          alt=""
          className="absolute inset-0 h-full w-full object-contain object-bottom pointer-events-none"
        />
      ) : null}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ opacity: ready ? 1 : 0, transition: 'opacity 600ms ease' }}
      />
      <canvas
        ref={particleRef}
        className="pointer-events-none absolute inset-0 h-full w-full"
        aria-hidden
      />
    </div>
  )
}
