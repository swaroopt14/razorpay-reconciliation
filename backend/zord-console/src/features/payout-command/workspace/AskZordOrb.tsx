'use client'

const ORB_VIDEO_SRC = '/gif%20compents/orb%20ask%20page%20.mp4'

type AskZordOrbProps = {
  /** Siri-style hologram intensifies while Ask Zord is thinking. */
  active?: boolean
  size?: 'md' | 'lg'
  className?: string
}

/**
  * Ask Zord hologram orb - Razorpay azure (#0066FF).
  * Footage is color-remapped so magenta/violet never reads as product purple.
  */
export function AskZordOrb({ active = false, size = 'lg', className = '' }: AskZordOrbProps) {
  const dim = size === 'lg' ? 'h-40 w-40 sm:h-48 sm:w-48' : 'h-24 w-24'
  const videoDim = size === 'lg' ? 'h-[7.5rem] w-[7.5rem] sm:h-36 sm:w-36' : 'h-20 w-20'

  return (
    <div
      className={`relative mx-auto flex items-center justify-center ${dim} ${className}`}
      data-testid="ask-zord-orb"
      data-active={active ? '1' : '0'}
      aria-hidden
    >
      <div
        className={`ask-zord-orb-blur ask-zord-orb-blur--cool pointer-events-none absolute inset-[-18%] rounded-full ${
          active ? 'ask-zord-orb-blur--active' : ''
        }`}
      />
      <div
        className={`ask-zord-orb-blur ask-zord-orb-blur--azure pointer-events-none absolute inset-[-6%] rounded-full ${
          active ? 'ask-zord-orb-blur--active' : ''
        }`}
      />
      <div
        className={`ask-zord-orb-ring pointer-events-none absolute inset-2 rounded-full ${
          active ? 'ask-zord-orb-ring--active' : ''
        }`}
      />

      <div
        className={`relative z-[1] overflow-hidden rounded-full bg-[#0066FF] ${videoDim} ${
          active ? 'ask-zord-orb-video--active' : 'ask-zord-orb-video'
        }`}
      >
        <video
          autoPlay
          loop
          muted
          playsInline
          className="ask-zord-orb-core absolute inset-0 h-full w-full rounded-full object-cover"
        >
          <source src={ORB_VIDEO_SRC} type="video/mp4" />
        </video>
        {/* Force hue to Razorpay azure - keeps motion, kills purple */}
        <div
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{ backgroundColor: '#0066FF', mixBlendMode: 'color' }}
        />
        <div className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-br from-sky-200/35 via-transparent to-[#0052CC]/30" />
      </div>
    </div>
  )
}
