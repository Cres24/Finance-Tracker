import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import api from '../api'

export default function ChangePasswordPage() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()

  const [form, setForm] = useState({
    old_password: '',
    new_password: '',
    confirm_password: '',
  })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (form.new_password !== form.confirm_password) {
      setError('New passwords do not match.')
      return
    }

    setSaving(true)
    try {
      const res = await api.post('/auth/change-password/', form)
      setSuccess(res.data?.detail || 'Password updated successfully.')
      setForm({
        old_password: '',
        new_password: '',
        confirm_password: '',
      })
    } catch (err) {
      if (err.response?.status === 401) {
        logout()
        navigate('/login', { replace: true })
        return
      }
      const data = err.response?.data
      if (data && typeof data === 'object') {
        const firstMsg = Object.values(data).flat()[0]
        setError(typeof firstMsg === 'string' ? firstMsg : 'Could not update password.')
      } else {
        setError('Could not update password. Please try again.')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="dashboard">
      <header>
        <div>
          <h1>Change Password</h1>
          {user && <small>Signed in as {user.username}</small>}
        </div>
        <div className="header-actions">
          <button type="button" className="logout" onClick={() => navigate('/')}>
            ← Back to Dashboard
          </button>
        </div>
      </header>

      <div className="card" style={{ maxWidth: '460px', margin: '1.5rem auto' }}>
        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label}>
            Current Password
            <input
              type="password"
              required
              autoComplete="current-password"
              placeholder="Enter your current password"
              value={form.old_password}
              onChange={(e) => setForm({ ...form, old_password: e.target.value })}
            />
          </label>

          <label style={styles.label}>
            New Password
            <input
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              placeholder="Enter new password (min 6 characters)"
              value={form.new_password}
              onChange={(e) => setForm({ ...form, new_password: e.target.value })}
            />
          </label>

          <label style={styles.label}>
            Confirm New Password
            <input
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              placeholder="Re-enter new password"
              value={form.confirm_password}
              onChange={(e) => setForm({ ...form, confirm_password: e.target.value })}
            />
          </label>

          {error && <p className="error">{error}</p>}
          {success && <p className="success">{success}</p>}

          <button type="submit" disabled={saving}>
            {saving ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  )
}

const styles = {
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.85rem',
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.35rem',
    fontSize: '0.88rem',
    fontWeight: 600,
    color: 'var(--text-h)',
  },
}