import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import api from '../api'

export default function Register() {
  const navigate = useNavigate()
  const { login } = useAuth()

  const [form, setForm] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    try {
      await api.post('/auth/register/', {
        username: form.username,
        email: form.email,
        password: form.password,
        password2: form.confirmPassword,
      })

      // Automatically log the user in after registration if login helper is available
      if (login) {
        await login(form.username, form.password)
        navigate('/', { replace: true })
      } else {
        navigate('/login', { replace: true })
      }
    } catch (err) {
      const data = err.response?.data
      if (data && typeof data === 'object') {
        const firstMsg = Object.values(data).flat()[0]
        setError(typeof firstMsg === 'string' ? firstMsg : 'Registration failed.')
      } else {
        setError('Registration failed. Please check your details.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth card">
      <h1>Create Account</h1>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          required
          placeholder="Username"
          autoComplete="username"
          value={form.username}
          onChange={(e) => setForm({ ...form, username: e.target.value })}
        />
        <input
          type="email"
          required
          placeholder="Email"
          autoComplete="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <input
          type="password"
          required
          minLength={6}
          placeholder="Password"
          autoComplete="new-password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        <input
          type="password"
          required
          minLength={6}
          placeholder="Confirm Password"
          autoComplete="new-password"
          value={form.confirmPassword}
          onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
        />

        {error && <p className="error">{error}</p>}

        <button type="submit" disabled={loading}>
          {loading ? 'Creating account...' : 'Register'}
        </button>
      </form>

      <p style={{ marginTop: '1rem', fontSize: '0.9rem' }}>
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </div>
  )
}