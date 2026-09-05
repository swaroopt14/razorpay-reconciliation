'use client'

import { motion, useMotionValue, useSpring } from 'motion/react'
import { useRef, useState, type ReactNode, type MouseEvent } from 'react'

const springValues = {
  damping: 30,
  stiffness: 100,
  mass: 2,
} as const

type TiltedCardProps = {
  children?: ReactNode
  imageSrc?: string
  altText?: string
  captionText?: string
  containerHeight?: string
  containerWidth?: string
  imageHeight?: string
  imageWidth?: string
  scaleOnHover?: number
  rotateAmplitude?: number
  showMobileWarning?: boolean
  showTooltip?: boolean
  overlayContent?: ReactNode
  displayOverlayContent?: boolean
  enabled?: boolean
  className?: string
}

export default function TiltedCard({
  children,
  imageSrc,
  altText = 'Tilted card image',
  captionText = '',
  containerHeight = '300px',
  containerWidth = '100%',
  imageHeight = '300px',
  imageWidth = '300px',
  scaleOnHover = 1.06,
  rotateAmplitude = 12,
  showMobileWarning = false,
  showTooltip = false,
  overlayContent = null,
  displayOverlayContent = false,
  enabled = true,
  className = '',
}: TiltedCardProps) {
  const ref = useRef<HTMLElement>(null)
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const rotateX = useSpring(useMotionValue(0), springValues)
  const rotateY = useSpring(useMotionValue(0), springValues)
  const scale = useSpring(1, springValues)
  const opacity = useSpring(0)
  const rotateFigcaption = useSpring(0, { stiffness: 350, damping: 30, mass: 1 })
  const [lastY, setLastY] = useState(0)

  const handleMouse = (e: MouseEvent<HTMLElement>) => {
    if (!enabled || !ref.current) return

    const rect = ref.current.getBoundingClientRect()
    const offsetX = e.clientX - rect.left - rect.width / 2
    const offsetY = e.clientY - rect.top - rect.height / 2
    const rotationX = (offsetY / (rect.height / 2)) * -rotateAmplitude
    const rotationY = (offsetX / (rect.width / 2)) * rotateAmplitude

    rotateX.set(rotationX)
    rotateY.set(rotationY)
    x.set(e.clientX - rect.left)
    y.set(e.clientY - rect.top)

    const velocityY = offsetY - lastY
    rotateFigcaption.set(-velocityY * 0.6)
    setLastY(offsetY)
  }

  const handleMouseEnter = () => {
    if (!enabled) return
    scale.set(scaleOnHover)
    opacity.set(1)
  }

  const handleMouseLeave = () => {
    opacity.set(0)
    scale.set(1)
    rotateX.set(0)
    rotateY.set(0)
    rotateFigcaption.set(0)
    setLastY(0)
  }

  return (
    <motion.figure
      ref={ref}
      className={`relative flex flex-col items-center justify-center bg-transparent [perspective:800px] ${className}`}
      style={{ width: containerWidth, height: containerHeight }}
      onMouseMove={handleMouse}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {showMobileWarning ? (
        <div className="absolute top-4 hidden text-center text-sm sm:block">
          This effect is not optimized for mobile. Check on desktop.
        </div>
      ) : null}

      <motion.div
        className="relative [transform-style:preserve-3d]"
        style={{
          width: children ? '100%' : imageWidth,
          height: children ? 'auto' : imageHeight,
          rotateX,
          rotateY,
          scale,
        }}
      >
        {children ? (
          children
        ) : imageSrc ? (
          <motion.img
            src={imageSrc}
            alt={altText}
            className="absolute left-0 top-0 rounded-[15px] object-cover will-change-transform [transform:translateZ(0)]"
            style={{ width: imageWidth, height: imageHeight }}
          />
        ) : null}

        {displayOverlayContent && overlayContent ? (
          <motion.div className="absolute left-0 top-0 z-[2] will-change-transform [transform:translateZ(30px)]">
            {overlayContent}
          </motion.div>
        ) : null}
      </motion.div>

      {showTooltip && captionText ? (
        <motion.figcaption
          className="pointer-events-none absolute left-0 top-0 z-[3] rounded bg-white px-2.5 py-1 text-[10px] text-[#2d2d2d] opacity-0"
          style={{ x, y, opacity, rotate: rotateFigcaption }}
        >
          {captionText}
        </motion.figcaption>
      ) : null}
    </motion.figure>
  )
}
