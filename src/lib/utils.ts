import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

export function round5(n: number): number {
  return Math.max(5, Math.round(n / 5) * 5)
}

export function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0)
}

export function avg(values: number[]): number | null {
  return values.length ? sum(values) / values.length : null
}

export function groupBy<T, K extends string>(items: T[], key: (t: T) => K): Record<K, T[]> {
  const out = {} as Record<K, T[]>
  for (const item of items) {
    const k = key(item)
    ;(out[k] ??= []).push(item)
  }
  return out
}

export function uniq<T>(items: T[]): T[] {
  return Array.from(new Set(items))
}
