import { useState, useEffect } from 'react';
import { api, type Network, type Module } from '../lib/api';

interface NetworksState {
  networks: Network[];
  modules: Module[];
  loading: boolean;
  error: string | null;
}

export function useNetworks(): NetworksState {
  const [networks, setNetworks] = useState<Network[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [nets, mods] = await Promise.all([api.getNetworks(), api.getModules()]);
        if (!cancelled) {
          setNetworks(nets);
          setModules(mods);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load data');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { networks, modules, loading, error };
}
