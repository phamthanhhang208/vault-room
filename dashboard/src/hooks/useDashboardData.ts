import { useState, useEffect } from 'react';
import type { DashboardData } from '../types.ts';

const POLL_INTERVAL = 10_000;

export function useDashboardData(): DashboardData | null {
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/data.json?' + Date.now()); // bust cache
        if (res.ok) {
          const json = (await res.json()) as DashboardData;
          setData(json);
        }
      } catch {
        // keep previous data on fetch error
      }
    };

    void load();
    const id = setInterval(() => void load(), POLL_INTERVAL);
    return () => clearInterval(id);
  }, []);

  return data;
}
