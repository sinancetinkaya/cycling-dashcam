import { useState, useEffect, useRef } from 'react';

// TelemetryData: Interface for the movement and position data we track
export interface TelemetryData {
  speedKmh: number;
  climbRatePct: number;
  latitude: number;
  longitude: number;
  altitude: number | null;
  accuracy: number | null;
  gForce: {
    x: number;
    y: number;
    z: number;
    total: number;
  };
}

// Haversine formula: Calculates the direct distance between two GPS coordinates in meters.
// This is used to determine how far the vehicle has traveled between GPS updates.
function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3; // Earth's radius in metres
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

// useTelemetry: Custom hook that watches the device's GPS and calculates speed/climb data.
export function useTelemetry(smoothing: number = 3) {
  const [data, setData] = useState<TelemetryData>({
    speedKmh: 0,
    climbRatePct: 0,
    latitude: 0,
    longitude: 0,
    altitude: null,
    accuracy: null,
    gForce: { x: 0, y: 0, z: 0, total: 1 }, // 1G is normal gravity
  });

  // Store previous position to calculate changes (distance and altitude)
  const prevPos = useRef<{
    lat: number;
    lon: number;
    alt: number | null;
    time: number;
  } | null>(null);

  // Use refs for smoothing
  const climbRateHistoryRef = useRef<number[]>([]);
  const speedHistoryRef = useRef<number[]>([]);
  const smoothingRef = useRef(smoothing);

  // Update smoothing ref when prop changes
  if (smoothingRef.current !== smoothing) {
    smoothingRef.current = smoothing;
  }

  useEffect(() => {
    // 1. G-Force Tracking (Accelerometer)
    const handleMotion = (event: DeviceMotionEvent) => {
      const acc = event.accelerationIncludingGravity;
      if (acc && acc.x !== null && acc.y !== null && acc.z !== null) {
        // Convert m/s² to Gs (1G ≈ 9.81 m/s²)
        const gx = acc.x / 9.81;
        const gy = acc.y / 9.81;
        const gz = acc.z / 9.81;
        const total = Math.sqrt(gx * gx + gy * gy + gz * gz);

        setData(prev => ({
          ...prev,
          gForce: { x: gx, y: gy, z: gz, total }
        }));
      }
    };

    window.addEventListener('devicemotion', handleMotion);

    // 2. GPS Tracking
    if (!('geolocation' in navigator)) {
      console.warn('Geolocation is not supported by this browser.');
      return;
    }

    // Start watching the device's position
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, altitude, speed, accuracy } = position.coords;
        const now = position.timestamp;

        // 1. Speed Calculation: Browser provides speed in m/s, we convert to km/h
        const rawSpeedKmh = (speed || 0) * 3.6;
        
        speedHistoryRef.current.push(rawSpeedKmh);
        const currentSmoothing = Math.max(1, smoothingRef.current);
        while (speedHistoryRef.current.length > currentSmoothing) speedHistoryRef.current.shift();
        const currentSpeedKmh = speedHistoryRef.current.reduce((a, b) => a + b, 0) / speedHistoryRef.current.length;

        let climbRate = 0;

        // 2. Climb Rate Calculation: Based on change in altitude over distance traveled
        if (
          prevPos.current &&
          altitude !== null &&
          prevPos.current.alt !== null
        ) {
          const dist = getDistance(
            prevPos.current.lat,
            prevPos.current.lon,
            latitude,
            longitude
          );
          const altDiff = altitude - prevPos.current.alt;

          // Only calculate climb rate if we've moved at least 1 meter to avoid GPS jitter
          if (dist > 1) {
            const instantClimbRate = (altDiff / dist) * 100;
            climbRateHistoryRef.current.push(instantClimbRate);
            // For climb rate, we might want slightly more smoothing than speed, or just use the same
            // Let's use smoothing * 1.5 for climb rate as it's usually noisier, or just stick to smoothing
            while (climbRateHistoryRef.current.length > currentSmoothing) climbRateHistoryRef.current.shift();
            climbRate = climbRateHistoryRef.current.reduce((a, b) => a + b, 0) / climbRateHistoryRef.current.length;
          } else if (climbRateHistoryRef.current.length > 0) {
            climbRate = climbRateHistoryRef.current.reduce((a, b) => a + b, 0) / climbRateHistoryRef.current.length;
          }
        }

        // 3. Update the state with fresh telemetry
        setData(prev => ({
          ...prev,
          speedKmh: currentSpeedKmh,
          climbRatePct: climbRate,
          latitude,
          longitude,
          altitude,
          accuracy,
        }));

        // Store current position for the next update
        prevPos.current = { lat: latitude, lon: longitude, alt: altitude, time: now };
      },
      (error) => {
        console.error('Geolocation error:', error);
      },
      {
        enableHighAccuracy: true, // Use GPS for best results
        maximumAge: 0,            // Don't use cached positions
        timeout: 5000,
      }
    );

    // Cleanup: Stop watching GPS and motion when the component unmounts
    return () => {
      navigator.geolocation.clearWatch(watchId);
      window.removeEventListener('devicemotion', handleMotion);
    };
  }, []); 

  return data;
}
