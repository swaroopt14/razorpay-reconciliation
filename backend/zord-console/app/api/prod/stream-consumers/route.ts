import { NextRequest, NextResponse } from 'next/server'
import { StreamConsumerListResponse, StreamConsumer, StreamName, ConsumerStatus } from '@/types/stream-consumer'

// Force dynamic rendering for API routes
export const dynamic = 'force-dynamic'

// Mock data generator
function generateMockConsumers(): StreamConsumer[] {
  const streams: StreamName[] = ['zord.intent.ingress', 'zord.webhook.ingress', 'zord.batch.ingress']
  const statuses: ConsumerStatus[] = ['RUNNING', 'DEGRADED', 'STALLED']
  const consumerGroups = [
    'zord-intent-consumer-v3',
    'zord-webhook-consumer-v2',
    'zord-batch-consumer-v1',
    'zord-intent-consumer-v2',
    'zord-webhook-consumer-v1',
  ]

  const consumers: StreamConsumer[] = []
  const now = new Date()

  consumerGroups.forEach((group, idx) => {
    const stream = streams[idx % streams.length]
    const status = statuses[Math.floor(Math.random() * statuses.length)]
    const lag = status === 'STALLED'
      ? Math.floor(Math.random() * 50000) + 10000
      : status === 'DEGRADED'
        ? Math.floor(Math.random() * 5000) + 1000
        : Math.floor(Math.random() * 500)

    const lastCommit = new Date(now.getTime() - (status === 'STALLED' ? 600000 : Math.random() * 300000))

    consumers.push({
      consumer_group: group,
      stream,
      partitions: [12, 8, 16, 6, 10][idx % 5],
      lag_events: lag,
      ingest_rate: status === 'STALLED' ? 0 : Math.floor(Math.random() * 1000) + 100,
      status,
      last_commit: lastCommit.toISOString(),
    })
  })

  return consumers
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const page = parseInt(searchParams.get('page') || '1', 10)
    const pageSize = parseInt(searchParams.get('page_size') || '50', 10)

    // Server-side filters
    const stream = searchParams.get('stream') as StreamName | null
    const consumerGroup = searchParams.get('consumer_group')
    const status = searchParams.get('status') as ConsumerStatus | null
    const partition = searchParams.get('partition')

    let allConsumers = generateMockConsumers()

    // Apply server-side filtering
    let filteredConsumers = allConsumers.filter((consumer) => {
      if (stream && consumer.stream !== stream) {
        return false
      }

      if (consumerGroup && !consumer.consumer_group.toLowerCase().includes(consumerGroup.toLowerCase())) {
        return false
      }

      if (status && consumer.status !== status) {
        return false
      }

      // Partition filter would need partition detail, skip for now
      if (partition) {
        // Would need to check partition detail
      }

      return true
    })

    // Calculate pagination on filtered results
    const total = filteredConsumers.length
    const startIndex = (page - 1) * pageSize
    const endIndex = startIndex + pageSize
    const items = filteredConsumers.slice(startIndex, endIndex)

    const response: StreamConsumerListResponse = {
      items,
      pagination: {
        page,
        page_size: pageSize,
        total,
      },
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Error fetching stream consumers:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
