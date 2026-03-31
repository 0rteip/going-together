import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import CreateEvent from './pages/CreateEvent'
import Dashboard from './pages/Dashboard'
import EventMap from './pages/EventMap'
import JoinEvent from './pages/JoinEvent'
import Login from './pages/Login'
import Register from './pages/Register'
import Settings from './pages/Settings'
import TripPreferences from './pages/TripPreferences'

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/join/:token" element={<JoinEvent />} />

        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/create-event" element={<CreateEvent />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/event/:eventId/preferences" element={<TripPreferences />} />
          <Route path="/event/:eventId/map" element={<EventMap />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

export default App
