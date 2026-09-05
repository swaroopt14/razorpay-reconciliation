'use client'

import Image from 'next/image'
import { useCallback, useEffect, useRef, useState } from 'react'

const ROCK_ASSETS = {
  left: {
    bare: {
      src: '/final-landing/hero/left   hand side bare rock .png',
      width: 500,
      height: 500,
    },
    moss: {
      src: '/final-landing/hero/moss_rock_left_hand_side_-removebg-preview.png',
      width: 500,
      height: 500,
    },
    position: 'bottom-[-5%] left-[-5vw] w-[28vw] max-w-[420px] z-[3]',
    maskRadius: 110,
  },
  right: {
    bare: {
      src: '/final-landing/hero/bare_rock_right_side_-removebg-preview.png',
      width: 511,
      height: 488,
    },
    moss: {
      src: '/final-landing/hero/right_hand_side_moss_-removebg-preview.png',
      width: 500,
      height: 500,
    },
    position: 'bottom-[-15%] right-[-8vw] w-[38vw] max-w-[550px] z-[10]',
    maskRadius: 130,
  },
} as const

type MaskPoint = { x: number; y: number }

/** Soft lag so moss trails the cursor instead of snapping. */
const MASK_LERP = 0.065

function buildMossMask(point: MaskPoint, radius: number, active: boolean) {
  if (!active) {
    return 'radial-gradient(circle 0px at 50% 50%, transparent 0%, transparent 100%)'
  }

  return `radial-gradient(circle ${radius}px at ${point.x}px ${point.y}px, #000 0%, #000 28%, rgba(0,0,0,0.55) 52%, transparent 72%)`
}

function InteractiveRock({ side }: { side: keyof typeof ROCK_ASSETS }) {
  const asset = ROCK_ASSETS[side]
  const containerRef = useRef<HTMLDivElement>(null)
  const [maskActive, setMaskActive] = useState(false)
  const targetRef = useRef<MaskPoint>({ x: 0, y: 0 })
  const smoothRef = useRef<MaskPoint>({ x: 0, y: 0 })
  const [maskPoint, setMaskPoint] = useState<MaskPoint>({ x: 0, y: 0 })

  const updateTarget = useCallback((clientX: number, clientY: number) => {
    const container = containerRef.current
    if (!container) return

    const rect = container.getBoundingClientRect()
    targetRef.current = {
      x: clientX - rect.left,
      y: clientY - rect.top,
    }
  }, [])

  useEffect(() => {
    if (!maskActive) return

    let frame = 0
    const tick = () => {
      const target = targetRef.current
      const smooth = smoothRef.current
      smooth.x += (target.x - smooth.x) * MASK_LERP
      smooth.y += (target.y - smooth.y) * MASK_LERP
      setMaskPoint({ x: smooth.x, y: smooth.y })
      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [maskActive])

  const handlePointerEnter = (event: React.PointerEvent<HTMLDivElement>) => {
    updateTarget(event.clientX, event.clientY)
    smoothRef.current = { ...targetRef.current }
    setMaskPoint({ ...targetRef.current })
    setMaskActive(true)
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    updateTarget(event.clientX, event.clientY)
  }

  const handlePointerLeave = () => {
    setMaskActive(false)
  }

  const maskImage = buildMossMask(maskPoint, asset.maskRadius, maskActive)

  return (
    <div
      className={`rock-interactive-wrapper pointer-events-auto absolute hidden cursor-pointer touch-none md:block ${asset.position}`}
      onPointerEnter={handlePointerEnter}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      role="presentation"
      aria-hidden
    >
      <div ref={containerRef} className="rock-container relative w-full">
        <Image
          src={asset.bare.src}
          alt=""
          width={asset.bare.width}
          height={asset.bare.height}
          priority
          className="rock-base h-auto w-full object-contain object-bottom drop-shadow-[15px_10px_30px_rgba(0,0,0,0.08)]"
        />
        <Image
          src={asset.moss.src}
          alt=""
          width={asset.moss.width}
          height={asset.moss.height}
          priority
          className="rock-overlay pointer-events-none absolute inset-0 h-full w-full object-contain object-bottom will-change-[mask-image]"
          style={{
            opacity: maskActive ? 1 : 0,
            WebkitMaskImage: maskImage,
            maskImage,
            WebkitMaskRepeat: 'no-repeat',
            maskRepeat: 'no-repeat',
            transition: 'opacity 900ms ease-in-out',
          }}
        />
      </div>
    </div>
  )
}

export function LandingHeroRocks() {
  return (
    <>
      <InteractiveRock side="left" />
      <InteractiveRock side="right" />
    </>
  )
}
