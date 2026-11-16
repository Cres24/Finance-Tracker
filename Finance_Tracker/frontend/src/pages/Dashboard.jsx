import { useEffect, useState } from 'react'
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
  const [error, setError] = useState('')

  useEffect(() => {
    let ignore = false
    api
      .get('/dashboard/')
      .then((res) => {
        if (!ignore) setData(res.data)
      })
      .catch((err) => {
        if (ignore) return
        if (err.response?.status === 401) {
          logout()
          navigate('/login', { replace: true })
        } else {
          setError("Couldn't load dashboard data.")
        }
      })
    return () => {
      ignore = true
    }
  }, [logout, navigate])

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
            + Add Entry
          </button>
          {user && <span className="greeting">Hi, {user.username}</span>}
          <button type="button" className="logout" onClick={logout}>
            Log out
          </button>
        </div>
      </header>

      <p className="hint">Switching currency changes how amounts are displayed; it does not convert them.</p>

      {error && <p className="error">{error}</p>}
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

          <div className="grid2">
            <div className="card">
              <h3>Income sources</h3>
              {incomes.length === 0 ? (
                <p>No income recorded this month yet.</p>
              ) : (
                incomes.map((inc) => (
                  <div className="row" key={inc.source}>
                    <span>{inc.source}</span>
                    <strong>{formatMoney(inc.total)}</strong>
                  </div>
                ))
              )}
            </div>

            <div className="card">
              <h3>Recent expenses</h3>
              {recentExpenses.length === 0 ? (
                <p>No expenses this month yet.</p>
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