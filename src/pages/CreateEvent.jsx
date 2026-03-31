import { useState } from 'react'
import { collection, doc, serverTimestamp, setDoc } from 'firebase/firestore'
import LeafletMapPicker from '../components/LeafletMapPicker'
import { useAuth } from '../context/useAuth'
import { db } from '../firebase'

function CreateEvent() {
  const { currentUser } = useAuth()
  const [formData, setFormData] = useState({
    name: '',
    date: '',
    time: '',
  })
  const [location, setLocation] = useState(null)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [inviteLink, setInviteLink] = useState('')
  const [copied, setCopied] = useState(false)

  const handleChange = (event) => {
    const { name, value } = event.target
    setFormData((previous) => ({ ...previous, [name]: value }))
  }

  const handleCopyLink = async () => {
    if (!inviteLink) {
      return
    }

    await navigator.clipboard.writeText(inviteLink)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setInviteLink('')

    if (!formData.name.trim()) {
      setError('Inserisci il nome evento.')
      return
    }

    if (!formData.date || !formData.time) {
      setError('Inserisci data e orario dell evento.')
      return
    }

    if (!location) {
      setError('Seleziona la posizione evento cliccando sulla mappa.')
      return
    }

    try {
      setSubmitting(true)
      const eventRef = doc(collection(db, 'events'))
      const inviteToken = crypto.randomUUID().replaceAll('-', '').slice(0, 16)

      await setDoc(eventRef, {
        id: eventRef.id,
        adminId: currentUser.uid,
        name: formData.name.trim(),
        location,
        date: formData.date,
        time: formData.time,
        inviteToken,
        createdAt: serverTimestamp(),
      })

      const appBaseUrl = new URL(import.meta.env.BASE_URL, window.location.origin)
      const generatedLink = new URL(`join/${inviteToken}`, appBaseUrl).toString()
      setInviteLink(generatedLink)

      setFormData({ name: '', date: '', time: '' })
      setLocation(null)
    } catch {
      setError('Creazione evento non riuscita. Riprova.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="mx-auto w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <h1 className="text-2xl font-semibold text-slate-900">Crea Nuovo Evento</h1>
      <p className="mt-2 text-sm text-slate-600">
        Inserisci i dettagli e clicca sulla mappa per scegliere la destinazione.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
        <div>
          <label htmlFor="name" className="mb-1 block text-sm font-medium text-slate-700">
            Nome evento
          </label>
          <input
            id="name"
            name="name"
            type="text"
            value={formData.name}
            onChange={handleChange}
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            placeholder="Matrimonio Giulia e Marco"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="date" className="mb-1 block text-sm font-medium text-slate-700">
              Data
            </label>
            <input
              id="date"
              name="date"
              type="date"
              value={formData.date}
              onChange={handleChange}
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            />
          </div>

          <div>
            <label htmlFor="time" className="mb-1 block text-sm font-medium text-slate-700">
              Orario
            </label>
            <input
              id="time"
              name="time"
              type="time"
              value={formData.time}
              onChange={handleChange}
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            />
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">Posizione evento</p>
          <LeafletMapPicker location={location} onPick={setLocation} />
          <p className="mt-2 text-xs text-slate-500">
            {location
              ? `Coordinate selezionate: ${location.lat}, ${location.lng}`
              : 'Clicca sulla mappa per posizionare il pin evento.'}
          </p>
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
          {submitting ? 'Creazione in corso...' : 'Crea evento'}
        </button>
      </form>

      {inviteLink ? (
        <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-medium text-emerald-900">Evento creato con successo.</p>
          <p className="mt-2 break-all rounded-lg bg-white px-3 py-2 text-sm text-emerald-900">
            {inviteLink}
          </p>
          <button
            type="button"
            onClick={handleCopyLink}
            className="mt-3 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-600"
          >
            {copied ? 'Link copiato' : 'Copia link invito'}
          </button>
        </div>
      ) : null}
    </section>
  )
}

export default CreateEvent
