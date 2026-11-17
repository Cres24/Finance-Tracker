import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { useCurrency, CURRENCIES } from '../CurrencyContext'
import { CATEGORY_COLORS, nextCategoryColor } from '../categoryColors'
import api from '../api'

export default function ExpensesPage() {
  const navigate = useNavigate()
  const { logout } = useAuth()
  const { currency, setCurrency, formatMoney, toINR } = useCurrency()

  const [expenses, setExpenses] = useState([])
  const [categories, setCategories] = useState([])
  const [recurringFilter, setRecurringFilter] = useState('all')
  const [showNewCat, setShowNewCat] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [newCat, setNewCat] = useState({ name: '', bucket: 'essentials', color: '' })
  const [form, setForm] = useState({
    category: '',
    amount: '',
    merchant: '',
    payment_mode: 'online',
    is_recurring: false,
    recurrence_interval: 1,
    recurrence_unit: 'month',
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
      const res = await api.post('/categories/', {
        ...newCat,
        color: newCat.color || nextCategoryColor(categories.map((cat) => cat.color)),
      })
      setCategories((prev) => [...prev, res.data])
      setForm((prev) => ({ ...prev, category: String(res.data.id) }))
      setNewCat({ name: '', bucket: 'essentials', color: '' })
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
        amount: toINR(parseFloat(form.amount)),
        recurrence_interval: form.is_recurring
          ? Number(form.recurrence_interval) || 1
          : 1,
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
  const recurringSpent = expenses
    .filter((item) => item.is_recurring)
    .reduce((sum, item) => sum + Number(item.amount || 0), 0)
  const oneTimeSpent = totalSpent - recurringSpent

  const filteredExpenses =
    recurringFilter === 'all'
      ? expenses
      : expenses.filter((item) =>
          recurringFilter === 'recurring' ? item.is_recurring : !item.is_recurring,
        )

  return (
    <div className="dashboard">
      <header>
        <div>
          <h1>Expense Details</h1>
          <small>Log expenses and manage recurring subscriptions</small>
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
          <h3>One-time Expenses</h3>
          <p>{formatMoney(oneTimeSpent)}</p>
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

              <label style={styles.label}>
                Category Color
                <input
                  type="color"
                  value={
                    newCat.color ||
                    nextCategoryColor(categories.map((cat) => cat.color))
                  }
                  onChange={(e) => setNewCat({ ...newCat, color: e.target.value })}
                  style={styles.colorInput}
                />
              </label>

              <div style={styles.swatchRow}>
                {CATEGORY_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={`Use color ${color}`}
                    onClick={() => setNewCat({ ...newCat, color })}
                    style={{
                      ...styles.swatch,
                      background: color,
                      borderColor: newCat.color === color ? '#0f172a' : 'transparent',
                    }}
                  />
                ))}
              </div>

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

              <div className="form-grid2">
                <label style={styles.label}>
                  Amount ({currency})
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
                  Payment Mode
                  <select
                    value={form.payment_mode}
                    onChange={(e) => setForm({ ...form, payment_mode: e.target.value })}
                  >
                    <option value="cash">Cash</option>
                    <option value="card">Card</option>
                    <option value="netbanking">Net Banking</option>
                    <option value="online">Online Payment</option>
                  </select>
                </label>
              </div>

              <label style={styles.checkRow}>
                <input
                  type="checkbox"
                  checked={form.is_recurring}
                  onChange={(e) => setForm({ ...form, is_recurring: e.target.checked })}
                />
                Recurring / Subscription
              </label>

              {form.is_recurring && (
                <div className="form-grid2">
                  <label style={styles.label}>
                    Repeat every
                    <input
                      type="number"
                      min="1"
                      step="1"
                      required
                      value={form.recurrence_interval}
                      onChange={(e) =>
                        setForm({ ...form, recurrence_interval: e.target.value })
                      }
                    />
                  </label>

                  <label style={styles.label}>
                    Period
                    <select
                      value={form.recurrence_unit}
                      onChange={(e) => setForm({ ...form, recurrence_unit: e.target.value })}
                    >
                      <option value="day">Day</option>
                      <option value="month">Month</option>
                      <option value="year">Year</option>
                    </select>
                  </label>
                </div>
              )}

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
              value={recurringFilter}
              onChange={(e) => setRecurringFilter(e.target.value)}
              style={{ padding: '0.3rem 0.55rem', fontSize: '0.85rem' }}
            >
              <option value="all">All Expenses</option>
              <option value="recurring">Recurring</option>
              <option value="one_time">One-time</option>
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
                    <span
                      className="legend-dot"
                      style={{ background: exp.category_color || '#6b7280' }}
                    />
                    <strong>{exp.merchant || exp.category_name}</strong>
                    {exp.is_recurring && (
                      <small style={styles.badge}>{exp.recurrence_summary}</small>
                    )}
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
  checkRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.45rem',
    fontSize: '0.88rem',
    cursor: 'pointer',
  },
  badge: {
    backgroundColor: '#eff6ff',
    color: '#2563eb',
    padding: '0.1rem 0.45rem',
    borderRadius: '999px',
    fontWeight: 600,
    marginLeft: '0.4rem',
  },
  colorInput: {
    padding: '0.2rem',
    width: '100%',
    height: '40px',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    background: 'var(--card-bg)',
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
  deleteBtn: {
    padding: '0.15rem 0.5rem',
    fontSize: '0.95rem',
    lineHeight: 1.2,
  },
}