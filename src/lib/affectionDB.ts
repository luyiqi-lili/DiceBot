/**
 * @file lib/affectionDB.ts
 * @description 好感度系统的数据库存储层（按群组 chat_id 隔离）。
 *   使用 D1 数据库存储好感度数据，同时保留 KV 回退机制以支持平滑迁移。
 *
 *   隔离策略：
 *   - 所有 D1 查询都带上 chat_id；affections/rose_sends 主键含 chat_id。
 *   - KV 回退 key 也按 chatId 作用域：affection:${chatId}:${sourceId} /
 *     rose_send:${chatId}:${userId}。
 *   - 历史（未隔离）数据由一次性迁移回填到 LEGACY_CHAT_ID，不在此处处理。
 */

// 数据库表已在 D1 控制台手动创建，不再执行建表语句
async function ensureDB(_db: D1Database): Promise<void> {}

/* ---------- KV 辅助（用于回退） ---------- */

function affectionKvKey(chatId: string | number, sourceId: number): string {
  return `affection:${chatId}:${sourceId}`;
}

async function readAffectionMapFromKV(
  kv: KVNamespace,
  chatId: string | number,
  sourceId: number
): Promise<Record<string, { firstName: string; value: number }>> {
  const raw = await kv.get(affectionKvKey(chatId, sourceId));
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, { firstName: string; value: number }>;
  } catch {
    return {};
  }
}

async function writeAffectionMapToKV(
  kv: KVNamespace,
  chatId: string | number,
  sourceId: number,
  map: Record<string, { firstName: string; value: number }>
): Promise<void> {
  await kv.put(affectionKvKey(chatId, sourceId), JSON.stringify(map));
}

async function writeMapToDB(
  db: D1Database,
  chatId: string | number,
  sourceId: number,
  map: Record<string, { firstName: string; value: number }>
): Promise<void> {
  // 先删除该 (chat, source) 的旧数据
  await db.prepare('DELETE FROM affections WHERE chat_id = ? AND source_id = ?')
    .bind(String(chatId), sourceId)
    .run();

  const entries = Object.entries(map);
  if (entries.length === 0) return;

  // 批量插入
  const stmt = db.prepare(
    `INSERT INTO affections (chat_id, source_id, target_id, first_name, value, updated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))`
  );
  const batch = entries.map(([targetId, rec]) =>
    stmt.bind(String(chatId), sourceId, Number(targetId), rec.firstName, rec.value)
  );
  await db.batch(batch);
}

/* ---------- 公开 API ---------- */

/**
 * 确保好感度相关表已创建。
 * 可以在 Worker 入口或命令处理器中调用，幂等。
 */
export async function initAffectionTables(db: D1Database): Promise<void> {
  await ensureDB(db);
}

/**
 * 读取某 (chat, source) 的好感度 map。
 * 优先查询数据库，无数据则从 KV 读取并自动迁移到数据库。
 */
export async function readAffectionMap(
  db: D1Database | undefined,
  kv: KVNamespace,
  chatId: string | number,
  sourceId: number
): Promise<Record<string, { firstName: string; value: number }>> {
  if (db) {
    try {
      await ensureDB(db);
      const { results } = await db
        .prepare('SELECT target_id, first_name, value FROM affections WHERE chat_id = ? AND source_id = ?')
        .bind(String(chatId), sourceId)
        .all<{ target_id: number; first_name: string; value: number }>();

      if (results && results.length > 0) {
        const map: Record<string, { firstName: string; value: number }> = {};
        for (const row of results) {
          map[String(row.target_id)] = {
            firstName: row.first_name || '',
            value: row.value || 0,
          };
        }
        return map;
      }
    } catch (e) {
      console.error('[affectionDB] readAffectionMap DB 查询失败，回退到 KV', e);
    }
  }

  // 回退到 KV
  const map = await readAffectionMapFromKV(kv, chatId, sourceId);

  // 如果有 DB，将 KV 数据迁移到数据库
  if (db && Object.keys(map).length > 0) {
    await writeMapToDB(db, chatId, sourceId, map).catch((e) =>
      console.error('[affectionDB] 迁移 KV→DB 失败', e)
    );
  }

  return map;
}

/**
 * 写入好感度 map。
 * 只写入数据库，不回写 KV。失败时返回错误信息，由调用方决定如何处理。
 */
