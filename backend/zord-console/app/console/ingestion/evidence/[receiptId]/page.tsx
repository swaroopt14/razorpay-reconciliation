'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { isAuthenticated, getCurrentUser } from '@/services/auth'
import { getEvidenceTree, getEvidenceFile } from '@/services/api'
import { EvidenceTree, EvidenceFile } from '@/types/evidence'
import { EvidenceTree as EvidenceTreeComponent, EvidenceFileViewer } from '@/components/ingestion'
import { TopBar } from '@/components/aws'
import { canViewEvidence } from '@/utils/permissions'

export default function EvidencePage() {
  const router = useRouter()
  const params = useParams()
  const receiptId = params.receiptId as string
  const [evidenceTree, setEvidenceTree] = useState<EvidenceTree | null>(null)
  const [selectedFile, setSelectedFile] = useState<EvidenceFile | null>(null)
  const [selectedPath, setSelectedPath] = useState<string | undefined>()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/console/login')
      return
    }

    const user = getCurrentUser()
    if (user && !canViewEvidence(user.role)) {
      router.push('/console/ingestion')
      return
    }

    loadEvidence()
  }, [receiptId, router])

  const loadEvidence = async () => {
    try {
      const tree = await getEvidenceTree(receiptId)
      setEvidenceTree(tree)
    } catch (error) {
      console.error('Failed to load evidence:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleFileSelect = async (path: string) => {
    setSelectedPath(path)
    try {
      const file = await getEvidenceFile(receiptId, path)
      setSelectedFile(file)
    } catch (error) {
      console.error('Failed to load file:', error)
      setSelectedFile(null)
    }
  }

  if (loading || !evidenceTree) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    )
  }

  const user = getCurrentUser()

  return (
    <div className="min-h-screen bg-gray-50">
      <TopBar 
        tenant={user?.tenant} 
        serviceName="Ingestion"
        breadcrumbs={['Receipt', 'Evidence']}
      />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <Link
            href={`/console/ingestion/receipt/${receiptId}`}
            className="text-blue-600 hover:text-blue-800 text-sm"
          >
            ← Back to Receipt
          </Link>
        </div>

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">
            Evidence - Receipt {receiptId}
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Navigate the evidence tree to view immutable artifacts
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" style={{ height: 'calc(100vh - 300px)' }}>
          <div className="h-full">
            <EvidenceTreeComponent
              tree={evidenceTree.root}
              onFileSelect={handleFileSelect}
              selectedPath={selectedPath}
            />
          </div>
          <div className="h-full">
            <EvidenceFileViewer file={selectedFile} />
          </div>
        </div>
      </div>
    </div>
  )
}
