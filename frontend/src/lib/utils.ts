import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(date))
}

export function formatDateTime(date: string | Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))
}

export function getRiskLevel(score: number): 'critical' | 'high' | 'medium' | 'low' {
  if (score >= 20) return 'critical'
  if (score >= 12) return 'high'
  if (score >= 6) return 'medium'
  return 'low'
}

export function getRiskColor(score: number): string {
  const level = getRiskLevel(score)
  const colors = {
    critical: 'bg-red-600 text-white',
    high: 'bg-orange-500 text-white',
    medium: 'bg-yellow-400 text-black',
    low: 'bg-green-500 text-white',
  }
  return colors[level]
}

export function getImplementationStatusColor(status: string): string {
  const colors: Record<string, string> = {
    NOT_IMPLEMENTED: 'bg-red-100 text-red-800',
    PLANNED: 'bg-blue-100 text-blue-800',
    PARTIALLY_IMPLEMENTED: 'bg-yellow-100 text-yellow-800',
    FULLY_IMPLEMENTED: 'bg-green-100 text-green-800',
  }
  return colors[status] || 'bg-gray-100 text-gray-800'
}

export function getIncidentSeverityColor(severity: string): string {
  const colors: Record<string, string> = {
    CRITICAL: 'bg-red-600 text-white',
    HIGH: 'bg-orange-500 text-white',
    MEDIUM: 'bg-yellow-400 text-black',
    LOW: 'bg-green-500 text-white',
  }
  return colors[severity] || 'bg-gray-100 text-gray-800'
}

export function getPolicyStatusColor(status: string): string {
  const colors: Record<string, string> = {
    DRAFT: 'bg-gray-100 text-gray-800',
    PENDING_APPROVAL: 'bg-yellow-100 text-yellow-800',
    APPROVED: 'bg-green-100 text-green-800',
    ARCHIVED: 'bg-blue-100 text-blue-800',
  }
  return colors[status] || 'bg-gray-100 text-gray-800'
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    // Risk statuses
    IDENTIFIED: 'bg-blue-100 text-blue-800',
    ANALYZING: 'bg-yellow-100 text-yellow-800',
    TREATING: 'bg-orange-100 text-orange-800',
    MONITORING: 'bg-purple-100 text-purple-800',
    CLOSED: 'bg-gray-100 text-gray-800',
    // Incident statuses
    REPORTED: 'bg-blue-100 text-blue-800',
    INVESTIGATING: 'bg-yellow-100 text-yellow-800',
    CONTAINED: 'bg-orange-100 text-orange-800',
    RESOLVED: 'bg-green-100 text-green-800',
    // Audit statuses
    PLANNED: 'bg-blue-100 text-blue-800',
    IN_PROGRESS: 'bg-yellow-100 text-yellow-800',
    COMPLETED: 'bg-green-100 text-green-800',
    CANCELLED: 'bg-gray-100 text-gray-800',
  }
  return colors[status] || 'bg-gray-100 text-gray-800'
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str
  return str.slice(0, length) + '...'
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
