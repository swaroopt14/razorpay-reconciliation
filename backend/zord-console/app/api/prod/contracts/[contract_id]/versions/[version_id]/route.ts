import { NextRequest, NextResponse } from 'next/server'
import { SchemaVersion, ChangeEntry } from '@/types/contract'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ contract_id: string; version_id: string }> }
) {
  const { contract_id, version_id } = await params

  // In production, fetch from database
  // For now, return mock data
  return NextResponse.json({
    id: version_id,
    contractId: contract_id,
    versionNumber: 1,
    versionLabel: 'v1',
    status: 'draft',
    fields: [],
    invariants: [],
    createdAt: new Date().toISOString(),
    createdBy: 'current_user',
    changelog: [],
  })
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ contract_id: string; version_id: string }> }
) {
  const { version_id } = await params

  try {
    const body = await request.json()
    const now = new Date().toISOString()

    // Add changelog entry
    const changeEntry: ChangeEntry = {
      id: `ch_${Date.now()}`,
      timestamp: now,
      author: 'current_user',
      action: 'modified',
      description: body.changeDescription || 'Updated version',
    }

    const updatedVersion: SchemaVersion = {
      ...body,
      id: version_id,
      lastModified: now,
      modifiedBy: 'current_user',
      changelog: [...(body.changelog || []), changeEntry],
    }

    return NextResponse.json(updatedVersion)
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update version' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ contract_id: string; version_id: string }> }
) {
  const { version_id } = await params

  // In production, check if version is in use before deleting
  return NextResponse.json({ success: true, deleted: version_id })
}
