import { NextRequest, NextResponse } from 'next/server'
import { StreamIngestionData } from '@/types/ingress'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  await new Promise(resolve => setTimeout(resolve, 80))

  const mockData: StreamIngestionData = {
    health: {
      status: 'HEALTHY',
      processing_rate: 99.1,
      messages_per_hour: 892,
      latency: { p50_ms: 89, p95_ms: 214, p99_ms: 892 },
    },
    consumer_lag: [
      { consumer_group: 'zord-intents', lag_messages: 892, lag_time: '2m 14s' },
      { consumer_group: 'zord-contracts', lag_messages: 214, lag_time: '47s' },
      { consumer_group: 'zord-audit', lag_messages: 67, lag_time: '12s' },
    ],
    max_lag: '2m 14s',
    topics: [
      { topic_name: 'intents-raw', volume_percent: 67, messages_per_hour: 598, avg_latency_ms: 89 },
      { topic_name: 'contracts-raw', volume_percent: 23, messages_per_hour: 205, avg_latency_ms: 124 },
      { topic_name: 'audit-events', volume_percent: 10, messages_per_hour: 89, avg_latency_ms: 45 },
    ],
  }

  return NextResponse.json(mockData)
}
