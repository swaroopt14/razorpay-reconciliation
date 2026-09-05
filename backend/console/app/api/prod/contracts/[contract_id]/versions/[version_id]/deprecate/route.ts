import { NextRequest, NextResponse } from 'next/server'
import { ChangeEntry } from '@/types/contract'

export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ contract_id: string; version_id: string }> }
) {
  const { version_id } = await params

  try {
    const body = await request.json()
    const { reason } = body
    const now = new Date().toISOString()

    // In production:
    // 1. Check if there are intents still using this version
    // 2. Warn if usedByCount > 0
    // 3. Mark version as deprecated

    const deprecateEntry: ChangeEntry = {
      id: `ch_${Date.now()}`,
      timestamp: now,
      author: 'current_user',
      action: 'deprecated',
      description: reason || 'Deprecated version',
    }

    return NextResponse.json({
      success: true,
      versionId: version_id,
      deprecatedAt: now,
      deprecatedBy: 'current_user',
      status: 'deprecated',
      changelog: [deprecateEntry],
    })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to deprecate version' }, { status: 500 })
  }
}
