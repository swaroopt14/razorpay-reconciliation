import { NextRequest, NextResponse } from 'next/server'
import { ServiceMetricsResponse, TimeSeriesPoint, MetricStatus } from '@/types/service-metrics'

export const dynamic = 'force-dynamic'

// Generate realistic time series data
function generateTimeSeries(
  baseValue: number, 
  variance: number, 
  points: number = 60,
  trend: 'stable' | 'rising' | 'falling' = 'stable'
): TimeSeriesPoint[] {
  const now = Date.now()
  const data: TimeSeriesPoint[] = []
  
  for (let i = points - 1; i >= 0; i--) {
    const timestamp = new Date(now - i * 60000).toISOString()
    let trendAdjust = 0
    if (trend === 'rising') trendAdjust = (points - i) * 0.1
    if (trend === 'falling') trendAdjust = -(points - i) * 0.1
    
    const value = Math.max(0, baseValue + trendAdjust + (Math.random() - 0.5) * variance * 2)
    data.push({ timestamp, value: Math.round(value * 100) / 100 })
  }
  
  return data
}

// Service configurations
const serviceConfigs: Record<string, { displayName: string; baseMetrics: Record<string, number> }> = {
  'zord-edge': {
    displayName: 'Zord Edge Gateway',
    baseMetrics: { cpu: 42, memory: 58, disk: 34, rps: 847, latency: 45 }
  },
  'zord-vault-journal': {
    displayName: 'Zord Vault Journal',
    baseMetrics: { cpu: 38, memory: 67, disk: 52, rps: 423, latency: 89 }
  },
  'zord-intent-engine': {
    displayName: 'Zord Intent Engine',
    baseMetrics: { cpu: 55, memory: 61, disk: 28, rps: 312, latency: 124 }
  },
  'zord-relay': {
    displayName: 'Zord Relay',
    baseMetrics: { cpu: 29, memory: 44, disk: 21, rps: 756, latency: 32 }
  },
  'zord-contracts': {
    displayName: 'Zord Contracts',
    baseMetrics: { cpu: 21, memory: 38, disk: 67, rps: 156, latency: 67 }
  },
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ service: string; instance: string }> }
) {
  const { service, instance } = await params
  
  // Simulate API latency
  await new Promise(resolve => setTimeout(resolve, 150))

  const config = serviceConfigs[service] || {
    displayName: service,
    baseMetrics: { cpu: 35, memory: 50, disk: 30, rps: 200, latency: 75 }
  }

  const { baseMetrics } = config
  
  const getStatus = (value: number, warn: number, crit: number): MetricStatus => {
    if (value >= crit) return 'critical'
    if (value >= warn) return 'warning'
    return 'healthy'
  }

  const mockData: ServiceMetricsResponse = {
    service_name: service,
    instance_id: instance,
    display_name: config.displayName,
    status: 'healthy',
    environment: 'PRODUCTION',
    region: 'ap-south-1',
    last_updated_seconds_ago: 3,

    instance: {
      service_name: service,
      instance_id: instance,
      display_name: config.displayName,
      status: 'healthy',
      region: 'ap-south-1',
      availability_zone: 'ap-south-1a',
      ip_address: '10.0.1.' + Math.floor(Math.random() * 255),
      port: 8080,
      version: '1.4.3',
      uptime_seconds: 432000 + Math.floor(Math.random() * 86400),
      last_restart: '2026-01-28T08:15:00Z',
    },

    cpu: {
      name: 'cpu_utilization',
      display_name: 'CPU Utilization',
      current_value: baseMetrics.cpu + Math.floor(Math.random() * 10 - 5),
      unit: '%',
      status: getStatus(baseMetrics.cpu, 70, 90),
      threshold_warning: 70,
      threshold_critical: 90,
      series: generateTimeSeries(baseMetrics.cpu, 15),
    },

    memory: {
      name: 'memory_utilization',
      display_name: 'Memory Utilization',
      current_value: baseMetrics.memory + Math.floor(Math.random() * 8 - 4),
      unit: '%',
      status: getStatus(baseMetrics.memory, 75, 90),
      threshold_warning: 75,
      threshold_critical: 90,
      series: generateTimeSeries(baseMetrics.memory, 10),
    },

    disk: {
      name: 'disk_utilization',
      display_name: 'Disk Utilization',
      current_value: baseMetrics.disk + Math.floor(Math.random() * 5 - 2),
      unit: '%',
      status: getStatus(baseMetrics.disk, 80, 95),
      threshold_warning: 80,
      threshold_critical: 95,
      series: generateTimeSeries(baseMetrics.disk, 3, 60, 'rising'),
    },

    network_in: {
      name: 'network_in',
      display_name: 'Network In',
      current_value: Math.round((baseMetrics.rps * 0.8 + Math.random() * 100) * 100) / 100,
      unit: 'KB/s',
      status: 'healthy',
      threshold_warning: 10000,
      threshold_critical: 50000,
      series: generateTimeSeries(baseMetrics.rps * 0.8, 200),
    },

    network_out: {
      name: 'network_out',
      display_name: 'Network Out',
      current_value: Math.round((baseMetrics.rps * 1.2 + Math.random() * 150) * 100) / 100,
      unit: 'KB/s',
      status: 'healthy',
      threshold_warning: 10000,
      threshold_critical: 50000,
      series: generateTimeSeries(baseMetrics.rps * 1.2, 300),
    },

    requests_per_second: {
      name: 'requests_per_second',
      display_name: 'Requests/sec',
      current_value: baseMetrics.rps + Math.floor(Math.random() * 100 - 50),
      unit: 'req/s',
      status: 'healthy',
      threshold_warning: 2000,
      threshold_critical: 5000,
      series: generateTimeSeries(baseMetrics.rps, baseMetrics.rps * 0.3),
    },

    latency_p50: {
      name: 'latency_p50',
      display_name: 'Latency P50',
      current_value: Math.round(baseMetrics.latency * 0.6),
      unit: 'ms',
      status: 'healthy',
      threshold_warning: 200,
      threshold_critical: 500,
      series: generateTimeSeries(baseMetrics.latency * 0.6, 15),
    },

    latency_p95: {
      name: 'latency_p95',
      display_name: 'Latency P95',
      current_value: baseMetrics.latency,
      unit: 'ms',
      status: getStatus(baseMetrics.latency, 200, 500),
      threshold_warning: 200,
      threshold_critical: 500,
      series: generateTimeSeries(baseMetrics.latency, 30),
    },

    latency_p99: {
      name: 'latency_p99',
      display_name: 'Latency P99',
      current_value: Math.round(baseMetrics.latency * 1.8),
      unit: 'ms',
      status: getStatus(baseMetrics.latency * 1.8, 300, 800),
      threshold_warning: 300,
      threshold_critical: 800,
      series: generateTimeSeries(baseMetrics.latency * 1.8, 50),
    },

    error_rate: {
      name: 'error_rate',
      display_name: 'Error Rate',
      current_value: Math.round((0.5 + Math.random() * 0.8) * 100) / 100,
      unit: '%',
      status: 'healthy',
      threshold_warning: 1,
      threshold_critical: 5,
      series: generateTimeSeries(0.6, 0.4),
    },

    active_connections: {
      name: 'active_connections',
      display_name: 'Active Connections',
      current_value: Math.floor(baseMetrics.rps * 0.3 + Math.random() * 50),
      unit: '',
      status: 'healthy',
      threshold_warning: 1000,
      threshold_critical: 2000,
      series: generateTimeSeries(baseMetrics.rps * 0.3, 30),
    },

    recent_events: [
      { timestamp: new Date(Date.now() - 300000).toISOString(), type: 'info', message: 'Health check passed' },
      { timestamp: new Date(Date.now() - 900000).toISOString(), type: 'info', message: 'Config reload completed' },
      { timestamp: new Date(Date.now() - 1800000).toISOString(), type: 'warning', message: 'High memory usage detected (78%)' },
      { timestamp: new Date(Date.now() - 3600000).toISOString(), type: 'info', message: 'Deployment v1.4.3 completed' },
    ],
  }

  return NextResponse.json(mockData)
}
