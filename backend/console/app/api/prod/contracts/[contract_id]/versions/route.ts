import { NextRequest, NextResponse } from 'next/server'
import { SchemaVersion } from '@/types/contract'

export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ contract_id: string }> }
) {
  const { contract_id } = await params

  try {
    const body = await request.json()
    const { cloneFromVersionId, versionNumber } = body

    const now = new Date().toISOString()
    const versionId = `ver_${contract_id}_v${versionNumber}`

    const newVersion: SchemaVersion = {
      id: versionId,
      contractId: contract_id,
      versionNumber,
      versionLabel: `v${versionNumber}`,
      status: 'draft',
      fields: body.fields || [],
      invariants: body.invariants || [],
      createdAt: now,
      createdBy: 'current_user',
      changelog: [
        {
          id: `ch_${Date.now()}`,
          timestamp: now,
          author: 'current_user',
          action: 'created',
          description: cloneFromVersionId 
            ? `Cloned from version ${cloneFromVersionId}` 
            : 'Created new version',
        },
      ],
    }

    return NextResponse.json(newVersion, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create version' }, { status: 500 })
  }
}
