import { NextRequest, NextResponse } from 'next/server'
import { ConsumerGroupDetail, StreamName, ConsumerStatus } from '@/types/stream-consumer'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ consumer_group: string }> }
) {
  try {
    const { consumer_group } = await params
    
    if (!consumer_group) {
      return NextResponse.json(
        { error: 'Consumer group is required' },
        { status: 400 }
      )
    }
    
    // Generate mock consumer group detail
    const stream: StreamName = consumer_group.includes('intent') 
      ? 'zord.intent.ingress'
      : consumer_group.includes('webhook')
      ? 'zord.webhook.ingress'
      : 'zord.batch.ingress'
    
    const status: ConsumerStatus = consumer_group.includes('v3') 
      ? 'DEGRADED'
      : consumer_group.includes('v2')
      ? 'RUNNING'
      : 'STALLED'
    
    const partitions = consumer_group.includes('intent') ? 12 : consumer_group.includes('webhook') ? 8 : 16
    const totalLag = status === 'STALLED' ? 14832 : status === 'DEGRADED' ? 5432 : 123
    const activeMembers = consumer_group.includes('intent') ? 4 : 3
    
    // Generate partition details with current_offset and log_end_offset
    const partitionsDetail = Array.from({ length: partitions }, (_, i) => {
      const baseOffset = 91827000
      const currentOffset = baseOffset + Math.floor(Math.random() * 1000)
      const logEndOffset = currentOffset + Math.floor(Math.random() * (totalLag / partitions * 2))
      const partitionLag = logEndOffset - currentOffset
      const partitionStatus: 'OK' | 'LAGGING' | 'CRITICAL' = partitionLag > 5000 
        ? 'CRITICAL'
        : partitionLag > 500
        ? 'LAGGING'
        : 'OK'
      
      return {
        partition: i,
        current_offset: currentOffset,
        log_end_offset: logEndOffset,
        lag: partitionLag,
        status: partitionStatus,
      }
    })
    
    // Generate consumer group topology
    const groupTopology = Array.from({ length: activeMembers }, (_, i) => {
      const partitionsPerMember = Math.floor(partitions / activeMembers)
      const startPartition = i * partitionsPerMember
      const endPartition = i === activeMembers - 1 ? partitions : (i + 1) * partitionsPerMember
      const memberPartitions = Array.from({ length: endPartition - startPartition }, (_, j) => startPartition + j)
      
      return {
        member_id: `consumer-${i + 1}`,
        host: `ip-10-0-3-${21 + i}`,
        partitions: memberPartitions,
      }
    })
    
    const now = new Date()

    // Generate rebalance history (last 24h)
    const rebalanceHistory = [
      {
        timestamp: new Date(now.getTime() - 5 * 60 * 1000).toISOString(),
        event_type: 'REBALANCE_STARTED' as const,
      },
      {
        timestamp: new Date(now.getTime() - 5 * 60 * 1000 + 5000).toISOString(),
        event_type: 'REBALANCE_COMPLETED' as const,
        duration_sec: 5,
      },
      {
        timestamp: new Date(now.getTime() - 45 * 60 * 1000).toISOString(),
        event_type: 'REBALANCE_STARTED' as const,
      },
      {
        timestamp: new Date(now.getTime() - 45 * 60 * 1000 + 21000).toISOString(),
        event_type: 'REBALANCE_COMPLETED' as const,
        duration_sec: 21,
      },
    ]
    
    // Generate throughput and latency data (last 24 hours, hourly)
    const throughputData = Array.from({ length: 24 }, (_, i) => {
      const timestamp = new Date(now.getTime() - (23 - i) * 60 * 60 * 1000)
      return {
        timestamp: timestamp.toISOString(),
        events_per_sec: status === 'STALLED' 
          ? Math.floor(Math.random() * 50)
          : status === 'DEGRADED'
          ? Math.floor(Math.random() * 500) + 200
          : Math.floor(Math.random() * 300) + 500,
      }
    })
    
    const commitLatencyData = Array.from({ length: 24 }, (_, i) => {
      const timestamp = new Date(now.getTime() - (23 - i) * 60 * 60 * 1000)
      return {
        timestamp: timestamp.toISOString(),
        latency_ms: status === 'STALLED'
          ? Math.floor(Math.random() * 5000) + 1000
          : status === 'DEGRADED'
          ? Math.floor(Math.random() * 500) + 100
          : Math.floor(Math.random() * 100) + 10,
      }
    })
    
    const lastCommitMax = new Date(now.getTime() - (status === 'STALLED' ? 600000 : Math.random() * 300000))
    const commitSlaSec = 30
    const commitSlaBreached = (now.getTime() - lastCommitMax.getTime()) / 1000 > commitSlaSec
    
    const ingressRate = status === 'STALLED' ? 0 : status === 'DEGRADED' ? 2140 : 2850
    const processingRate = status === 'STALLED' ? 0 : status === 'DEGRADED' ? 1980 : 2800
    const effectiveBackpressure = processingRate < ingressRate ? 'ACTIVE' : 'INACTIVE'
    const lagGrowthRate = ingressRate - processingRate
    
    const detail: ConsumerGroupDetail = {
      consumer_group,
      stream,
      environment: 'PRODUCTION',
      state: status,
      deployment: `ingest-consumer@v${consumer_group.includes('v3') ? '3.7.2' : consumer_group.includes('v2') ? '2.5.1' : '1.9.0'}`,
      assigned_partitions: partitions,
      active_members: activeMembers,
      total_lag: totalLag,
      lag_growth_rate: lagGrowthRate,
      last_commit_max: lastCommitMax.toISOString(),
      commit_sla_sec: commitSlaSec,
      commit_sla_breached: commitSlaBreached,
      group_topology: groupTopology,
      partitions_detail: partitionsDetail,
      commit_behavior: {
        commit_mode: 'Async',
        commit_interval_sec: 5,
        max_commit_delay_sec: status === 'STALLED' ? 41 : status === 'DEGRADED' ? 28 : 12,
        commit_sla_sec: commitSlaSec,
        sla_breached: commitSlaBreached,
        commit_failures_1h: status === 'STALLED' ? 17 : status === 'DEGRADED' ? 5 : 0,
        commit_failure_breakdown: {
          OFFSET_COMMIT_TIMEOUT: status === 'STALLED' ? 9 : status === 'DEGRADED' ? 3 : 0,
          REBALANCE_IN_PROGRESS: status === 'STALLED' ? 6 : status === 'DEGRADED' ? 2 : 0,
          COORDINATOR_NOT_AVAILABLE: status === 'STALLED' ? 2 : 0,
        },
      },
      throughput: {
        ingress_rate: ingressRate,
        processing_rate: processingRate,
        effective_backpressure: effectiveBackpressure as 'ACTIVE' | 'INACTIVE',
      },
      schema_info: {
        schema_version_expected: 'zintent.v1',
        schema_mismatch_count: status === 'STALLED' ? 3 : 0,
        deserialization_errors: status === 'STALLED' ? 12 : status === 'DEGRADED' ? 3 : 0,
      },
      poison_messages: {
        suspected_count: status === 'STALLED' ? 3 : status === 'DEGRADED' ? 1 : 0,
        affected_partitions: status === 'STALLED' ? [1, 3] : status === 'DEGRADED' ? [1] : [],
        retry_attempts: 5,
      },
      downstream_effects: {
        intents_created_last_1h: status === 'STALLED' ? 0 : status === 'DEGRADED' ? 8500 : 12301,
        failed_conversions: status === 'STALLED' ? 18 : status === 'DEGRADED' ? 8 : 2,
        intents_created_last_15m: status === 'STALLED' ? 0 : status === 'DEGRADED' ? 2140 : 3075,
        avg_event_to_intent_latency_ms: status === 'STALLED' ? 0 : status === 'DEGRADED' ? 142 : 89,
      },
      rebalance_history: rebalanceHistory,
      audit: {
        offset_commit_log: 'ENABLED',
        consumer_state_snapshots: 'RETAINED',
        retention_days: 7,
        audit_trail_integrity: 'VERIFIED',
        last_verified: new Date(now.getTime() - 5 * 60 * 1000).toISOString(),
      },
      throughput_data: throughputData,
      commit_latency_data: commitLatencyData,
    }
    
    return NextResponse.json(detail)
  } catch (error) {
    console.error('Error fetching consumer group detail:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
