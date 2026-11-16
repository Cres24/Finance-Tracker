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

  // Toggle inline forms inside their respective columns
  const [showIncomeForm, setShowIncomeForm] = useState(false)
  const [showExpenseForm, setShowExpenseForm] = useState(false)
  const [showNewCat, setShowNewCat] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  // Income form state
  const [incomeForm, setIncomeForm] = useState({
    source: '',
    amount: '',
    date_received: new Date().toISOString().slice(0, 10),
    is_recurring: false,
  })

  // Quick category state (if user has no categories yet)
  const [newCat, setNewCat] = useState({ name: '', bucket: 'essentials' })

  // Expense form state
  const [expenseForm, setExpenseForm] = useState({
    category: '',
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
        } else {
          setShowNewCat(true)
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

  const handleCreateCategory = async (e) => {
    e.preventDefault()
    if (!newCat.name.trim()) return
    setSaving(true)
    setFormError('')
    try {
      const res = await api.post('/categories/', newCat)
      setCategories((prev) => [...prev, res.data])
      setExpenseForm((prev) => ({ ...prev, category: String(res.data.id) }))
      setNewCat({ name: '', bucket: 'essentials' })
      setShowNewCat(false)
    } catch {
      setFormError('Could not create category (it may already exist).')
    } finally {
      setSaving(false)
    }
  }

  const handleAddExpense = async (e) => {
    e.preventDefault()
    setSaving(true)
    setFormError('')
    try {
      await api.post('/expenses/', {
        ...expenseForm,
        amount: parseFloat(expenseForm.amount),
        spent_at: new Date(expenseForm.spent_at).toISOString(),
      })
      setExpenseForm((prev) => ({
        ...prev,
        amount: '',
        merchant: '',
        spent_at: new Date().toISOString().slice(0, 16),
      }))
      setShowExpenseForm(false)
      await loadDashboard()
    } catch {
      setFormError('Failed to save expense. Make sure a category is selected.')
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
              <h3>Income</h3>
              <p>{formatMoney(summary.total_income)}</p>
            </div>
            <div className="card">
              <h3>Expenses</h3>
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
                <div style={styles.inlineForm}>
                  {/* Quick category creator if none exist or user clicks "+ New Category" */}
                  {showNewCat ? (
                    <form onSubmit={handleCreateCategory} style={styles.catBox}>
                      <small>
                        <strong>Create a category first:</strong>
                      </small>
                      <div style={styles.twoCol}>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Groceries, SIP"
                          value={newCat.name}
                          onChange={(e) => setNewCat({ ...newCat, name: e.target.value })}
                        />
                        <select
                          value={newCat.bucket}
                          onChange={(e) => setNewCat({ ...newCat, bucket: e.target.value })}
                        >
                          <option value="essentials">Essentials</option>
                          <option value="investment">Investment</option>
                          <option value="miscellaneous">Miscellaneous</option>
                        </select>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button type="submit" disabled={saving} style={styles.smallBtn}>
                          Save Category
                        </button>
                        {categories.length > 0 && (
                          <button
                            type="button"
                            className="logout"
                            style={styles.smallBtn}
                            onClick={() => setShowNewCat(false)}
                          >
                            Back
                          </button>
                        )}
                      </div>
                    </form>
                  ) : (
                    <form onSubmit={handleAddExpense} style={styles.inlineFormInner}>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <select
                          required
                          style={{ flex: 1 }}
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
                        </select>
                        <button
                          type="button"
                          className="logout"
                          style={styles.smallBtn}
                          onClick={() => setShowNewCat(true)}
                        >
                          + Cat
                        </button>
                      </div>

                      <div style={styles.twoCol}>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          required
                          placeholder="Amount"
                          value={expenseForm.amount}
                          onChange={(e) =>
                            setExpenseForm({ ...expenseForm, amount: e.target.value })
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
                        <input
                          type="text"
                          placeholder="Merchant (optional)"
                          value={expenseForm.merchant}
                          onChange={(e) =>
                            setExpenseForm({ ...expenseForm, merchant: e.target.value })
                          }
                        />
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
                      </div>

                      <input
                        type="datetime-local"
                        required
                        value={expenseForm.spent_at}
                        onChange={(e) =>
                          setExpenseForm({ ...expenseForm, spent_at: e.target.value })
                        }
                      />

                      <button type="submit" disabled={saving || categories.length === 0}>
                        {saving ? 'Saving...' : 'Save Expense'}
                      </button>
                    </form>
                  )}
                </div>
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
  inlineFormInner: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.6rem',
  },
  catBox: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
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