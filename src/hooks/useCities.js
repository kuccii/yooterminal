import db from '@/api/client';

import { useEffect, useState } from 'react';

let citiesPromise = null;

export function loadCities() {
  if (!citiesPromise) {
    citiesPromise = db.entities.City
      .filter({}, { sort: 'name', limit: 100 })
      .then((page) => page.items || [])
      .catch(() => []);
  }
  return citiesPromise;
}

export function useCities() {
  const [cities, setCities] = useState([]);
  useEffect(() => {
    let active = true;
    loadCities().then((list) => {
      if (active) setCities(list);
    });
    return () => {
      active = false;
    };
  }, []);
  return cities;
}