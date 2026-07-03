'use client'

import { Activity, Copy, FileText, CheckCircle2, FileCheck } from 'lucide-react'

export function MockupConnectorLeakage() {
  return (
    <div className="relative flex h-full w-full flex-col justify-between overflow-hidden bg-transparent p-6 sm:p-8">
      <div className="relative z-10 mx-auto w-full max-w-[260px] rounded-xl border border-white/20 bg-white/10 p-4 shadow-sm backdrop-blur-xl">
        <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-2">
          <span className="text-[10px] font-semibold text-white/70">CONNECTOR</span>
          <span className="text-[10px] font-semibold text-white/70">HEALTH</span>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-5 w-5 rounded bg-blue-500/20" />
              <span className="text-[11px] font-medium text-white">Razorpay</span>
            </div>
            <span className="h-1.5 w-12 rounded-full bg-emerald-400" />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-5 w-5 rounded bg-amber-500/20" />
              <span className="text-[11px] font-medium text-white">Cashfree</span>
            </div>
            <span className="h-1.5 w-8 animate-pulse rounded-full bg-amber-400" />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-5 w-5 rounded bg-slate-500/20" />
              <span className="text-[11px] font-medium text-white">Stripe</span>
            </div>
            <span className="h-1.5 w-12 rounded-full bg-emerald-400" />
          </div>
        </div>
      </div>
      
      {/* Decorative background circle */}
      <div className="absolute -bottom-10 -right-10 h-40 w-40 rounded-full bg-blue-500/20 blur-[30px]" />
    </div>
  )
}

export function MockupVisibilityRisk() {
  return (
    <div className="relative flex h-full w-full flex-col justify-between overflow-hidden bg-transparent p-6 sm:p-8">
      <div className="relative z-10 mx-auto w-full max-w-[260px]">
        {/* Timeline dots */}
        <div className="absolute bottom-2.5 left-[15px] top-2.5 w-px bg-white/20" />
        
        <div className="space-y-4">
          <div className="relative flex items-center gap-4 rounded-[10px] border border-white/20 bg-white/10 p-3 shadow-sm backdrop-blur-md">
            <div className="absolute left-[-11px] h-2.5 w-2.5 rounded-full border-2 border-[#1A1A1A] bg-emerald-500 shadow-sm" />
            <div className="flex items-center justify-between w-full">
              <span className="text-[11px] font-medium text-white">Settlement batch</span>
              <span className="text-[10px] text-white/60">09:00 AM</span>
            </div>
          </div>
          
          <div className="relative flex items-center gap-4 rounded-[10px] border border-white/20 bg-white/10 p-3 shadow-sm backdrop-blur-md">
            <div className="absolute left-[-11px] h-2.5 w-2.5 rounded-full border-2 border-[#1A1A1A] bg-emerald-500 shadow-sm" />
            <div className="flex items-center justify-between w-full">
              <span className="text-[11px] font-medium text-white">Instruction matched</span>
              <span className="text-[10px] text-white/60">09:02 AM</span>
            </div>
          </div>
          
          <div className="relative flex items-center gap-4 rounded-[10px] border border-amber-500/30 bg-amber-500/10 p-3 shadow-sm backdrop-blur-md">
            <div className="absolute left-[-11px] h-2.5 w-2.5 animate-pulse rounded-full border-2 border-[#1A1A1A] bg-amber-500 shadow-sm" />
            <div className="flex items-center justify-between w-full">
              <span className="text-[11px] font-medium text-amber-200">Finality pending</span>
              <span className="text-[10px] text-amber-200/70">Wait</span>
            </div>
          </div>
        </div>
      </div>
      
      {/* Decorative background circle */}
      <div className="absolute -left-10 -top-10 h-40 w-40 rounded-full bg-emerald-500/20 blur-[30px]" />
    </div>
  )
}

export function MockupEvidenceFinance() {
  return (
    <div className="relative flex h-full w-full flex-col justify-between overflow-hidden bg-transparent p-6 sm:p-8">
      <div className="relative z-10 mx-auto w-full max-w-[260px] space-y-3">
        <div className="flex items-start gap-3 rounded-[12px] border border-white/20 bg-white/10 p-4 shadow-sm backdrop-blur-md">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-500/20 text-purple-300">
            <FileCheck className="h-4 w-4" />
          </div>
          <div className="w-full">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold text-white">Audit Package</p>
              <p className="text-[10px] font-medium text-purple-300">Q3 Ready</p>
            </div>
            <div className="mt-2 space-y-1.5">
              <div className="flex items-center gap-1.5 text-[9px] text-white/60">
                <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                <span>100% intents matched</span>
              </div>
              <div className="flex items-center gap-1.5 text-[9px] text-white/60">
                <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                <span>Zero unexplained gaps</span>
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex items-center justify-between rounded-[10px] border border-white/10 bg-white/5 px-4 py-2.5 backdrop-blur-sm">
          <span className="text-[10px] font-medium text-white/70">Generate CSV export</span>
          <span className="h-4 w-4 rounded-full bg-white/20" />
        </div>
      </div>
      
      {/* Decorative background circle */}
      <div className="absolute -bottom-10 -right-10 h-40 w-40 rounded-full bg-purple-500/20 blur-[30px]" />
    </div>
  )
}
