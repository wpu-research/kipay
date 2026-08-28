import { describe, it, expect } from 'vitest'
import { getNavItemsForRole, NAV_ITEMS } from '@/constants/navigation'
import type { UserRole } from '@/types/auth'

describe('getNavItemsForRole()', () => {
  it('rol tanımlı değilse boş dizi döndürür', () => {
    expect(getNavItemsForRole(undefined)).toEqual([])
  })

  it('super_admin tüm menü öğelerini alır', () => {
    const items = getNavItemsForRole('super_admin')
    expect(items).toHaveLength(NAV_ITEMS.length)
  })

  it('finans sadece /transactions görür', () => {
    const items = getNavItemsForRole('finans')
    expect(items).toHaveLength(1)
    expect(items[0].href).toBe('/transactions')
  })

  it('operator sadece /transactions görür', () => {
    const items = getNavItemsForRole('operator')
    expect(items).toHaveLength(1)
    expect(items[0].href).toBe('/transactions')
  })

  it('merchant /transactions ve /reports görür', () => {
    const items = getNavItemsForRole('merchant')
    const hrefs = items.map((i) => i.href)
    expect(hrefs).toContain('/transactions')
    expect(hrefs).toContain('/reports')
    expect(items).toHaveLength(2)
  })

  it('firma /tenants görmez', () => {
    const items = getNavItemsForRole('firma')
    const hrefs = items.map((i) => i.href)
    expect(hrefs).not.toContain('/tenants')
  })

  it('her menü öğesi title, href ve icon alanlarına sahip', () => {
    const items = getNavItemsForRole('super_admin')
    for (const item of items) {
      expect(item).toHaveProperty('title')
      expect(item).toHaveProperty('href')
      expect(item).toHaveProperty('icon')
    }
  })

  const roles: UserRole[] = ['super_admin', 'firma', 'finans', 'merchant', 'operator']
  it.each(roles)('%s rolü için dizi döner', (role) => {
    expect(Array.isArray(getNavItemsForRole(role))).toBe(true)
  })
})