export async function writeAffectionMap(
  db: D1Database,
  kv: KVNamespace,
  chatId: string | number,
  sourceId: number,
  map: Record<string, { firstName: string; value: number }>
): Promise<{ ok: boolean; error?: string }> {
  try {
    await ensureDB(db);
    await writeMapToDB(db, chatId, sourceId, map);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[affectionDB] writeAffectionMap DB 写入失败', e);
    return { ok: false, error: msg };
  }
}

/**
 * 原子增加某 (chat, source) 对 target 的好感度。
 */
export async function incrementAffection(
  db: D1Database | undefined,
  kv: KVNamespace,
  chatId: string | number,
  sourceId: number,
  targetId: number,
  firstName: string,
  delta: number
): Promise<{ ok: boolean; value?: number; error?: string }> {
  if (!Number.isFinite(delta) || Math.floor(delta) !== delta || delta <= 0) {
    return { ok: false, error: 'invalid delta' };
  }

  if (db) {
    try {
      await ensureDB(db);
      const row = await db
        .prepare(
          `INSERT INTO affections (chat_id, source_id, target_id, first_name, value, updated_at)
           VALUES (?, ?, ?, ?, ?, datetime('now'))
           ON CONFLICT(chat_id, source_id, target_id) DO UPDATE SET
             first_name = excluded.first_name,
             value = affections.value + excluded.value,
             updated_at = datetime('now')
           RETURNING value`
        )
        .bind(String(chatId), sourceId, targetId, firstName, delta)
        .first<{ value: number }>();

      if (row) {
        return { ok: true, value: Number(row.value || 0) };
      }
      return { ok: false, error: 'increment returned no row' };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[affectionDB] incrementAffection DB 写入失败', e);
      return { ok: false, error: msg };
    }
  }

  try {
    const map = await readAffectionMapFromKV(kv, chatId, sourceId);
    const key = String(targetId);
    const next = Number(map[key]?.value || 0) + delta;
    map[key] = { firstName, value: next };
    await writeAffectionMapToKV(kv, chatId, sourceId, map);
    return { ok: true, value: next };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[affectionDB] incrementAffection KV 写入失败', e);
    return { ok: false, error: msg };
  }
}

/**
 * 获取本群内对某 target 的好感度排行榜。
 * 合并 DB 和 KV 结果：DB 中已有的 source 不再从 KV 重复读取，
 * KV 中尚未迁移的 source 会被补充进来并写入 DB。
 */
export async function getAffectionRanking(
  db: D1Database | undefined,
  kv: KVNamespace,
  chatId: string | number,
  targetId: number
): Promise<Array<{ sourceId: number; firstName: string; value: number }>> {
  const rows: Array<{ sourceId: number; firstName: string; value: number }> = [];
  const dbSourceIds = new Set<number>(); // 已在 DB 中的 source，跳过 KV 读取

  // 1. 查询 DB
  if (db) {
    try {
      await ensureDB(db);
      const { results } = await db
        .prepare(
          'SELECT source_id, first_name, value FROM affections WHERE chat_id = ? AND target_id = ? AND source_id != ?'
        )
        .bind(String(chatId), targetId, targetId)
        .all<{ source_id: number; first_name: string; value: number }>();

      if (results) {
        for (const row of results) {
          rows.push({
            sourceId: row.source_id,
            firstName: row.first_name || '',
            value: row.value || 0,
          });
          dbSourceIds.add(row.source_id);
        }
      }
    } catch (e) {
      console.error('[affectionDB] getAffectionRanking DB 查询失败，仅使用 KV', e);
    }
  }

  // 2. 遍历本群 KV 补充未迁移的 source（前缀含 chatId）
  const migratedSources = new Set<number>();
  const targetKey = String(targetId);
  const kvPrefix = `affection:${chatId}:`;
  let cursor: string | undefined;

  do {
    const list = await kv.list({ prefix: kvPrefix, cursor });
    const keys = (list.keys ?? []) as Array<{ name: string }>;

    for (const k of keys) {
      const sourceId = Number(k.name.slice(kvPrefix.length));
      if (Number.isNaN(sourceId) || sourceId === targetId) continue;
      if (dbSourceIds.has(sourceId)) continue; // 已在 DB 中，跳过

      const raw = await kv.get(k.name);
      if (!raw) continue;
      try {
        const map = JSON.parse(raw) as Record<string, { firstName: string; value: number }>;
        const rec = map[targetKey];
        if (rec) {
          rows.push({ sourceId, firstName: rec.firstName, value: Number(rec.value || 0) });
          migratedSources.add(sourceId);
        }
      } catch {
        // 跳过解析失败的条目
      }
    }

    cursor = (list as any).cursor;
  } while (cursor);

  // 3. 将 KV 中发现的新 source 迁移到 DB
  if (db && migratedSources.size > 0) {
    for (const sid of migratedSources) {
      try {
        const map = await readAffectionMapFromKV(kv, chatId, sid);
        if (Object.keys(map).length > 0) {
          await writeMapToDB(db, chatId, sid, map);
        }
      } catch (e) {
        console.error('[affectionDB] 迁移排行数据到 DB 失败', e);
      }
    }
  }

  // 4. 排序返回
  rows.sort((a, b) => b.value - a.value);
  return rows;
}

