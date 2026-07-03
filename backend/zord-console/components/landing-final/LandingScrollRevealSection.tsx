'use client'

import { LandingReveal, LandingSection } from '@/components/landing-final/landingSectionLayout'

export function LandingScrollRevealSection() {
  return (
    <LandingSection
      id="product"
      className="relative z-10 overflow-visible py-16 pb-24 sm:py-20 sm:pb-28 lg:py-24 lg:pb-32 bg-[#FAFAFA]"
      aria-label="Product capabilities preview"
    >
      <div className="mx-auto max-w-5xl space-y-24">
        
        {/* Trade in Real Time */}
        <LandingReveal className="flex flex-col md:flex-row items-center gap-12 lg:gap-20">
          <div className="w-full md:w-1/2">
            <div className="relative w-full aspect-[4/3] rounded-[2rem] bg-[#111111] p-6 shadow-xl flex items-center justify-center overflow-hidden">
              <div className="absolute top-4 left-4 flex gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <div className="w-3 h-3 rounded-full bg-amber-500" />
                <div className="w-3 h-3 rounded-full bg-emerald-500" />
              </div>
              <div className="absolute right-[-10%] top-[-10%] w-48 h-48 bg-[#DBF33C] rounded-3xl rotate-12 opacity-80" />
              {/* Abstract Chart Line */}
              <svg viewBox="0 0 400 200" fill="none" stroke="#DBF33C" strokeWidth="4" className="w-full h-auto drop-shadow-[0_0_12px_rgba(219,243,60,0.8)] relative z-10">
                <path d="M0,150 Q40,180 80,120 T160,100 T240,140 T320,80 T400,40" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
          <div className="w-full md:w-1/2">
            <h2 className="text-3xl font-bold leading-[1.15] tracking-tight text-[#111111] sm:text-4xl md:text-[2.5rem]">
              Trade in Real Time
            </h2>
            <p className="mt-6 text-[15px] font-medium leading-relaxed text-[#111111]/70 max-w-md">
              No more waiting. Your portfolio updates immediately. The price on your screen is updated every second and Zord tracks it with the most reliable data sources.
            </p>
          </div>
        </LandingReveal>

        {/* 100,000+ Stonks in Your App */}
        <LandingReveal className="flex flex-col md:flex-row-reverse items-center gap-12 lg:gap-20">
          <div className="w-full md:w-1/2 relative">
            <div className="absolute right-0 bottom-[-10%] w-64 h-64 bg-[#DBF33C] rounded-full opacity-80" />
            
            <div className="relative z-10 flex flex-col gap-4 items-center">
              {/* Floating App Card 1 */}
              <div className="w-[85%] rounded-[1.5rem] bg-white p-4 shadow-[0_20px_40px_rgba(0,0,0,0.08)] border border-black/5 flex items-center justify-between">
                 <div className="flex items-center gap-3">
                   <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                     <span className="font-bold text-lg">AAPL</span>
                   </div>
                   <span className="font-bold text-lg">Apple Inc.</span>
                 </div>
                 <span className="font-bold text-lg text-emerald-500">+1.24%</span>
              </div>
              
              {/* Floating App Card 2 */}
              <div className="w-[95%] translate-x-[-5%] rounded-[1.5rem] bg-white p-4 shadow-[0_20px_40px_rgba(0,0,0,0.08)] border border-black/5 flex items-center justify-between">
                 <div className="flex items-center gap-3">
                   <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                     <span className="font-bold text-lg">TSLA</span>
                   </div>
                   <span className="font-bold text-lg">Tesla</span>
                 </div>
                 <span className="font-bold text-lg text-red-500">-0.42%</span>
              </div>
              
              {/* Floating App Card 3 */}
              <div className="w-[85%] rounded-[1.5rem] bg-white p-4 shadow-[0_20px_40px_rgba(0,0,0,0.08)] border border-black/5 flex items-center justify-between">
                 <div className="flex items-center gap-3">
                   <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                     <span className="font-bold text-lg">MSFT</span>
                   </div>
                   <span className="font-bold text-lg">Microsoft</span>
                 </div>
                 <span className="font-bold text-lg text-emerald-500">+0.89%</span>
              </div>
            </div>
          </div>
          <div className="w-full md:w-1/2">
            <h2 className="text-3xl font-bold leading-[1.15] tracking-tight text-[#111111] sm:text-4xl md:text-[2.5rem]">
              100,000+<br />Markets in Your App
            </h2>
            <p className="mt-6 text-[15px] font-medium leading-relaxed text-[#111111]/70 max-w-md">
              Trade through Zord and gain access to thousands of financial markets from around the world. Take advantage of our newest tools to ensure you&apos;ll find the asset that&apos;s right for your investment strategy.
            </p>
          </div>
        </LandingReveal>

      </div>
    </LandingSection>
  )
}
