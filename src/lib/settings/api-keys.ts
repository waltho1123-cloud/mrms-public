/**
 * Per-user API key store backed by Postgres (UserSetting table).
 *
 * Each user manages their own OPENAI_API_KEY. Reads use a short TTL cache
 * keyed by (userId, name) so worker / web hot paths don't hit DB on every
 * request. Process-local writes invalidate immediately; other processes
 * (e.g. the worker) see updates within `CACHE_TTL_MS`.
 *
 * `process.env.OPENAI_API_KEY` is no longer used at runtime — this is a
 * multi-tenant app, so falling back to a shared env key would silently
 * spend the operator's money on behalf of users.
 */

import prisma from '@/lib/db';

export type ApiKeyName = 'OPENAI_API_KEY';

export const API_KEY_NAMES: ApiKeyName[] = ['OPENAI_API_KEY'];

interface CacheEntry {
  value: string | null;
  expiresAt: number;
}

const CACHE_TTL_MS = 30_000;
const cache = new Map<string, CacheEntry>();

function cacheKey(userId: string, name: ApiKeyName): string {
  return `${userId}::${name}`;
}

function fromCache(userId: string, name: ApiKeyName): string | null | undefined {
  const entry = cache.get(cacheKey(userId, name));
  if (!entry) return undefined;
  if (entry.expiresAt < Date.now()) {
    cache.delete(cacheKey(userId, name));
    return undefined;
  }
  return entry.value;
}

function putCache(userId: string, name: ApiKeyName, value: string | null): void {
  cache.set(cacheKey(userId, name), { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

async function readFromDb(userId: string, name: ApiKeyName): Promise<string | null> {
  try {
    const row = await prisma.userSetting.findUnique({
      where: { userId_key: { userId, key: name } },
    });
    return row?.value ?? null;
  } catch {
    // DB not reachable — caller decides what to do
    return null;
  }
}

export async function getApiKey(
  userId: string,
  name: ApiKeyName
): Promise<string | undefined> {
  if (!userId) return undefined;
  const cached = fromCache(userId, name);
  if (cached !== undefined) return cached || undefined;

  const value = await readFromDb(userId, name);
  putCache(userId, name, value);
  return value || undefined;
}

export async function setApiKeys(
  userId: string,
  updates: Partial<Record<ApiKeyName, string | null>>,
  updatedBy?: string
): Promise<void> {
  for (const name of API_KEY_NAMES) {
    if (!(name in updates)) continue;
    const raw = updates[name];
    if (raw === null || raw === undefined || raw === '') {
      await prisma.userSetting.deleteMany({ where: { userId, key: name } });
      cache.delete(cacheKey(userId, name));
      continue;
    }
    const value = raw.trim();
    await prisma.userSetting.upsert({
      where: { userId_key: { userId, key: name } },
      update: { value, updatedBy: updatedBy ?? null },
      create: { userId, key: name, value, updatedBy: updatedBy ?? null },
    });
    putCache(userId, name, value);
  }
}

export interface ApiKeyStatus {
  name: ApiKeyName;
  configured: boolean;
  masked: string;
}

function maskKey(value: string): string {
  if (value.length <= 8) return '••••••••';
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

export async function getApiKeyStatuses(userId: string): Promise<{
  statuses: ApiKeyStatus[];
  updatedAt?: string;
}> {
  const statuses: ApiKeyStatus[] = [];
  let mostRecent: Date | null = null;

  for (const name of API_KEY_NAMES) {
    let value: string | null;
    const cached = fromCache(userId, name);
    if (cached !== undefined) {
      value = cached;
    } else {
      value = await readFromDb(userId, name);
      putCache(userId, name, value);
    }
    statuses.push({
      name,
      configured: !!value,
      masked: value ? maskKey(value) : '',
    });
  }

  try {
    const recent = await prisma.userSetting.findFirst({
      where: { userId, key: { in: [...API_KEY_NAMES] } },
      orderBy: { updatedAt: 'desc' },
      select: { updatedAt: true },
    });
    mostRecent = recent?.updatedAt ?? null;
  } catch {
    // non-critical
  }

  return {
    statuses,
    updatedAt: mostRecent?.toISOString(),
  };
}
