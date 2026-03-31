import { Link, Outlet } from 'react-router-dom'
import { useAuth } from '../context/useAuth'

function Layout() {
  const { currentUser } = useAuth()

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <nav className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link to="/" className="text-xl font-bold tracking-tight text-slate-900">
            Event Carpooling
          </Link>

          <div className="flex items-center gap-3">
            {currentUser ? (
              <>
                <span className="hidden rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700 sm:inline">
                  {currentUser.email}
                </span>
                <Link
                  to="/settings"
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
                >
                  Impostazioni
                </Link>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
                >
                  Login
                </Link>
                <Link
                  to="/register"
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
                >
                  Register
                </Link>
              </>
            )}
          </div>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  )
}

export default Layout
