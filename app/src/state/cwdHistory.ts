import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Persisted working-directory shortcuts for the new-session screen, scoped per
 * server so a "Home Mac" and a "Work laptop" don't bleed into each other.
 * Recents are an MRU list; favorites are user-pinned.
 */

const RECENTS_KEY = 'claude-remote.cwd.recents.v1';
const FAVS_KEY = 'claude-remote.cwd.favorites.v1';
const MAX_RECENTS = 8;

type PerServer = Record<string, string[]>;

async function read(key: string): Promise<PerServer> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as PerServer) : {};
  } catch {
    return {};
  }
}

async function write(key: string, data: PerServer): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

const scope = (serverId: string | null) => serverId || '_';

export async function getRecents(serverId: string | null): Promise<string[]> {
  return (await read(RECENTS_KEY))[scope(serverId)] ?? [];
}

export async function addRecent(serverId: string | null, path: string): Promise<void> {
  if (!path) return;
  const all = await read(RECENTS_KEY);
  const s = scope(serverId);
  const list = [path, ...(all[s] ?? []).filter((p) => p !== path)].slice(0, MAX_RECENTS);
  all[s] = list;
  await write(RECENTS_KEY, all);
}

export async function getFavorites(serverId: string | null): Promise<string[]> {
  return (await read(FAVS_KEY))[scope(serverId)] ?? [];
}

/** Toggle a path's favorite status; returns the new favorites list. */
export async function toggleFavorite(serverId: string | null, path: string): Promise<string[]> {
  const all = await read(FAVS_KEY);
  const s = scope(serverId);
  const cur = all[s] ?? [];
  const next = cur.includes(path) ? cur.filter((p) => p !== path) : [path, ...cur];
  all[s] = next;
  await write(FAVS_KEY, all);
  return next;
}
