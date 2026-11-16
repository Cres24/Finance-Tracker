import { useEffect, useState } from 'react'
import { useAuth } from '../AuthContext'
import { useCurrency, CURRENCIES } from '../CurrencyContext'
import api from '../api'

function BucketRow({ label, spent, limit, formatMoney }) {
  const pct = limit ? Math.min((spent / limit) * 100, 100) : 0
  const over = limit && spent > limit
  return (
    <div className="bucket">
      <div className="bucket-top">
        <strong>{label}</strong>
        <span>
          {formatMoney(spent)}
          {limit ? ` / ${formatMoney(limit)}` : ' (no budget set)'}
        </span>
      </div>
      {limit && (
        <div className="bar">
          <div className={`bar-fill ${over ? 'over' : ''}`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  )
}

export default function Dashboard() {
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
      .catch(() => {
        if (!ignore) setError("Couldn't load dashboard data.")
      })
    return () => {
      ignore = true
    }
  }, [])

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
          <span className="greeting">Hi, {user.username}</span>
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
              <p>{formatMoney(data.income)}</p>
            </div>
            <div className="card">
              <h3>Expenses</h3>
              <p>{formatMoney(data.expenses)}</p>
            </div>
            <div className="card">
              <h3>Balance</h3>
              <p className={data.balance < 0 ? 'neg' : 'pos'}>{formatMoney(data.balance)}</p>
            </div>
          </div>

          <div className="grid2">
            <div className="card">
              <h3>Budgets</h3>
              {data.buckets.map((b) => (
                <BucketRow key={b.bucket} {...b} formatMoney={formatMoney} />
              ))}
            </div>

            <div className="card">
              <h3>Spending habits</h3>
              {data.habits.map((h) => (
                <div className="row" key={h.tag}>
                  <span>{h.label}</span>
                  <strong>{formatMoney(h.spent)}</strong>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <h3>Recent expenses</h3>
            {data.recent.length === 0 ? (
              <p>No expenses this month yet.</p>
            ) : (
              data.recent.map((t) => (
                <div className="row" key={t.id}>
                  <span>
                    {t.description}
                    <small>
                      {' '}
                      · {t.category} · {t.payment_mode}
                    </small>
                  </span>
                  <span>
                    {formatMoney(t.amount)} <small>{t.date}</small>
                  </span>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}
