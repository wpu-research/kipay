import { describe, it, expect } from 'vitest'
import { cn } from '@/lib/utils'

describe('cn()', () => {
  it('tek sınıf döndürür', () => {
    expect(cn('foo')).toBe('foo')
  })

  it('birden fazla sınıfı birleştirir', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })

  it('koşullu sınıfları işler', () => {
    expect(cn('foo', false && 'bar', 'baz')).toBe('foo baz')
  })

  it('tailwind çakışmalarını çözer', () => {
    expect(cn('p-4', 'p-2')).toBe('p-2')
  })

  it('undefined ve null değerleri yoksayar', () => {
    expect(cn('foo', undefined, null, 'bar')).toBe('foo bar')
  })
})
