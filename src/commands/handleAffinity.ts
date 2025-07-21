import { Env } from "../bindings";

/**
 * Affection record for a target user.
 */
export interface AffectionRecord {
  firstName: string;
  value: number;
}

/**
 * Full affection map for a source user A.
 * Keyed by target user IDs (as strings).
 */
export interface AffectionMap {
  [targetId: string]: AffectionRecord;
}

/**
 * Record an interaction from user A toward user B, incrementing affection by given amount.
 * Stores data in AFFECTION_KV (Cloudflare KV namespace).
 *
 * @param sourceId - A user's Telegram ID
 * @param targetId - B user's Telegram ID
 * @param targetFirstName - B user's first name
 * @param increment - amount to add (e.g. length of reply)
 * @param env - Cloudflare Workers environment bindings, including AFFECTION_KV
 */
export async function recordAffection(
  sourceId: number,
  targetId: number,
  targetFirstName: string,
  increment: number,
  env: Env
): Promise<void> {
  const key = `affection:${sourceId}`;
  // Fetch existing map or initialize
  const raw = await env.AFFECTION_KV.get(key);
  let map: AffectionMap = {};
  if (raw) {
    try {
      map = JSON.parse(raw);
    } catch {
      map = {};
    }
  }

  const tid = targetId.toString();
  if (!map[tid]) {
    map[tid] = { firstName: targetFirstName, value: 0 };
  }
  // Update name in case changed
  map[tid].firstName = targetFirstName;
  // Increase affection
  map[tid].value += increment;

  // Persist back
  await env.AFFECTION_KV.put(key, JSON.stringify(map));
}

/**
 * Retrieve the affection map for a given source user.
 * @param sourceId - A user's Telegram ID
 * @param env - Cloudflare Workers environment bindings
 * @returns AffectionMap or empty object
 */
export async function getAffectionMap(
  sourceId: number,
  env: Env
): Promise<AffectionMap> {
  const key = `affection:${sourceId}`;
  const raw = await env.AFFECTION_KV.get(key);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
