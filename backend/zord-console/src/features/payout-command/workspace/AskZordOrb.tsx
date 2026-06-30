'use client'

const ORB_VIDEO_SRC = '/gif%20compents/orb%20ask%20page%20.mp4'

export function AskZordOrb() {
  return (
    <div className="mx-auto flex h-32 w-32 items-center justify-center" data-testid="ask-zord-orb">
      <div className="relative flex h-32 w-32 items-center justify-center">
        <div
          className="pointer-events-none absolute inset-0 rounded-full bg-violet-400/20 blur-2xl"
          aria-hidden
        />
        <video
          autoPlay
          loop
          muted
          playsInline
          className="relative h-28 w-28 rounded-full object-cover shadow-[0_8px_32px_rgba(124,58,237,0.25)] ring-1 ring-violet-100"
          aria-hidden
        >
          <source src={ORB_VIDEO_SRC} type="video/mp4" />
        </video>
      </div>
    </div>
  )
}
