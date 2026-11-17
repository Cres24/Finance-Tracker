import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Sector,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useAuth } from '../AuthContext'
import { useCurrency, CURRENCIES } from '../CurrencyContext'
import api from '../api'

function currentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(value) {
  if (!value) return ''
  const [year, month] = value.split('-')
  const date = new Date(Number(year), Number(month) - 1, 1)
  return date.toLocaleDateString(undefined, { month: 'short', year: '2-digit' })
}

function renderActiveSlice(props) {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props
  return (
    <Sector
      cx={cx}
      cy={cy}
      innerRadius={innerRadius - 2}
      outerRadius={outerRadius + 8}
      startAngle={startAngle}
      endAngle={endAngle}
      fill={fill}
    />
  )
}

function ChartTooltip({ active, payload, label, formatMoney, labelFormatter }) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className="chart-tooltip">
      <strong>{labelFormatter ? labelFormatter(label) : label}</strong>
      {payload.map((item) => (
        <div key={`${item.dataKey}-${item.name}`} className="chart-tooltip-row">
          <span className="legend-dot" style={{ background: item.color || item.payload?.color }} />
          <span>{item.name}</span>
          <strong>{formatMoney(item.value)}</strong>
        </div>
      ))}
    </div>
  )
}

function StatCard({ label, value, hint, tone }) {
  return (
    <div className="card stat-card card-zoom">
      <h3>{label}</h3>
      <p className={tone || ''}>{value}</p>
      {hint && <small>{hint}</small>}
    </div>
  )
}

