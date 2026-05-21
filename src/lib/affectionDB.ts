/**
 * @file lib/affectionDB.ts
 * @description 好感度系统的数据库存储层。
 *   使用 D1 数据库存储好感度数据，同时保留 KV 回退机制以支持平滑迁移。
 *
 *   迁移策略：
 *   - 读操作：优先从数据库查询，没有数据则从 KV 读取并自动写入数据库
 *   - 写操作：只写入数据库，不回写 KV
 *   - 排行榜：优先从数据库查询，数据库无数据则遍历 KV
 */

// 数据库初始化（惰性，只执行一次）
let dbInitPromise: Promise<void> | null = null;

async function ensureDB(db: D1Database): Promise<void> {
  if (!dbInitPromise) {
    dbInitPromise = db.exec(`
      CREATE TABLE IF NOT EXISTS affections (
        source_id INTEGER NOT NULL,
        target_id INTEGER NOT NULL,
        first_name TEXT NOT NULL DEFAULT '',
        value INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (source_id, target_id)
      );
      CREATE TABLE IF NOT EXISTS rose_sends (
        user_id INTEGER PRIMARY KEY,
        send_date TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `).catch((e) => {
      // 建表失败时重置 promise，允许下次重试
      dbInitPromise = null;
      console.error('[affectionDB] 建表失败', e);
      throw e;
    });
  }
  return dbInitPromise;
}

/* ---------- KV 辅助（用于回退） ---------- */

async function readAffectionMapFromKV(
  kv: KVNamespace,
  sourceId: number
): Promise<Record<string, { firstName: string; value: number }>> {
  const key = `affection:${sourceId}`;
  const raw = await kv.get(key);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, { firstName: string; value: number }>;
  } catch {
    return {};
  }
}

