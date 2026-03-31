import { useEffect, useMemo, useState } from 'react'
import { Polyline } from 'react-leaflet'

function isValidLocation(location) {
  return Boolean(
    location &&
      typeof location === 'object' &&
      Number.isFinite(Number(location.lat)) &&
      Number.isFinite(Number(location.lng)),
  )
}

function RoutingPolyline({
  startLocation,
  endLocation,
  color = '#2563eb',
  dashArray = '5, 10',
  weight = 3,
  opacity = 0.85,
}) {
  const [routePoints, setRoutePoints] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [hasError, setHasError] = useState(false)

  const fallbackPoints = useMemo(() => {
    if (!isValidLocation(startLocation) || !isValidLocation(endLocation)) {
      return null
    }

    return [
      [Number(startLocation.lat), Number(startLocation.lng)],
      [Number(endLocation.lat), Number(endLocation.lng)],
    ]
  }, [startLocation, endLocation])

  useEffect(() => {
    let isMounted = true
    const controller = new AbortController()

    const loadRoute = async () => {
      if (!isValidLocation(startLocation) || !isValidLocation(endLocation)) {
        setRoutePoints(null)
        setHasError(false)
        setIsLoading(false)
        return
      }

      try {
        setIsLoading(true)
        setHasError(false)

        const startLng = Number(startLocation.lng)
        const startLat = Number(startLocation.lat)
        const endLng = Number(endLocation.lng)
        const endLat = Number(endLocation.lat)

        const routeUrl = `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson`
        const response = await fetch(routeUrl, { signal: controller.signal })

        if (!response.ok) {
          throw new Error('OSRM request failed')
        }

        const data = await response.json()
        const coordinates = data?.routes?.[0]?.geometry?.coordinates

        if (!Array.isArray(coordinates) || coordinates.length < 2) {
          throw new Error('OSRM geometry missing')
        }

        // OSRM GeoJSON uses [lng, lat], Leaflet expects [lat, lng].
        const mappedPoints = coordinates
          .map((point) => {
            if (!Array.isArray(point) || point.length < 2) {
              return null
            }

            const lng = Number(point[0])
            const lat = Number(point[1])

            if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
              return null
            }

            return [lat, lng]
          })
          .filter(Boolean)

        if (!mappedPoints.length) {
          throw new Error('No valid points from OSRM')
        }

        if (isMounted) {
          setRoutePoints(mappedPoints)
        }
      } catch (error) {
        if (error.name !== 'AbortError' && isMounted) {
          setHasError(true)
          setRoutePoints(null)
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    loadRoute()

    return () => {
      isMounted = false
      controller.abort()
    }
  }, [startLocation, endLocation])

  if (!fallbackPoints) {
    return null
  }

  const positions = routePoints || fallbackPoints
  const isFallbackMode = !routePoints && (isLoading || hasError)
  const pathOptions = {
    color,
    weight,
    opacity: isFallbackMode ? 0.6 : opacity,
    dashArray,
  }

  // During loading or OSRM errors we render the fallback straight line.
  return <Polyline positions={positions} pathOptions={pathOptions} />
}

export default RoutingPolyline
