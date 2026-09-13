export interface CommissionReportRow {
  date:                 string
  merchantId:           string
  merchantName:         string
  method:               string
  depositAmount:        string
  depositCommission:    string
  withdrawalAmount:     string
  withdrawalCommission: string
}

export interface CommissionSettlementRow {
  merchantId:     string
  settlementDate: string
  paidToUs:       string
  paidByUs:       string
  note:           string | null
}

export interface CommissionReportResponse {
  data:        CommissionReportRow[]
  settlements: CommissionSettlementRow[]
}

export interface CommissionReportFilters {
  from?:       string
  to?:         string
  tenantId?:   string
  merchantId?: string
}

export interface CommissionRate {
  id:             string
  merchantId:     string
  paymentMethod:  string
  depositRate:    string
  withdrawalRate: string
}

export interface CommissionRatesResponse {
  data: CommissionRate[]
}

export interface CommissionRateUpsert {
  merchantId:     string
  paymentMethod:  string
  depositRate:    number
  withdrawalRate: number
}

export interface SettlementUpsert {
  merchantId:     string
  settlementDate: string
  paidToUs:       number
  paidByUs:       number
  note?:          string
}
