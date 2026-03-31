import { useEffect, useRef, useState } from 'react'

function AddressAutocomplete({ value, onChange, placeholder = 'Indirizzo' }) {
  const [results, setResults] = useState([])
  const [isOpen, setIsOpen] = useState(false)
  const [hasUserTyped, setHasUserTyped] = useState(false)
  const abortControllerRef = useRef(null)
  const blurTimeoutRef = useRef(null)

  const inputValue = value?.address || ''

  // Fetch Nominatim con debounce
  useEffect(() => {
    const timerId = setTimeout(async () => {
      if (!hasUserTyped || !inputValue || inputValue.length < 3) {
        setResults([])
        return
      }

      abortControllerRef.current?.abort()
      abortControllerRef.current = new AbortController()

      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(inputValue)}&countrycodes=it&limit=5`,
          {
            signal: abortControllerRef.current.signal,
          },
        )

        if (!response.ok) throw new Error('Nominatim API error')

        const data = await response.json()
        setResults(data || [])
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.error('Geocoding error:', error)
        }
        setResults([])
      }
    }, 500)

    return () => clearTimeout(timerId)
  }, [inputValue, hasUserTyped])

  const handleInputChange = (e) => {
    setHasUserTyped(true)
    setIsOpen(true)
    onChange({ address: e.target.value, lat: null, lng: null })
  }

  const handleSelectResult = (result) => {
    onChange({
      address: result.display_name,
      lat: parseFloat(result.lat),
      lng: parseFloat(result.lon),
    })
    setIsOpen(false)
    setHasUserTyped(false)
  }

  const handleInputFocus = () => {
    setIsOpen(true)
  }

  const handleInputBlur = () => {
    blurTimeoutRef.current = setTimeout(() => {
      setIsOpen(false)
    }, 200)
  }

  const handleDropdownMouseDown = () => {
    clearTimeout(blurTimeoutRef.current)
  }

  return (
    <div className="relative mt-1">
      <input
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        onFocus={handleInputFocus}
        onBlur={handleInputBlur}
        placeholder={placeholder}
        className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-slate-900 focus:outline-none"
      />

      {isOpen && results.length > 0 && (
        <ul
          onMouseDown={handleDropdownMouseDown}
          className="absolute left-0 right-0 top-full z-10 max-h-60 overflow-y-auto rounded-lg border border-slate-300 bg-white shadow-md"
        >
          {results.map((result, index) => (
            <li
              key={index}
              onClick={() => handleSelectResult(result)}
              className="cursor-pointer border-b border-slate-100 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              {result.display_name}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default AddressAutocomplete
