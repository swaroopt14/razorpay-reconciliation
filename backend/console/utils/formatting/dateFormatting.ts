// Date Formatting Utilities

import { format, formatDistanceToNow, isToday, isYesterday } from 'date-fns'

export function formatDateTime(date: string | Date, includeTime: boolean = true): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date
  
  if (includeTime) {
    return format(dateObj, 'yyyy-MM-dd HH:mm:ss')
  }
  return format(dateObj, 'yyyy-MM-dd')
}

export function formatDateTimeUTC(date: string | Date): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date
  return format(dateObj, 'yyyy-MM-dd HH:mm:ss') + ' UTC'
}

export function formatRelativeTime(date: string | Date): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date
  
  if (isToday(dateObj)) {
    return `Today at ${format(dateObj, 'HH:mm')}`
  }
  
  if (isYesterday(dateObj)) {
    return `Yesterday at ${format(dateObj, 'HH:mm')}`
  }
  
  return formatDistanceToNow(dateObj, { addSuffix: true })
}

export function formatTimeOnly(date: string | Date): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date
  return format(dateObj, 'HH:mm:ss')
}
