import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { useCurrency, CURRENCIES } from '../CurrencyContext'
import api from '../api'

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
  const { currency, setCurrency, formatMoney } = useCurrency()

  const [data, setData] = useState(null)
  const [categories, setCategories] = useState([])
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
    amount: '',
    merchant: '',
    payment_mode: 'upi',
    habit_tag: 'planned',
    spent_at: new Date().toISOString().slice(0, 16),
  })

  const loadDashboard = useCallback(
    async (ignore = false) => {
      try {
        const [dashRes, catRes] = await Promise.all([
          api.get('/dashboard/'),
          api.get('/categories/'),
        ])
        if (ignore) return

        setData(dashRes.data)
        const catList = Array.isArray(catRes.data) ? catRes.data : catRes.data.results || []
        setCategories(catList)
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
        amount: parseFloat(incomeForm.amount),
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

      // If user chose "+ Custom category..." or no category ID exists yet, create it seamlessly first
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
          })
          categoryId = String(catRes.data.id)
        }
      }

      await api.post('/expenses/', {
        category: categoryId,
        amount: parseFloat(expenseForm.amount),
        merchant: expenseForm.merchant,
        payment_mode: expenseForm.payment_mode,
        habit_tag: expenseForm.habit_tag,
        spent_at: new Date(expenseForm.spent_at).toISOString(),
      })

      setExpenseForm((prev) => ({
        ...prev,
        amount: '',
        merchant: '',
        customCategoryName: '',
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

  const summary = data?.summary || { total_income: 0, total_expense: 0, net_savings: 0 }
  const budgets = data?.budget_comparison || []
  const habits = data?.habit_breakdown || []
  const incomes = data?.income_by_source || []
  const recentExpenses = data?.recent_expenses || []

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
          <button type="button" onClick={() => navigate('/transactions')}>
            Set Budgets / Full Form
          </button>
          {user && <span className="greeting">Hi, {user.username}</span>}
          <button type="button" className="logout" onClick={logout}>
            Log out
          </button>
        </div>
      </header>

      <p className="hint">Switching currency changes how amounts are displayed; it does not convert them.</p>

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
            </div>
            <div className="card">
              <h3>Balance</h3>
              <p className={summary.net_savings < 0 ? 'neg' : 'pos'}>
                {formatMoney(summary.net_savings)}
              </p>
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
              <h3>Spending habits</h3>
              {habits.map((h) => (
                <div className="row" key={h.habit_tag}>
                  <span>{h.label}</span>
                  <strong>{formatMoney(h.total)}</strong>
                </div>
              ))}
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
                  <div style={styles.twoCol}>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      placeholder="Amount"
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
                  <div style={styles.twoCol}>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      placeholder="Amount spent"
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
                    <div style={styles.twoCol}>
                      <input
                        type="text"
                        required
                        placeholder="Category name (e.g. Food, Rent)"
                        value={expenseForm.customCategoryName}
                        onChange={(e) =>
                          setExpenseForm({ ...expenseForm, customCategoryName: e.target.value })
                        }
                      />
                      <select
                        value={expenseForm.customBucket}
                        onChange={(e) =>
                          setExpenseForm({ ...expenseForm, customBucket: e.target.value })
                        }
                      >
                        <option value="essentials">Essentials</option>
                        <option value="investment">Investment</option>
                        <option value="miscellaneous">Miscellaneous</option>
                      </select>
                    </div>
                  )}

                  <div style={styles.twoCol}>
                    <input
                      type="text"
                      placeholder="What did you spend on? (optional)"
                      value={expenseForm.merchant}
                      onChange={(e) =>
                        setExpenseForm({ ...expenseForm, merchant: e.target.value })
                      }
                    />
                    <select
                      value={expenseForm.habit_tag}
                      onChange={(e) =>
                        setExpenseForm({ ...expenseForm, habit_tag: e.target.value })
                      }
                    >
                      <option value="planned">Planned</option>
                      <option value="recurring">Recurring / Subscription</option>
                      <option value="impulse">Impulse / Unplanned</option>
                    </select>
                  </div>

                  <div style={styles.twoCol}>
                    <select
                      value={expenseForm.payment_mode}
                      onChange={(e) =>
                        setExpenseForm({ ...expenseForm, payment_mode: e.target.value })
                      }
                    >
                      <option value="upi">UPI</option>
                      <option value="card">Card</option>
                      <option value="cash">Cash</option>
                      <option value="netbanking">Net Banking</option>
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
                      {t.merchant || t.notes || t.category_name}
                      <small>
                        {' '}
                        · {t.category_name} · {t.habit_tag_display} · {t.payment_mode_display}
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
}