async function writeMapToDB(
  db: D1Database,
  sourceId: number,
  map: Record<string, { firstName: string; value: number }>
): Promise<void> {
  // 先删除该 source 的旧数据
  await db.prepare('DELETE FROM affections WHERE source_id = ?').bind(sourceId).run();

  const entries = Object.entries(map);
  if (entries.length === 0) return;

  // 批量插入
  const stmt = db.prepare(
    `INSERT INTO affections (source_id, target_id, first_name, value, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))`
  );
  const batch = entries.map(([targetId, rec]) =>
    stmt.bind(sourceId, Number(targetId), rec.firstName, rec.value)
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
 * 读取某 source 的好感度 map。
 * 优先查询数据库，无数据则从 KV 读取并自动迁移到数据库。
 */
export async function readAffectionMap(
  db: D1Database | undefined,
  kv: KVNamespace,
  sourceId: number
): Promise<Record<string, { firstName: string; value: number }>> {
  if (db) {
    try {
      await ensureDB(db);
      const { results } = await db
        .prepare('SELECT target_id, first_name, value FROM affections WHERE source_id = ?')
        .bind(sourceId)
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
  const map = await readAffectionMapFromKV(kv, sourceId);

  // 如果有 DB，将 KV 数据迁移到数据库（不阻塞返回）
  if (db && Object.keys(map).length > 0) {
    writeMapToDB(db, sourceId, map).catch((e) =>
      console.error('[affectionDB] 迁移 KV→DB 失败', e)
    );
  }

  return map;
}

/**
 * 写入好感度 map。
 * 只写入数据库，不回写 KV。
 */
export async function writeAffectionMap(
  db: D1Database,
  kv: KVNamespace,
  sourceId: number,
  map: Record<string, { firstName: string; value: number }>
): Promise<void> {
  try {
    await ensureDB(db);
    await writeMapToDB(db, sourceId, map);
  } catch (e) {
    console.error('[affectionDB] writeAffectionMap DB 写入失败', e);
  }
}

/**
 * 获取对某 target 的好感度排行榜。
 * 优先查询数据库，无数据则遍历 KV 并迁移。
 */
export async function getAffectionRanking(
  db: D1Database | undefined,
  kv: KVNamespace,
  targetId: number
): Promise<Array<{ sourceId: number; firstName: string; value: number }>> {
  if (db) {
    try {
      await ensureDB(db);
      const { results } = await db
        .prepare(
          'SELECT source_id, first_name, value FROM affections WHERE target_id = ? AND source_id != ? ORDER BY value DESC'
        )
        .bind(targetId, targetId)
        .all<{ source_id: number; first_name: string; value: number }>();

      if (results && results.length > 0) {
        return results.map((row) => ({
          sourceId: row.source_id,
          firstName: row.first_name || '',
          value: row.value || 0,
        }));
      }
    } catch (e) {
      console.error('[affectionDB] getAffectionRanking DB 查询失败，回退到 KV', e);
    }
  }

  // 回退到 KV：遍历所有 affection:* key
  const rows: Array<{ sourceId: number; firstName: string; value: number }> = [];
  const migratedSources = new Set<number>();

  let cursor: string | undefined;
  const targetKey = String(targetId);

  do {
    const list = await kv.list({ prefix: 'affection:', cursor });
    const keys = (list.keys ?? []) as Array<{ name: string }>;

    for (const k of keys) {
      const parts = k.name.split(':');
      if (parts.length < 2) continue;
      const sourceId = Number(parts[1]);
      if (Number.isNaN(sourceId) || sourceId === targetId) continue;

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

  // 如果 DB 可用且有 KV 数据，异步迁移到数据库
  if (db && migratedSources.size > 0) {
    (async () => {
      try {
        await ensureDB(db);
        for (const sid of migratedSources) {
          const map = await readAffectionMapFromKV(kv, sid);
          if (Object.keys(map).length > 0) {
            await writeMapToDB(db, sid, map);
          }
        }
      } catch (e) {
        console.error('[affectionDB] 迁移排行数据到 DB 失败', e);
      }
    })();
  }

  rows.sort((a, b) => b.value - a.value);
  return rows;
}

/**
 * 获取用户最近一次免费送花日期。
 * 优先从数据库查询，无数据则从 KV 读取并迁移。
 */
export async function getRoseSendDate(
  db: D1Database | undefined,
  kv: KVNamespace,
  userId: number
): Promise<string | null> {
  if (db) {
    try {
      await ensureDB(db);
      const row = await db
        .prepare('SELECT send_date FROM rose_sends WHERE user_id = ?')
        .bind(userId)
        .first<{ send_date: string }>();

      if (row) {
        return row.send_date;
      }
    } catch (e) {
      console.error('[affectionDB] getRoseSendDate DB 查询失败，回退到 KV', e);
    }
  }

  // 回退到 KV
  const sendKey = `rose_send:${userId}`;
  const date = await kv.get(sendKey);

  // 迁移到 DB
  if (db && date) {
    db.prepare(
      `INSERT OR REPLACE INTO rose_sends (user_id, send_date, updated_at)
       VALUES (?, ?, datetime('now'))`
    )
      .bind(userId, date)
      .run()
      .catch((e) => console.error('[affectionDB] 迁移 rose_send 到 DB 失败', e));
  }

  return date;
}

/**
 * 记录用户免费送花日期。
 * 只写入数据库，不回写 KV。
 */
export async function setRoseSendDate(
  db: D1Database,
  kv: KVNamespace,
  userId: number,
  date: string
): Promise<void> {
  try {
    await ensureDB(db);
    await db
      .prepare(
        `INSERT OR REPLACE INTO rose_sends (user_id, send_date, updated_at)
         VALUES (?, ?, datetime('now'))`
      )
      .bind(userId, date)
      .run();
  } catch (e) {
    console.error('[affectionDB] setRoseSendDate DB 写入失败', e);
  }
}

export default {
  initAffectionTables,
  readAffectionMap,
  writeAffectionMap,
  getAffectionRanking,
  getRoseSendDate,
  setRoseSendDate,
};
