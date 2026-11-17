import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  ReferenceLine,
} from 'recharts'
import { useAuth } from '../AuthContext'
import { useCurrency, CURRENCIES } from '../CurrencyContext'
import { CATEGORY_COLORS, nextCategoryColor } from '../categoryColors'
import api from '../api'

const BUCKET_COLORS = {
  essentials: '#2563eb',    // Blue
  investment: '#16a34a',    // Green
  miscellaneous: '#eab308', // Yellow
}

function BucketRow({ label, spent, budget_limit, formatMoney }) {
  const pct = budget_limit ? Math.min((spent / budget_limit) * 100, 100) : 0
  const over = budget_limit && spent > budget_limit
  return (
    <div className="bucket">
      <div className="bucket-top">
        <strong>{label}</strong>
        <span>
          {formatMoney(spent)}
          {budget_limit ? ` / ${formatMoney(budget_limit)}` : ' (no budget set)'}
        </span>
      </div>
      {budget_limit > 0 && (
        <div className="bar">
          <div className={`bar-fill ${over ? 'over' : ''}`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { currency, setCurrency, formatMoney, toINR, rateMeta, nprPerInr } = useCurrency()

  const [data, setData] = useState(null)
  const [categories, setCategories] = useState([])
  const [allExpenses, setAllExpenses] = useState([])
  const [error, setError] = useState('')

  const [showIncomeForm, setShowIncomeForm] = useState(false)
  const [showExpenseForm, setShowExpenseForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const [incomeForm, setIncomeForm] = useState({
    source: '',
    amount: '',
    date_received: new Date().toISOString().slice(0, 10),
    is_recurring: false,
  })

  const [expenseForm, setExpenseForm] = useState({
    category: '',
    customCategoryName: '',
    customBucket: 'essentials',
    customColor: '',
    amount: '',
    merchant: '',
    payment_mode: 'online',
    is_recurring: false,
    recurrence_interval: 1,
    recurrence_unit: 'month',
    spent_at: new Date().toISOString().slice(0, 16),
  })

  const loadDashboard = useCallback(
    async (ignore = false) => {
      try {
        const [dashRes, catRes, expRes] = await Promise.all([
          api.get('/dashboard/'),
          api.get('/categories/'),
          api.get('/expenses/'),
        ])
        if (ignore) return

        setData(dashRes.data)
        const catList = Array.isArray(catRes.data) ? catRes.data : catRes.data.results || []
        const expList = Array.isArray(expRes.data) ? expRes.data : expRes.data.results || []
        setCategories(catList)
        setAllExpenses(expList)

        if (catList.length > 0) {
          setExpenseForm((prev) => ({
            ...prev,
            category: prev.category || String(catList[0].id),
          }))
        }
      } catch (err) {
        if (ignore) return
        if (err.response?.status === 401) {
          logout()
          navigate('/login', { replace: true })
        } else {
          setError("Couldn't load dashboard data.")
        }
      }
    },
    [logout, navigate]
  )

  useEffect(() => {
    let ignore = false
    loadDashboard(ignore)
    return () => {
      ignore = true
    }
  }, [loadDashboard])

  const handleAddIncome = async (e) => {
    e.preventDefault()
    setSaving(true)
    setFormError('')
    try {
      await api.post('/incomes/', {
        ...incomeForm,
        amount: toINR(parseFloat(incomeForm.amount)),
      })
      setIncomeForm({
        source: '',
        amount: '',
        date_received: new Date().toISOString().slice(0, 10),
        is_recurring: false,
      })
      setShowIncomeForm(false)
      await loadDashboard()
    } catch {
      setFormError('Failed to save income. Check all fields.')
    } finally {
      setSaving(false)
    }
  }

  const handleAddExpense = async (e) => {
    e.preventDefault()
    setSaving(true)
    setFormError('')
    try {
      let categoryId = expenseForm.category

      if (categoryId === '__custom__' || !categoryId) {
        const nameToUse =
          expenseForm.customCategoryName.trim() ||
          expenseForm.customBucket.charAt(0).toUpperCase() + expenseForm.customBucket.slice(1)
        const existing = categories.find(
          (c) => c.name.toLowerCase() === nameToUse.toLowerCase()
        )
        if (existing) {
          categoryId = String(existing.id)
        } else {
          const catRes = await api.post('/categories/', {
            name: nameToUse,
            bucket: expenseForm.customBucket,
            color:
              expenseForm.customColor ||
              nextCategoryColor(categories.map((c) => c.color)),
          })
          categoryId = String(catRes.data.id)
        }
      }

      await api.post('/expenses/', {
        category: categoryId,
        amount: toINR(parseFloat(expenseForm.amount)),
        merchant: expenseForm.merchant,
        payment_mode: expenseForm.payment_mode,
        is_recurring: expenseForm.is_recurring,
        recurrence_interval: expenseForm.is_recurring
          ? Number(expenseForm.recurrence_interval) || 1
          : 1,
        recurrence_unit: expenseForm.recurrence_unit,
        spent_at: new Date(expenseForm.spent_at).toISOString(),
      })

      setExpenseForm((prev) => ({
        ...prev,
        amount: '',
        merchant: '',
        customCategoryName: '',
        customColor: '',
        category: categoryId,
        spent_at: new Date().toISOString().slice(0, 16),
      }))
      setShowExpenseForm(false)
      await loadDashboard()
    } catch {
      setFormError('Failed to save expense. Check all fields.')
    } finally {
      setSaving(false)
    }
  }

  const summary = data?.summary || {
    total_income: 0,
    total_expense: 0,
    net_savings: 0,
    recurring_total: 0,
    one_time_total: 0,
    recurring_count: 0,
  }
  const budgets = data?.budget_comparison || []
  const recurringExpenses = data?.recurring_expenses || []
  const incomes = data?.income_by_source || []
  const recentExpenses = data?.recent_expenses || []

  // Pie chart data: Essentials (Blue), Investment (Green), Miscellaneous (Yellow)
  const pieData = budgets
    .map((b) => ({
      bucket: b.bucket,
      name: b.label,
      value: Number(b.spent || 0),
      color: BUCKET_COLORS[b.bucket] || '#6b7280',
    }))
    .filter((item) => item.value > 0)

  // Daily budget & daily spend series for the Balance card graph
  const { dailyBudgetData, dailyBudgetTarget, hasDailyData } = useMemo(() => {
    if (!data?.month) {
      return { dailyBudgetData: [], dailyBudgetTarget: 0, hasDailyData: false }
    }

    const [yearStr, monthStr] = data.month.split('-')
    const year = Number(yearStr)
    const month = Number(monthStr)
    const daysInMonth = new Date(year, month, 0).getDate()

    const totalMonthlyBudget = budgets.reduce(
      (sum, b) => sum + Number(b.budget_limit || 0),
      0
    )
    const dailyAllowance = totalMonthlyBudget > 0 ? totalMonthlyBudget / daysInMonth : 0

    // Sum expenses per day of the active month
    const spendByDay = {}
    allExpenses.forEach((exp) => {
      const dt = new Date(exp.spent_at)
      if (dt.getFullYear() === year && dt.getMonth() + 1 === month) {
        const day = dt.getDate()
        spendByDay[day] = (spendByDay[day] || 0) + Number(exp.amount || 0)
      }
    })

    const today = new Date()
    const isCurrentMonth =
      today.getFullYear() === year && today.getMonth() + 1 === month
    const lastDayToPlot = isCurrentMonth ? today.getDate() : daysInMonth

    const series = []
    for (let d = 1; d <= lastDayToPlot; d++) {
      const spent = spendByDay[d] || 0
      series.push({
        day: `${d}`,
        spent,
        dailyBudget: Number(dailyAllowance.toFixed(2)),
        remainingDaily: Number((dailyAllowance - spent).toFixed(2)),
      })
    }

    return {
      dailyBudgetData: series,
      dailyBudgetTarget: dailyAllowance,
      hasDailyData: totalMonthlyBudget > 0 || Object.keys(spendByDay).length > 0,
    }
  }, [data?.month, budgets, allExpenses])

  return (
    <div className="dashboard">
      <header>
        <div>
          <h1>Finance Tracker</h1>
          {data && <small>{data.month}</small>}
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
          <button type="button" onClick={() => navigate('/analytics')}>
            Analytics
          </button>
          <button type="button" onClick={() => navigate('/transactions')}>
            Set Budgets / Full Form
          </button>
          {user && <span className="greeting">Hi, {user.username}</span>}
          <button type="button" className="logout" onClick={logout}>
            Log out
          </button>
        </div>
      </header>

      <p className="hint">
        Amounts are stored in INR and converted for display at the current NPR/INR rate
        {` (1 INR = ${Number(nprPerInr).toFixed(2)} NPR).`}
        {rateMeta.source === 'fallback' ? ' Using an offline fallback rate.' : ''}
      </p>

      {error && <p className="error">{error}</p>}
      {formError && <p className="error" style={{ marginBottom: '1rem' }}>{formError}</p>}
      {!data && !error && <p className="loading">Loading...</p>}

      {data && (
        <>
          <div className="stats">
            <div className="card">
              <div style={styles.statHeader}>
                <h3 style={{ margin: 0 }}>Income</h3>
                <button
                  type="button"
                  style={styles.statBtn}
                  onClick={() => navigate('/incomes')}
                >
                  More →
                </button>
              </div>
              <p>{formatMoney(summary.total_income)}</p>
            </div>

            <div className="card">
              <div style={styles.statHeader}>
                <h3 style={{ margin: 0 }}>Expenses</h3>
                <button
                  type="button"
                  style={styles.statBtn}
                  onClick={() => navigate('/expenses')}
                >
                  More →
                </button>
              </div>
              <p>{formatMoney(summary.total_expense)}</p>

              {/* Expense Breakdown Pie Chart */}
              {pieData.length > 0 ? (
                <div style={styles.pieWrapper}>
                  <div style={{ width: '100%', height: 130 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={28}
                          outerRadius={52}
                          paddingAngle={2}
                        >
                          {pieData.map((entry) => (
                            <Cell key={entry.bucket} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value) => formatMoney(value)} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  <div style={styles.pieLegend}>
                    {budgets.map((b) => (
                      <div key={b.bucket} style={styles.legendItem}>
                        <span
                          style={{
                            ...styles.legendDot,
                            backgroundColor: BUCKET_COLORS[b.bucket] || '#6b7280',
                          }}
                        />
                        <span>{b.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <small style={{ color: 'var(--muted)', display: 'block', marginTop: '0.5rem' }}>
                  No expense data to chart yet.
                </small>
              )}
            </div>

            <div className="card">
              <h3>Balance</h3>
              <p className={summary.net_savings < 0 ? 'neg' : 'pos'}>
                {formatMoney(summary.net_savings)}
              </p>

              {/* Everyday Budget vs. Spend Graph */}
              {hasDailyData ? (
                <div style={styles.pieWrapper}>
                  <div style={styles.dailyHeader}>
                    <span>Daily budget</span>
                    <strong>
                      {dailyBudgetTarget > 0
                        ? `${formatMoney(dailyBudgetTarget)}/day`
                        : 'No budget set'}
                    </strong>
                  </div>

                  <div style={{ width: '100%', height: 112 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={dailyBudgetData}
                        margin={{ top: 6, right: 4, left: 4, bottom: 0 }}
                      >
                        <XAxis
                          dataKey="day"
                          tick={{ fontSize: 10, fill: '#6b7280' }}
                          axisLine={false}
                          tickLine={false}
                          interval="preserveStartEnd"
                        />
                        <Tooltip
                          labelFormatter={(day) => `Day ${day}`}
                          formatter={(value, name) => [
                            formatMoney(value),
                            name === 'spent' ? 'Spent' : 'Daily Budget',
                          ]}
                        />
                        {dailyBudgetTarget > 0 && (
                          <ReferenceLine
                            y={dailyBudgetTarget}
                            stroke="#16a34a"
                            strokeDasharray="3 3"
                          />
                        )}
                        <Area
                          type="monotone"
                          dataKey="spent"
                          stroke="#16a34a"
                          strokeWidth={2}
                          fill="#16a34a"
                          fillOpacity={0.14}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>

                  <div style={styles.pieLegend}>
                    <div style={styles.legendItem}>
                      <span style={{ ...styles.legendDot, backgroundColor: '#16a34a' }} />
                      <span>Daily spend</span>
                    </div>
                    {dailyBudgetTarget > 0 && (
                      <div style={styles.legendItem}>
                        <span style={{ ...styles.legendDot, backgroundColor: '#16a34a' }} />
                        <span>Daily limit</span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <small style={{ color: 'var(--muted)', display: 'block', marginTop: '0.5rem' }}>
                  Set a budget to see your everyday target.
                </small>
              )}
            </div>
          </div>

          <div className="grid2">
            <div className="card">
              <h3>Budgets</h3>
              {budgets.map((b) => (
                <BucketRow key={b.bucket} {...b} formatMoney={formatMoney} />
              ))}
            </div>

            <div className="card">
              <h3>Recurring / Subscriptions</h3>
              <p style={{ margin: '0 0 0.5rem', fontWeight: 600 }}>
                {formatMoney(summary.recurring_total || 0)}
                <small style={{ marginLeft: '0.4rem', fontWeight: 400 }}>
                  · {summary.recurring_count || 0} this month
                </small>
              </p>
              {recurringExpenses.length === 0 ? (
                <p style={{ margin: 0 }}>No recurring expenses this month.</p>
              ) : (
                recurringExpenses.map((exp) => (
                  <div className="row" key={exp.id}>
                    <span>
                      {exp.merchant || exp.category_name}
                      <small> · {exp.recurrence_summary}</small>
                    </span>
                    <strong>{formatMoney(exp.amount)}</strong>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* BOTTOM TWO COLUMNS: INCOME SOURCES & RECENT EXPENSES */}
          <div className="grid2">
            {/* LEFT COLUMN: INCOME SOURCES + ADD INCOME */}
            <div className="card">
              <div style={styles.cardHeader}>
                <h3 style={{ margin: 0 }}>Income sources</h3>
                <button
                  type="button"
                  style={styles.smallBtn}
                  onClick={() => {
                    setShowIncomeForm((v) => !v)
                    setFormError('')
                  }}
                >
                  {showIncomeForm ? 'Cancel' : '+ Add Income'}
                </button>
              </div>

              {showIncomeForm && (
                <form onSubmit={handleAddIncome} style={styles.inlineForm}>
                  <input
                    type="text"
                    required
                    placeholder="Source (e.g. Salary, Freelance)"
                    value={incomeForm.source}
                    onChange={(e) => setIncomeForm({ ...incomeForm, source: e.target.value })}
                  />
                  <div className="form-grid2">
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      placeholder={`Amount (${currency})`}
                      value={incomeForm.amount}
                      onChange={(e) => setIncomeForm({ ...incomeForm, amount: e.target.value })}
                    />
                    <input
                      type="date"
                      required
                      value={incomeForm.date_received}
                      onChange={(e) =>
                        setIncomeForm({ ...incomeForm, date_received: e.target.value })
                      }
                    />
                  </div>
                  <label style={styles.checkRow}>
                    <input
                      type="checkbox"
                      checked={incomeForm.is_recurring}
                      onChange={(e) =>
                        setIncomeForm({ ...incomeForm, is_recurring: e.target.checked })
                      }
                    />
                    Recurring monthly income
                  </label>
                  <button type="submit" disabled={saving}>
                    {saving ? 'Saving...' : 'Save Income'}
                  </button>
                </form>
              )}

              {incomes.length === 0 ? (
                <p style={{ margin: 0 }}>No income recorded this month yet.</p>
              ) : (
                incomes.map((inc) => (
                  <div className="row" key={inc.source}>
                    <span>{inc.source}</span>
                    <strong>{formatMoney(inc.total)}</strong>
                  </div>
                ))
              )}
            </div>

            {/* RIGHT COLUMN: RECENT EXPENSES + ADD EXPENSE */}
            <div className="card">
              <div style={styles.cardHeader}>
                <h3 style={{ margin: 0 }}>Recent expenses</h3>
                <button
                  type="button"
                  style={styles.smallBtn}
                  onClick={() => {
                    setShowExpenseForm((v) => !v)
                    setFormError('')
                  }}
                >
                  {showExpenseForm ? 'Cancel' : '+ Add Expense'}
                </button>
              </div>

              {showExpenseForm && (
                <form onSubmit={handleAddExpense} style={styles.inlineForm}>
                  <div className="form-grid2">
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      placeholder={`Amount spent (${currency})`}
                      value={expenseForm.amount}
                      onChange={(e) =>
                        setExpenseForm({ ...expenseForm, amount: e.target.value })
                      }
                    />
                    <select
                      required
                      value={expenseForm.category}
                      onChange={(e) =>
                        setExpenseForm({ ...expenseForm, category: e.target.value })
                      }
                    >
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name} ({cat.bucket})
                        </option>
                      ))}
                      <option value="__custom__">+ New Category...</option>
                    </select>
                  </div>

                  {(expenseForm.category === '__custom__' || categories.length === 0) && (
                    <>
                      <div className="form-grid2">
                        <input
                          type="text"
                          required
                          placeholder="Category name (e.g. Food, Rent)"
                          value={expenseForm.customCategoryName}
                          onChange={(e) =>
                            setExpenseForm({
                              ...expenseForm,
                              customCategoryName: e.target.value,
                            })
                          }
                        />
                        <select
                          value={expenseForm.customBucket}
                          onChange={(e) =>
                            setExpenseForm({
                              ...expenseForm,
                              customBucket: e.target.value,
                            })
                          }
                        >
                          <option value="essentials">Essentials</option>
                          <option value="investment">Investment</option>
                          <option value="miscellaneous">Miscellaneous</option>
                        </select>
                      </div>
                      <input
                        type="color"
                        aria-label="Category color"
                        value={
                          expenseForm.customColor ||
                          nextCategoryColor(categories.map((c) => c.color))
                        }
                        onChange={(e) =>
                          setExpenseForm({
                            ...expenseForm,
                            customColor: e.target.value,
                          })
                        }
                        style={styles.colorInput}
                      />
                      <div style={styles.swatchRow}>
                        {CATEGORY_COLORS.map((color) => (
                          <button
                            key={color}
                            type="button"
                            aria-label={`Use color ${color}`}
                            onClick={() =>
                              setExpenseForm({ ...expenseForm, customColor: color })
                            }
                            style={{
                              ...styles.swatch,
                              background: color,
                              borderColor:
                                expenseForm.customColor === color
                                  ? '#0f172a'
                                  : 'transparent',
                            }}
                          />
                        ))}
                      </div>
                    </>
                  )}

                  <input
                    type="text"
                    placeholder="What did you spend on? (optional)"
                    value={expenseForm.merchant}
                    onChange={(e) =>
                      setExpenseForm({ ...expenseForm, merchant: e.target.value })
                    }
                  />

                  <label style={styles.checkRow}>
                    <input
                      type="checkbox"
                      checked={expenseForm.is_recurring}
                      onChange={(e) =>
                        setExpenseForm({ ...expenseForm, is_recurring: e.target.checked })
                      }
                    />
                    Recurring / Subscription
                  </label>

                  {expenseForm.is_recurring && (
                    <div className="form-grid2">
                      <input
                        type="number"
                        min="1"
                        step="1"
                        required
                        placeholder="Every N"
                        value={expenseForm.recurrence_interval}
                        onChange={(e) =>
                          setExpenseForm({
                            ...expenseForm,
                            recurrence_interval: e.target.value,
                          })
                        }
                      />
                      <select
                        value={expenseForm.recurrence_unit}
                        onChange={(e) =>
                          setExpenseForm({ ...expenseForm, recurrence_unit: e.target.value })
                        }
                      >
                        <option value="day">Day(s)</option>
                        <option value="month">Month(s)</option>
                        <option value="year">Year(s)</option>
                      </select>
                    </div>
                  )}

                  <div className="form-grid2">
                    <select
                      value={expenseForm.payment_mode}
                      onChange={(e) =>
                        setExpenseForm({ ...expenseForm, payment_mode: e.target.value })
                      }
                    >
                      <option value="cash">Cash</option>
                      <option value="card">Card</option>
                      <option value="netbanking">Net Banking</option>
                      <option value="online">Online Payment</option>
                    </select>
                    <input
                      type="datetime-local"
                      required
                      value={expenseForm.spent_at}
                      onChange={(e) =>
                        setExpenseForm({ ...expenseForm, spent_at: e.target.value })
                      }
                    />
                  </div>

                  <button type="submit" disabled={saving}>
                    {saving ? 'Saving...' : 'Save Expense'}
                  </button>
                </form>
              )}

              {recentExpenses.length === 0 ? (
                <p style={{ margin: 0 }}>No expenses this month yet.</p>
              ) : (
                recentExpenses.map((t) => (
                  <div className="row" key={t.id}>
                    <span>
                      <span
                        className="legend-dot"
                        style={{ background: t.category_color || '#6b7280' }}
                      />
                      {t.merchant || t.notes || t.category_name}
                      <small>
                        {' '}
                        · {t.category_name} ·{' '}
                        {t.is_recurring ? t.recurrence_summary : 'One-time'} ·{' '}
                        {t.payment_mode_display}
                      </small>
                    </span>
                    <span>
                      {formatMoney(t.amount)}{' '}
                      <small>{new Date(t.spent_at).toLocaleDateString()}</small>
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

const styles = {
  statHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '0.5rem',
  },
  statBtn: {
    padding: '0.25rem 0.6rem',
    fontSize: '0.8rem',
  },
  pieWrapper: {
    marginTop: '0.75rem',
    paddingTop: '0.65rem',
    borderTop: '1px solid var(--border)',
  },
  dailyHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '0.75rem',
    color: 'var(--muted)',
    marginBottom: '0.25rem',
  },
  pieLegend: {
    display: 'flex',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: '0.4rem',
    marginTop: '0.35rem',
    fontSize: '0.75rem',
    color: 'var(--text)',
  },
  legendItem: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.3rem',
  },
  legendDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    display: 'inline-block',
    flexShrink: 0,
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '0.85rem',
  },
  smallBtn: {
    padding: '0.35rem 0.7rem',
    fontSize: '0.85rem',
  },
  inlineForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.6rem',
    padding: '0.85rem',
    marginBottom: '1rem',
    backgroundColor: '#f8fafc',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
  },
  twoCol: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '0.5rem',
  },
  checkRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.45rem',
    fontSize: '0.85rem',
    color: '#374151',
  },
  colorInput: {
    padding: '0.2rem',
    width: '100%',
    height: '40px',
    border: '1px solid #e5e7eb',
    borderRadius: '6px',
    background: '#ffffff',
    cursor: 'pointer',
  },
  swatchRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.4rem',
  },
  swatch: {
    width: '24px',
    height: '24px',
    padding: 0,
    borderRadius: '50%',
    border: '2px solid transparent',
    cursor: 'pointer',
  },
}