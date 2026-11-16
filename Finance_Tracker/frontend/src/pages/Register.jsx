import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'

export default function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ username: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value })

  const onSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await register(form.username, form.email, form.password)
      navigate('/')
    } catch (err) {
      const data = err.response?.data
      setError(data ? Object.values(data).flat().join(' ') : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="card auth">
      <h1>Create account</h1>
      <form onSubmit={onSubmit}>
        <input name="username" placeholder="Username" onChange={onChange} required autoFocus />
        <input name="email" type="email" placeholder="Email" onChange={onChange} required />
        <input
          name="password"
          type="password"
          placeholder="Password (min 8 chars)"
          onChange={onChange}
          required
        />
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? 'Creating...' : 'Sign up'}
        </button>
      </form>
      <p>
        Have an account? <Link to="/login">Log in</Link>
      </p>
    </div>
  )
}