/**
 * 获取用户在本群最近一次免费送花日期。
 * 优先从数据库查询，无数据则从 KV 读取并迁移。
 */
export async function getRoseSendDate(
  db: D1Database | undefined,
  kv: KVNamespace,
  chatId: string | number,
  userId: number
): Promise<string | null> {
  if (db) {
    try {
      await ensureDB(db);
      const row = await db
        .prepare('SELECT send_date FROM rose_sends WHERE chat_id = ? AND user_id = ?')
        .bind(String(chatId), userId)
        .first<{ send_date: string }>();

      if (row) {
        return row.send_date;
      }
    } catch (e) {
      console.error('[affectionDB] getRoseSendDate DB 查询失败，回退到 KV', e);
    }
  }

  // 回退到 KV
  const sendKey = `rose_send:${chatId}:${userId}`;
  const date = await kv.get(sendKey);

  // 迁移到 DB
  if (db && date) {
    try {
      await db.prepare(
        `INSERT OR REPLACE INTO rose_sends (chat_id, user_id, send_date, updated_at)
         VALUES (?, ?, ?, datetime('now'))`
      )
        .bind(String(chatId), userId, date)
        .run();
    } catch (e) {
      console.error('[affectionDB] 迁移 rose_send 到 DB 失败', e);
    }
  }

  return date;
}

/**
 * 原子占用用户在本群当天的免费送花次数。
 * 返回 true 表示本次成功占用免费次数；false 表示今天已经占用过。
 */
export async function claimDailyFreeRoseSend(
  db: D1Database | undefined,
  kv: KVNamespace,
  chatId: string | number,
  userId: number,
  date: string
): Promise<boolean> {
  if (db) {
    try {
      await ensureDB(db);
      const row = await db
        .prepare(
          `INSERT INTO rose_sends (chat_id, user_id, send_date, updated_at)
           VALUES (?, ?, ?, datetime('now'))
           ON CONFLICT(chat_id, user_id) DO UPDATE SET
             send_date = excluded.send_date,
             updated_at = datetime('now')
           WHERE rose_sends.send_date != excluded.send_date
           RETURNING user_id`
        )
        .bind(String(chatId), userId, date)
        .first<{ user_id: number }>();

      return Boolean(row);
    } catch (e) {
      console.error('[affectionDB] claimDailyFreeRoseSend DB 写入失败', e);
      return false;
    }
  }

  const sendKey = `rose_send:${chatId}:${userId}`;
  const lastSendDate = await kv.get(sendKey);
  if (lastSendDate === date) return false;
  await kv.put(sendKey, date);
  return true;
}

/**
 * 记录用户在本群的免费送花日期。
 * 仅写入数据库，不再回写 KV。
 */
export async function setRoseSendDate(
  db: D1Database,
  _kv: KVNamespace,
  chatId: string | number,
  userId: number,
  date: string
): Promise<void> {
  try {
    await db
      .prepare(
        `INSERT OR REPLACE INTO rose_sends (chat_id, user_id, send_date, updated_at)
         VALUES (?, ?, ?, datetime('now'))`
      )
      .bind(String(chatId), userId, date)
      .run();
  } catch (e) {
    console.error('[affectionDB] setRoseSendDate DB 写入失败', e);
  }
}

export default {
  initAffectionTables,
  readAffectionMap,
  writeAffectionMap,
  incrementAffection,
  getAffectionRanking,
  getRoseSendDate,
  claimDailyFreeRoseSend,
  setRoseSendDate,
};
