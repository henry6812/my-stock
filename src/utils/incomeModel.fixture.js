// Hand-checkable company for the income-model tests: every 2025 quarter is
// Q2025, every 2026 quarter so far is Q2026, 100 thousand shares, no
// minority interest. Revenue: 2024 months 250, 2025 months 300, 2026 H1
// months 400, Q3 months 450 (published, the quarter's statement is not).
export const Q2025 = {
  revenue: 900, grossProfit: 450, operatingIncome: 270, nonOperating: 20,
  pretaxIncome: 290, tax: 58, netIncome: 232, parentNetIncome: 232, eps: 2.32,
}
export const Q2026 = {
  revenue: 1200, grossProfit: 600, operatingIncome: 360, nonOperating: 20,
  pretaxIncome: 380, tax: 76, netIncome: 304, parentNetIncome: 304, eps: 3.04,
}

const cumulate = (single, count) =>
  Object.fromEntries(Object.entries(single).map(([field, value]) => [field, Math.round(value * count * 100) / 100]))

export const CUMULATIVE = {
  '2025Q1': cumulate(Q2025, 1),
  '2025Q2': cumulate(Q2025, 2),
  '2025Q3': cumulate(Q2025, 3),
  '2025Q4': cumulate(Q2025, 4),
  '2026Q1': cumulate(Q2026, 1),
  '2026Q2': cumulate(Q2026, 2),
}

const months = (year, from, to, value) =>
  Object.fromEntries(
    Array.from({ length: to - from + 1 }, (_, index) => [`${year}-${String(from + index).padStart(2, '0')}`, value]),
  )

export const MONTHLY_REVENUE = {
  ...months(2024, 1, 12, 250),
  ...months(2025, 1, 12, 300),
  ...months(2026, 1, 6, 400),
  ...months(2026, 7, 9, 450),
}

export const COMPANY = { statement: 'general', cumulative: CUMULATIVE, monthlyRevenue: MONTHLY_REVENUE, monthly: [] }
