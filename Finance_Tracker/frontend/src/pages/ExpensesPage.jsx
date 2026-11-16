import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { useCurrency, CURRENCIES } from '../CurrencyContext'
import api from '../api'

export default function ExpensesPage() {
  const navigate = useNavigate()
  const { logout } = useAuth()
  const { currency, setCurrency, formatMoney } = useCurrency()

  const [expenses, setExpenses] = useState([])
  const [categories, setCategories] = useState([])
  const [habitFilter, setHabitFilter] = useState('all')
  const [showNewCat, setShowNewCat] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [newCat, setNewCat] = useState({ name: '', bucket: 'essentials' })
  const [form, setForm] = useState({
    category: '',
    amount: '',
    merchant: '',
    payment_mode: 'upi',
    habit_tag: 'planned',
    spent_at: new Date().toISOString().slice(0, 16),
    notes: '',
  })

  const fetchData = useCallback(async () => {
    try {
      const [expRes, catRes] = await Promise.all([
        api.get('/expenses/'),
        api.get('/categories/'),
      ])
      const expList = Array.isArray(expRes.data) ? expRes.data : expRes.data.results || []
      const catList = Array.isArray(catRes.data) ? catRes.data : catRes.data.results || []

      setExpenses(expList)
      setCategories(catList)
      if (catList.length > 0) {
        setForm((prev) => ({ ...prev, category: prev.category || String(catList[0].id) }))
      } else {
        setShowNewCat(true)
      }
    } catch (err) {
      if (err.response?.status === 401) {
        logout()
        navigate('/login', { replace: true })
      } else {
        setError('Could not load expense details.')
      }
    } finally {
      setLoading(false)
    }
  }, [logout, navigate])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleCreateCategory = async (e) => {
    e.preventDefault()
    if (!newCat.name.trim()) return
    setSaving(true)
    setError('')
    try {
      const res = await api.post('/categories/', newCat)
      setCategories((prev) => [...prev, res.data])
      setForm((prev) => ({ ...prev, category: String(res.data.id) }))
      setNewCat({ name: '', bucket: 'essentials' })
      setShowNewCat(false)
      setSuccess(`Category "${res.data.name}" created.`)
    } catch {
      setError('Could not create category (it may already exist).')
    } finally {
      setSaving(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')

    try {
      const res = await api.post('/expenses/', {
        ...form,
        amount: parseFloat(form.amount),
        spent_at: new Date(form.spent_at).toISOString(),
      })
      setExpenses((prev) => [res.data, ...prev])
      setForm((prev) => ({
        ...prev,
        amount: '',
        merchant: '',
        spent_at: new Date().toISOString().slice(0, 16),
        notes: '',
      }))
      setSuccess('Expense added successfully.')
    } catch {
      setError('Failed to add expense. Make sure a category is selected.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    try {
      await api.delete(`/expenses/${id}/`)
      setExpenses((prev) => prev.filter((item) => item.id !== id))
    } catch {
      setError('Could not delete expense entry.')
    }
  }

  const totalSpent = expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0)
  const impulseSpent = expenses
    .filter((item) => item.habit_tag === 'impulse')
    .reduce((sum, item) => sum + Number(item.amount || 0), 0)
  const recurringSpent = expenses
    .filter((item) => item.habit_tag === 'recurring')
    .reduce((sum, item) => sum + Number(item.amount || 0), 0)

  const filteredExpenses =
    habitFilter === 'all'
      ? expenses
      : expenses.filter((item) => item.habit_tag === habitFilter)

  return (
    <div className="dashboard">
      <header>
        <div>
          <h1>Expense Details</h1>
          <small>Log expenses and inspect spending habits</small>
        </div>
        <div className="header-actions">
          <div className="currency-switch" role="group" aria-label="Display currency">
            {Object.keys(CURRENCIES).map((code) => (
              <button
                key={code}
                type="button"
                className={currency === code ? 'active' : ''}
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

      {error && <p className="error" style={{ marginBottom: '1rem' }}>{error}</p>}
      {success && <p className="success" style={{ marginBottom: '1rem' }}>{success}</p>}

      {/* Summary Stats */}
      <div className="stats">
        <div className="card">
          <h3>Total Recorded Expenses</h3>
          <p className="neg">{formatMoney(totalSpent)}</p>
        </div>
        <div className="card">
          <h3>Recurring / Subscriptions</h3>
          <p>{formatMoney(recurringSpent)}</p>
        </div>
        <div className="card">
          <h3>Impulse / Unplanned</h3>
          <p>{formatMoney(impulseSpent)}</p>
        </div>
      </div>

      {/* Add Expense Form + Detailed History */}
      <div className="grid2">
        <div className="card">
          <div style={styles.cardHeader}>
            <h3 style={{ margin: 0 }}>Add New Expense</h3>
            {categories.length > 0 && (
              <button
                type="button"
                className="logout"
                style={styles.smallBtn}
                onClick={() => setShowNewCat((v) => !v)}
              >
                {showNewCat ? 'Back to Expense' : '+ New Category'}
              </button>
            )}
          </div>

          {showNewCat ? (
            <form onSubmit={handleCreateCategory} style={styles.form}>
              <label style={styles.label}>
                Category Name
                <input
                  type="text"
                  required
                  placeholder="e.g., Groceries, Mutual Fund SIP, Dining"
                  value={newCat.name}
                  onChange={(e) => setNewCat({ ...newCat, name: e.target.value })}
                />
              </label>

              <label style={styles.label}>
                Bucket
                <select
                  value={newCat.bucket}
                  onChange={(e) => setNewCat({ ...newCat, bucket: e.target.value })}
                >
                  <option value="essentials">Essentials</option>
                  <option value="investment">Investment</option>
                  <option value="miscellaneous">Miscellaneous</option>
                </select>
              </label>

              <button type="submit" disabled={saving}>
                {saving ? 'Saving...' : 'Create Category'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} style={styles.form}>
              <label style={styles.label}>
                Category
                <select
                  required
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                >
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name} ({cat.bucket})
                    </option>
                  ))}
                </select>
              </label>

              <div style={styles.twoCol}>
                <label style={styles.label}>
                  Amount
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="0.00"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  />
                </label>

                <label style={styles.label}>
                  Spending Habit
                  <select
                    value={form.habit_tag}
                    onChange={(e) => setForm({ ...form, habit_tag: e.target.value })}
                  >
                    <option value="planned">Planned</option>
                    <option value="recurring">Recurring / Subscription</option>
                    <option value="impulse">Impulse / Unplanned</option>
                  </select>
                </label>
              </div>

              <div style={styles.twoCol}>
                <label style={styles.label}>
                  Merchant / Vendor
                  <input
                    type="text"
                    placeholder="e.g., BigBasket, Swiggy"
                    value={form.merchant}
                    onChange={(e) => setForm({ ...form, merchant: e.target.value })}
                  />
                </label>

                <label style={styles.label}>
                  Payment Mode
                  <select
                    value={form.payment_mode}
                    onChange={(e) => setForm({ ...form, payment_mode: e.target.value })}
                  >
                    <option value="upi">UPI</option>
                    <option value="card">Card</option>
                    <option value="cash">Cash</option>
                    <option value="netbanking">Net Banking</option>
                  </select>
                </label>
              </div>

              <label style={styles.label}>
                Date & Time
                <input
                  type="datetime-local"
                  required
                  value={form.spent_at}
                  onChange={(e) => setForm({ ...form, spent_at: e.target.value })}
                />
              </label>

              <label style={styles.label}>
                Notes
                <textarea
                  rows="2"
                  placeholder="Optional description..."
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </label>

              <button type="submit" disabled={saving || categories.length === 0}>
                {saving ? 'Saving...' : 'Save Expense'}
              </button>
            </form>
          )}
        </div>

        <div className="card">
          <div style={styles.cardHeader}>
            <h3 style={{ margin: 0 }}>All Expenses ({filteredExpenses.length})</h3>
            <select
              value={habitFilter}
              onChange={(e) => setHabitFilter(e.target.value)}
              style={{ padding: '0.3rem 0.55rem', fontSize: '0.85rem' }}
            >
              <option value="all">All Habits</option>
              <option value="planned">Planned</option>
              <option value="recurring">Recurring</option>
              <option value="impulse">Impulse</option>
            </select>
          </div>

          {loading ? (
            <p className="loading">Loading...</p>
          ) : filteredExpenses.length === 0 ? (
            <p style={{ margin: 0 }}>No expense entries found.</p>
          ) : (
            filteredExpenses.map((exp) => (
              <div className="row" key={exp.id} style={{ alignItems: 'center' }}>
                <div>
                  <div>
                    <strong>{exp.merchant || exp.category_name}</strong>
                    <small style={styles.badge}>{exp.habit_tag_display}</small>
                  </div>
                  <small>
                    {exp.category_name} ({exp.category_bucket}) · {exp.payment_mode_display} ·{' '}
                    {new Date(exp.spent_at).toLocaleString()}
                    {exp.notes ? ` · ${exp.notes}` : ''}
                  </small>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                  <strong style={{ color: 'var(--danger)' }}>
                    {formatMoney(exp.amount)}
                  </strong>
                  <button
                    type="button"
                    className="logout"
                    style={styles.deleteBtn}
                    title="Delete expense"
                    onClick={() => handleDelete(exp.id)}
                  >
                    ×
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

const styles = {
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '0.5rem',
    marginBottom: '0.85rem',
  },
  smallBtn: {
    padding: '0.3rem 0.65rem',
    fontSize: '0.82rem',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.3rem',
    fontSize: '0.85rem',
    fontWeight: 600,
    color: 'var(--text)',
  },
  twoCol: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '0.6rem',
  },
  badge: {
    backgroundColor: '#eff6ff',
    color: '#2563eb',
    padding: '0.1rem 0.45rem',
    borderRadius: '999px',
    fontWeight: 600,
    marginLeft: '0.4rem',
  },
  deleteBtn: {
    padding: '0.15rem 0.5rem',
    fontSize: '0.95rem',
    lineHeight: 1.2,
  },
}