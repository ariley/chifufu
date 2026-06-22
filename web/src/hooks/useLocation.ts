"use client";

import { useEffect, useState } from "react";

interface LocationState {
  location: string;
  lat: number | undefined;
  lng: number | undefined;
  locating: boolean;
  setLocation: (v: string) => void;
}

export function useLocation(): LocationState {
  const [location, setLocation] = useState("My Location");
  const [lat, setLat] = useState<number | undefined>(undefined);
  const [lng, setLng] = useState<number | undefined>(undefined);
  const [locating, setLocating] = useState(true);

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocation("Oakland, CA");
      setLocating(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setLat(latitude);
        setLng(longitude);
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`,
            { headers: { "Accept-Language": "en" } }
          );
          if (res.ok) {
            const data = await res.json();
            const addr = data.address ?? {};
            const city =
              addr.city ||
              addr.town ||
              addr.village ||
              addr.county ||
              addr.state ||
              "";
            const state = addr.state || "";
            setLocation(
              city && state ? `${city}, ${state}` : city || state || "My Location"
            );
          }
        } catch {
          setLocation("My Location");
        } finally {
          setLocating(false);
        }
      },
      () => {
        setLocation("Oakland, CA");
        setLocating(false);
      },
      { timeout: 8000 }
    );
  }, []);

  return { location, lat, lng, locating, setLocation };
}
