export interface Customer {
  id:             string
  merchantId:     string
  merchantName:   string
  externalUserId: string
  identityNumber: string | null
  firstName:      string | null
  lastName:       string | null
  phone:          string | null
  depositCount:   number
  firstSeenAt:    string
  lastSeenAt:     string
}

export interface CustomerListResponse {
  data: Customer[]
  meta: { total: number; page: number; limit: number; totalPages: number }
}

export interface CustomerListFilters {
  search?:     string
  merchantId?: string
  tenantId?:   string
  page?:       number
  limit?:      number
}
