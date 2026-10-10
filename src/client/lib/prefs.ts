import { useSyncExternalStore } from 'react';

export interface AdminPrefs {
  density: 'comfortable' | 'compact';
  sidebarCollapsed: boolean;
  defaultSection: string; // '' = overview
  hiddenCards: string[]; // overview summary card keys
  accent: 'crimson' | 'blue' | 'pink' | 'gold' | 'green';
}

const KEY = 'es-admin-prefs';
const DEFAULTS: AdminPrefs = {
  density: 'comfortable',
  sidebarCollapsed: false,
  defaultSection: '',
  hiddenCards: [],
  accent: 'crimson',
};

let cache: AdminPrefs = load();
const listeners = new Set<() => void>();

function load(): AdminPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

function emit() {
  listeners.forEach((l) => l());
}

export function getPrefs(): AdminPrefs {
  return cache;
}

export function setPrefs(patch: Partial<AdminPrefs>) {
  cache = { ...cache, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* private mode */
  }
  emit();
}

export function usePrefs(): [AdminPrefs, (patch: Partial<AdminPrefs>) => void] {
  const value = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => cache
  );
  return [value, setPrefs];
}

export const ACCENTS: Record<AdminPrefs['accent'], string> = {
  crimson: '#c8102e',
  blue: '#1c6ea4',
  pink: '#ef0a71',
  gold: '#b3611f',
  green: '#1d9e6c',
};
