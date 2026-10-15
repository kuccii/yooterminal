import { useEffect, useState } from 'react';

const EMPTY = { google: false, flutterwavePublicKey: '' };

export default function useSiteConfig() {
  const [config, setConfig] = useState(EMPTY);

  useEffect(() => {
    let active = true;
    fetch('/api/config', { credentials: 'include' })
      .then((response) => response.json())
      .then((data) => {
        if (active) setConfig({ ...EMPTY, ...data });
      })
      .catch(() => {
        if (active) setConfig(EMPTY);
      });
    return () => {
      active = false;
    };
  }, []);

  return config;
}
