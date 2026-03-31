import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/useAuth'

function getLoginErrorMessage(errorCode) {
  switch (errorCode) {
    case 'auth/invalid-email':
      return 'Email non valida.'
    case 'auth/user-disabled':
      return 'Questo account e stato disabilitato.'
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Credenziali non corrette.'
    default:
      return 'Accesso non riuscito. Riprova.'
  }
}

function Login() {
  const [formData, setFormData] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const { currentUser, login, loading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const from = location.state?.from?.pathname || '/dashboard'

  if (!loading && currentUser) {
    return <Navigate to="/dashboard" replace />
  }

  const handleChange = (event) => {
    const { name, value } = event.target
    setFormData((previous) => ({ ...previous, [name]: value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')

    if (!formData.password || formData.password.length < 6) {
      setError('Password troppo corta: minimo 6 caratteri.')
      return
    }

    try {
      setSubmitting(true)
      await login(formData.email, formData.password)
      navigate(from, { replace: true })
    } catch (firebaseError) {
      setError(getLoginErrorMessage(firebaseError.code))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-semibold text-slate-900">Accedi</h1>
        <p className="mt-2 text-sm text-slate-600">Accedi per gestire i tuoi eventi e trasporti.</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleChange}
              required
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              placeholder="nome@dominio.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              value={formData.password}
              onChange={handleChange}
              required
              minLength={6}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              placeholder="Almeno 6 caratteri"
            />
          </div>

          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {submitting ? 'Accesso in corso...' : 'Accedi'}
          </button>
        </form>

        <p className="mt-5 text-sm text-slate-600">
          Non hai un account?{' '}
          <Link
            to="/register"
            state={{ from: { pathname: from } }}
            className="font-medium text-slate-900 underline-offset-2 hover:underline"
          >
            Registrati
          </Link>
        </p>
      </div>
    </div>
  )
}

export default Login
