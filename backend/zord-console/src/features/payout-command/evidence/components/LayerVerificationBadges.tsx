'use client'

import type { LayeredVerificationView } from '../mappers/mapLayeredVerification'
import { exportPolicyLabel } from '../mappers/mapLayeredVerification'

export function LayerVerificationBadges({ view }: { view: LayeredVerificationView }) {
  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap gap-2" data-testid="layered-verification-badges">
        {view.layers.map((layer) => (
          <span
            key={layer.key}
            data-testid={`layer-badge-${layer.key}`}
            data-status={layer.status}
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              layer.status === 'PASS'
                ? 'bg-neutral-900 text-white'
                : layer.status === 'FAIL'
                  ? 'bg-red-100 text-red-900'
                  : 'bg-slate-100 text-slate-700'
            }`}
          >
            {layer.label}: {layer.status}
          </span>
        ))}
      </div>
      <p data-testid="export-policy" className="text-[12px] font-medium text-slate-600">
        {exportPolicyLabel(view)}
      </p>
    </div>
  )
}
