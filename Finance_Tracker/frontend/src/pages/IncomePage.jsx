import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { useCurrency } from '../CurrencyContext'
import CurrencySwitch from '../components/CurrencySwitch'
import api from '../api'

export default function IncomePage() {
  const navigate = useNavigate()
  const { logout } = useAuth()
  const { currency, formatMoney, toINR } = useCurrency()

  const [incomes, setIncomes] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [form, setForm] = useState({
    source: '',
    amount: '',
    date_received: new Date().toISOString().slice(0, 10),
    is_recurring: false,
    notes: '',
  })

  const fetchIncomes = useCallback(async () => {
    try {
      const res = await api.get('/incomes/')
      const list = Array.isArray(res.data) ? res.data : res.data.results || []
      setIncomes(list)
    } catch (err) {
      if (err.response?.status === 401) {
        logout()
        navigate('/login', { replace: true })
      } else {
        setError('Could not load income details.')
      }
    } finally {
      setLoading(false)
    }
  }, [logout, navigate])

  useEffect(() => {
    fetchIncomes()
  }, [fetchIncomes])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')

    try {
      const res = await api.post('/incomes/', {
        ...form,
        amount: toINR(parseFloat(form.amount)),
      })
      setIncomes((prev) => [res.data, ...prev])
      setForm({
        source: '',
        amount: '',
        date_received: new Date().toISOString().slice(0, 10),
        is_recurring: false,
        notes: '',
      })
      setSuccess('Income added successfully.')
    } catch {
      setError('Failed to add income. Please check all fields.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    try {
      await api.delete(`/incomes/${id}/`)
      setIncomes((prev) => prev.filter((item) => item.id !== id))
    } catch {
      setError('Could not delete income entry.')
    }
  }

  const totalIncome = incomes.reduce((sum, item) => sum + Number(item.amount || 0), 0)
  const recurringIncome = incomes
    .filter((item) => item.is_recurring)
    .reduce((sum, item) => sum + Number(item.amount || 0), 0)

  return (
    <div className="dashboard">
      <header>
        <div>
          <h1>Income Details</h1>
          <small>Manage income sources and earnings history</small>
        </div>
        <div className="header-actions">
          <CurrencySwitch />
          <button type="button" className="logout" onClick={() => navigate('/')}>
            ← Back to Dashboard
          </button>
        </div>
      </header>

      {error && <p className="error" style={{ marginBottom: '1rem' }}>{error}</p>}
      {success && <p className="success" style={{ marginBottom: '1rem' }}>{success}</p>}

      {/* Summary Stats */}
      <div className="grid2">
        <div className="card">
          <h3>Total Recorded Income</h3>
          <p style={{ fontSize: '1.5rem', margin: 0, fontWeight: 600, color: 'var(--success)' }}>
            {formatMoney(totalIncome)}
          </p>
        </div>
        <div className="card">
          <h3>Recurring Income</h3>
          <p style={{ fontSize: '1.5rem', margin: 0, fontWeight: 600, color: 'var(--text-h)' }}>
            {formatMoney(recurringIncome)}
          </p>
        </div>
      </div>

      {/* Add Form + Detailed History */}
      <div className="grid2">
        <div className="card">
          <h3>Add New Income</h3>
          <form onSubmit={handleSubmit} style={styles.form}>
            <label style={styles.label}>
              Source
              <input
                type="text"
                required
                placeholder="e.g., Salary, Freelance, Dividends"
                value={form.source}
                onChange={(e) => setForm({ ...form, source: e.target.value })}
              />
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
                Date Received
                <input
                  type="date"
                  required
                  value={form.date_received}
                  onChange={(e) => setForm({ ...form, date_received: e.target.value })}
                />
              </label>
            </div>

            <label style={styles.checkRow}>
              <input
                type="checkbox"
                checked={form.is_recurring}
                onChange={(e) => setForm({ ...form, is_recurring: e.target.checked })}
              />
              Recurring monthly income
            </label>

            <label style={styles.label}>
              Notes
              <textarea
                rows="2"
                placeholder="Optional details (client, bank account, etc.)"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </label>

            <button type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Save Income'}
            </button>
          </form>
        </div>

        <div className="card">
          <h3>All Income Entries ({incomes.length})</h3>
          {loading ? (
            <p className="loading">Loading...</p>
          ) : incomes.length === 0 ? (
            <p style={{ margin: 0 }}>No income entries yet. Add one on the left.</p>
          ) : (
            incomes.map((inc) => (
              <div className="row" key={inc.id} style={{ alignItems: 'center' }}>
                <div>
                  <div>
                    <strong>{inc.source}</strong>{' '}
                    {inc.is_recurring && (
                      <small style={styles.badge}>Recurring</small>
                    )}
                  </div>
                  <small>
                    {inc.date_received}
                    {inc.notes ? ` · ${inc.notes}` : ''}
                  </small>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                  <strong style={{ color: 'var(--success)' }}>
                    {formatMoney(inc.amount)}
                  </strong>
                  <button
                    type="button"
                    className="logout"
                    style={styles.deleteBtn}
                    title="Delete entry"
                    onClick={() => handleDelete(inc.id)}
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
    backgroundColor: '#dcfce7',
    color: '#15803d',
    padding: '0.1rem 0.45rem',
    borderRadius: '999px',
    fontWeight: 600,
    marginLeft: '0.35rem',
  },
  deleteBtn: {
    padding: '0.15rem 0.5rem',
    fontSize: '0.95rem',
    lineHeight: 1.2,
  },
}