export default function AnalyticsPage() {
  const navigate = useNavigate()
  const { logout } = useAuth()
  const { currency, setCurrency, formatMoney, fromINR } = useCurrency()

  const [month, setMonth] = useState(currentMonth)
  const [trendMonths, setTrendMonths] = useState(6)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeCategoryIdx, setActiveCategoryIdx] = useState(-1)

  const loadAnalytics = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.get('/analytics/', {
        params: { month, trend_months: trendMonths },
      })
      setData(res.data)
    } catch (err) {
      if (err.response?.status === 401) {
        logout()
        navigate('/login', { replace: true })
      } else {
        setError('Could not load analytics. Try another month.')
      }
    } finally {
      setLoading(false)
    }
  }, [logout, month, navigate, trendMonths])

  useEffect(() => {
    loadAnalytics()
  }, [loadAnalytics])

  const summary = data?.summary || {
    total_income: 0,
    total_expense: 0,
    net_savings: 0,
    savings_rate: 0,
    recurring_total: 0,
    one_time_total: 0,
    recurring_count: 0,
    transaction_count: 0,
    average_daily_spend: 0,
  }
  const categories = data?.category_breakdown || []
  const buckets = data?.bucket_breakdown || []
  const paymentModes = data?.payment_mode_breakdown || []
  const trend = data?.trend || []
  const topMerchants = data?.top_merchants || []
  const budgets = data?.budget_comparison || []
  const largestExpenses = data?.largest_expenses || []
  const incomeSources = data?.income_by_source || []

  const hasData = summary.total_expense > 0 || summary.total_income > 0

  const compactTick = useMemo(
    () => (value) => {
      const amount = Math.abs(fromINR(value || 0))
      if (amount >= 10000000) return `${(amount / 10000000).toFixed(1)}Cr`
      if (amount >= 100000) return `${(amount / 100000).toFixed(1)}L`
      if (amount >= 1000) return `${Math.round(amount / 1000)}k`
      return String(Math.round(amount))
    },
    [fromINR],
  )

  const maxMerchant = Math.max(...topMerchants.map((m) => m.total), 0)

  return (
    <div className="dashboard analytics-page">
      <header>
        <div>
          <h1>Analytics</h1>
          <small>Expense patterns, category mix, and monthly trends</small>
        </div>
        <div className="header-actions">
          <div className="currency-switch" role="group" aria-label="Display currency">
            {Object.keys(CURRENCIES).map((code) => (
              <button
                key={code}
                type="button"
                className={currency === code ? 'active' : ''}
                aria-pressed={currency === code}
                onClick={() => setCurrency(code)}
              >
                {CURRENCIES[code].label}
              </button>
            ))}
          </div>
          <button type="button" className="logout" onClick={() => navigate('/')}>
            ← Back to Dashboard
          </button>
        </div>
      </header>

      <div className="analytics-toolbar">
        <label>
          Month
          <input
            type="month"
            value={month}
            max={currentMonth()}
            onChange={(e) => setMonth(e.target.value || currentMonth())}
          />
        </label>
        <label>
          Trend window
          <select
            value={trendMonths}
            onChange={(e) => setTrendMonths(Number(e.target.value))}
          >
            <option value={3}>3 months</option>
            <option value={6}>6 months</option>
            <option value={12}>12 months</option>
          </select>
        </label>
        <span className="hint analytics-rate-hint">
          Displayed in {currency}. Totals are stored in INR.
        </span>
      </div>

      {error && <p className="error">{error}</p>}
      {loading && <p className="loading">Loading analytics...</p>}

      {!loading && !error && data && (
        <>
          <div className="stat-grid">
            <StatCard label="Income" value={formatMoney(summary.total_income)} tone="pos" />
            <StatCard label="Expenses" value={formatMoney(summary.total_expense)} tone="neg" />
            <StatCard
              label="Net savings"
              value={formatMoney(summary.net_savings)}
              tone={summary.net_savings < 0 ? 'neg' : 'pos'}
            />
            <StatCard label="Savings rate" value={`${summary.savings_rate}%`} />
            <StatCard
              label="Recurring"
              value={formatMoney(summary.recurring_total)}
              hint={`${summary.recurring_count} subscription${summary.recurring_count === 1 ? '' : 's'}`}
            />
            <StatCard label="One-time" value={formatMoney(summary.one_time_total)} />
            <StatCard
              label="Avg / day"
              value={formatMoney(summary.average_daily_spend)}
              hint={`${summary.transaction_count} transactions`}
            />
            <StatCard
              label="Top category"
              value={categories[0]?.name || '—'}
              hint={categories[0] ? formatMoney(categories[0].total) : 'No expenses'}
            />
          </div>

          {!hasData && (
            <div className="card empty-state">
              <h3>No activity for {monthLabel(data.month)}</h3>
              <p>Add some income or expenses to see category colors, trends, and budgets here.</p>
              <button type="button" onClick={() => navigate('/expenses')}>
                Add a transaction
              </button>
            </div>
          )}

          {hasData && (
            <>
              <div className="chart-grid">
                <div className="card chart-card card-zoom">
                  <h3>Expenses by category</h3>
                  {categories.length === 0 ? (
                    <p className="hint">No expenses recorded this month.</p>
                  ) : (
                    <div className="donut-layout">
                      <div className="donut-chart chart-zoom">
                        <ResponsiveContainer width="100%" height={240}>
                          <PieChart>
                            <Pie
                              data={categories}
                              dataKey="total"
                              nameKey="name"
                              innerRadius={62}
                              outerRadius={96}
                              paddingAngle={2}
                              stroke="none"
                              activeIndex={activeCategoryIdx >= 0 ? activeCategoryIdx : undefined}
                              activeShape={renderActiveSlice}
                              onMouseEnter={(_, idx) => setActiveCategoryIdx(idx)}
                              onMouseLeave={() => setActiveCategoryIdx(-1)}
                            >
                              {categories.map((entry) => (
                                <Cell key={entry.category} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip
                              content={
                                <ChartTooltip
                                  formatMoney={formatMoney}
                                  labelFormatter={() => 'Category'}
                                />
                              }
                            />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="donut-center">
                          <span>Total</span>
                          <strong>{formatMoney(summary.total_expense)}</strong>
                        </div>
                      </div>
                      <ul className="legend-list">
                        {categories.map((entry, idx) => (
                          <li
                            key={entry.category}
                            onMouseEnter={() => setActiveCategoryIdx(idx)}
                            onMouseLeave={() => setActiveCategoryIdx(-1)}
                            style={{
                              cursor: 'pointer',
                              transform: activeCategoryIdx === idx ? 'scale(1.04)' : undefined,
                              backgroundColor: activeCategoryIdx === idx ? '#f8fafc' : undefined,
                            }}
                          >
                            <span
                              className="legend-dot"
                              style={{ background: entry.color }}
                            />
                            <span className="legend-name">{entry.name}</span>
                            <span className="legend-pct">{entry.percentage.toFixed(1)}%</span>
                            <strong>{formatMoney(entry.total)}</strong>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                <div className="card chart-card card-zoom">
                  <h3>Expenses by bucket</h3>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart
                      data={buckets}
                      layout="vertical"
                      margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" tickFormatter={compactTick} />
                      <YAxis type="category" dataKey="label" width={100} />
                      <Tooltip content={<ChartTooltip formatMoney={formatMoney} />} />
                      <Bar dataKey="total" name="Spent" radius={[0, 4, 4, 0]}>
                        {buckets.map((entry) => (
                          <Cell key={entry.bucket} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="card chart-card card-zoom">
                  <h3>Payment modes</h3>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart
                      data={paymentModes}
                      layout="vertical"
                      margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" tickFormatter={compactTick} />
                      <YAxis type="category" dataKey="label" width={110} />
                      <Tooltip content={<ChartTooltip formatMoney={formatMoney} />} />
                      <Bar dataKey="total" name="Spent" radius={[0, 4, 4, 0]}>
                        {paymentModes.map((entry) => (
                          <Cell key={entry.payment_mode} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="card chart-card card-zoom">
                  <h3>Budget vs actual</h3>
                  {budgets.map((bucket) => {
                    const pct = bucket.budget_limit
                      ? Math.min((bucket.spent / bucket.budget_limit) * 100, 100)
                      : 0
                    const over = bucket.budget_limit && bucket.spent > bucket.budget_limit
                    return (
                      <div className="budget-bar" key={bucket.bucket}>
                        <div className="budget-bar-top">
                          <span>
                            <span
                              className="legend-dot"
                              style={{ background: bucket.color }}
                            />
                            {bucket.label}
                          </span>
                          <strong>
                            {formatMoney(bucket.spent)}
                            {bucket.budget_limit > 0
                              ? ` / ${formatMoney(bucket.budget_limit)}`
                              : ' (no budget)'}
                          </strong>
                        </div>
                        {bucket.budget_limit > 0 && (
                          <div className="bar">
                            <div
                              className={`bar-fill ${over ? 'over' : ''}`}
                              style={{
                                width: `${pct}%`,
                                background: over ? undefined : bucket.color,
                              }}
                            />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="card chart-card trend-card card-zoom">
                <h3>Income, expenses & savings trend</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart
                    data={trend}
                    margin={{ top: 8, right: 16, bottom: 4, left: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="month" tickFormatter={monthLabel} />
                    <YAxis tickFormatter={compactTick} />
                    <Tooltip
                      content={
                        <ChartTooltip
                          formatMoney={formatMoney}
                          labelFormatter={monthLabel}
                        />
                      }
                    />
                    <Bar dataKey="income" name="Income" fill="#16a34a" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="expense" name="Expenses" fill="#dc2626" radius={[4, 4, 0, 0]} />
                    <Line
                      type="monotone"
                      dataKey="savings"
                      name="Savings"
                      stroke="#2563eb"
                      strokeWidth={2.5}
                      dot={{ r: 3 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              <div className="chart-grid">
                <div className="card chart-card card-zoom">
                  <h3>Top merchants</h3>
                  {topMerchants.length === 0 ? (
                    <p className="hint">No merchants recorded this month.</p>
                  ) : (
                    <div className="merchant-list">
                      {topMerchants.map((merchant) => (
                        <div className="merchant-row" key={merchant.merchant}>
                          <div className="merchant-row-top">
                            <span>
                              {merchant.merchant}
                              <small> · {merchant.count} txn</small>
                            </span>
                            <strong>{formatMoney(merchant.total)}</strong>
                          </div>
                          <div className="bar">
                            <div
                              className="bar-fill"
                              style={{
                                width: `${
                                  maxMerchant ? (merchant.total / maxMerchant) * 100 : 0
                                }%`,
                                background: '#2563eb',
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="card chart-card card-zoom">
                  <h3>Income by source</h3>
                  {incomeSources.length === 0 ? (
                    <p className="hint">No income recorded this month.</p>
                  ) : (
                    <div className="merchant-list">
                      {incomeSources.map((source, index) => (
                        <div className="merchant-row" key={source.source}>
                          <div className="merchant-row-top">
                            <span>
                              <span
                                className="legend-dot"
                                style={{ background: ['#16a34a', '#0891b2', '#7c3aed', '#f59e0b'][index % 4] }}
                              />
                              {source.source}
                            </span>
                            <strong>{formatMoney(source.total)}</strong>
                          </div>
                          <div className="bar">
                            <div
                              className="bar-fill"
                              style={{
                                width: `${
                                  summary.total_income
                                    ? (source.total / summary.total_income) * 100
                                    : 0
                                }%`,
                                background: ['#16a34a', '#0891b2', '#7c3aed', '#f59e0b'][index % 4],
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="card chart-card card-zoom">
                <h3>Largest expenses</h3>
                {largestExpenses.length === 0 ? (
                  <p className="hint">No expenses recorded this month.</p>
                ) : (
                  <div className="analytics-list">
                    {largestExpenses.map((expense) => (
                      <div className="analytics-list-row" key={expense.id}>
                        <span
                          className="legend-dot"
                          style={{ background: expense.category_color || '#6b7280' }}
                        />
                        <div className="analytics-list-main">
                          <strong>{expense.merchant || expense.category_name}</strong>
                          <small>
                            {' '}
                            · {expense.category_name} · {expense.payment_mode_display}
                            {expense.is_recurring ? ' · Recurring' : ''}
                          </small>
                        </div>
                        <strong>{formatMoney(expense.amount)}</strong>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}