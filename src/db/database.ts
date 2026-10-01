import { openDB, type IDBPDatabase } from 'idb';
import type { Task, Checkin, Metric, BodyEntry } from '../types';
import { defaultMetrics } from './seed';

const DB_NAME = 'fitness_pwa';
const DB_VERSION = 1;

export const STORES = ['tasks', 'checkins', 'metrics', 'bodyEntries'] as const;
export type StoreName = (typeof STORES)[number];

type Row = { id: string } & Record<string, unknown>;

/**
 * 统一存储接口：真实实现走 IndexedDB，不可用时降级为内存实现。
 */
interface Backend {
  getAll(store: StoreName): Promise<Row[]>;
  put(store: StoreName, val: Row): Promise<void>;
  delete(store: StoreName, key: string): Promise<void>;
  count(store: StoreName): Promise<number>;
  bulkPut(store: StoreName, items: unknown[]): Promise<void>;
  clearAll(): Promise<void>;
}

/** 真实 IndexedDB 后端（封装 idb）。 */
class RealBackend implements Backend {
  constructor(private db: IDBPDatabase) {}

  getAll(store: StoreName) {
    return this.db.getAll(store) as Promise<Row[]>;
  }
  async put(store: StoreName, val: Row) {
    await this.db.put(store, val);
  }
  delete(store: StoreName, key: string) {
    return this.db.delete(store, key);
  }
  count(store: StoreName) {
    return this.db.count(store);
  }
  async bulkPut(store: StoreName, items: unknown[]) {
    const tx = this.db.transaction(store, 'readwrite');
    for (const it of items) await tx.store.put(it as Row);
    await tx.done;
  }
  async clearAll() {
    const tx = this.db.transaction(STORES as unknown as StoreName[], 'readwrite');
    for (const s of STORES) await tx.objectStore(s).clear();
    await tx.done;
  }
}

/** 内存后端：沙箱预览 / 隐私模式等 IndexedDB 不可用时的兜底。数据仅在本次会话内有效。 */
class MemBackend implements Backend {
  private maps: Record<StoreName, Map<string, Row>> = {
    tasks: new Map(),
    checkins: new Map(),
    metrics: new Map(),
    bodyEntries: new Map(),
  };

  async getAll(store: StoreName) {
    return [...this.maps[store].values()];
  }
  async put(store: StoreName, val: Row) {
    this.maps[store].set(val.id, val);
  }
  async delete(store: StoreName, key: string) {
    this.maps[store].delete(key);
  }
  async count(store: StoreName) {
    return this.maps[store].size;
  }
  async bulkPut(store: StoreName, items: unknown[]) {
    for (const it of items) {
      const row = it as Row | undefined;
      if (row && typeof row.id === 'string') this.maps[store].set(row.id, row);
    }
  }
  async clearAll() {
    for (const s of STORES) this.maps[s].clear();
  }
}

let backendPromise: Promise<Backend> | null = null;
let storageMode: 'indexeddb' | 'memory' = 'indexeddb';

/**
 * 打开 IndexedDB 的等待上限。某些环境（应用内预览沙箱、无头浏览器、部分隐私模式）
 * 里 `indexedDB.open()` 既不触发 success 也不触发 error，会一直挂着——
 * 只靠 catch 兜不住这种「假死」，所以这里必须加超时。
 * 空白库正常打开在几十毫秒内，4 秒已非常宽裕。
 */
const OPEN_TIMEOUT_MS = 4000;

async function openRealBackend(): Promise<Backend> {
  const dbPromise = openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      for (const store of STORES) {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store, { keyPath: 'id' });
        }
      }
    },
  });
  // 超时胜出后再被拒绝时避免「未处理的 Promise 拒绝」
  dbPromise.catch(() => {});

  const timeout = new Promise<never>((_, reject) => {
    setTimeout(
      () => reject(new Error(`IndexedDB 打开超时（超过 ${OPEN_TIMEOUT_MS}ms 无响应）`)),
      OPEN_TIMEOUT_MS,
    );
  });

  try {
    const db = await Promise.race([dbPromise, timeout]);
    storageMode = 'indexeddb';
    return new RealBackend(db);
  } catch (err) {
    console.warn(
      '[follow咪] IndexedDB 不可用，已回退到内存存储（本次打开内数据不持久化）:',
      err,
    );
    storageMode = 'memory';
    return new MemBackend();
  }
}

/** 获取（单例）后端；自动检测 IndexedDB 可用性并降级。 */
function getBackend(): Promise<Backend> {
  if (!backendPromise) {
    const supported = typeof indexedDB !== 'undefined' && indexedDB !== null;
    if (supported) {
      backendPromise = openRealBackend();
    } else {
      console.warn('[follow咪] 当前环境没有 IndexedDB，使用内存存储。');
      storageMode = 'memory';
      backendPromise = Promise.resolve(new MemBackend());
    }
  }
  return backendPromise;
}

/** 当前存储模式：indexeddb = 已持久化；memory = 兜底（不持久化）。 */
export function getStorageMode(): 'indexeddb' | 'memory' {
  return storageMode;
}

// ---------------- tasks ----------------
export async function getAllTasks(): Promise<Task[]> {
  const rows = await getBackend().then((b) => b.getAll('tasks'));
  return rows as unknown as Task[];
}

export async function saveTask(task: Task): Promise<void> {
  await (await getBackend()).put('tasks', task as unknown as Row);
}

export async function deleteTask(id: string): Promise<void> {
  await (await getBackend()).delete('tasks', id);
}

// ---------------- checkins ----------------
export async function getAllCheckins(): Promise<Checkin[]> {
  const rows = await getBackend().then((b) => b.getAll('checkins'));
  return rows as unknown as Checkin[];
}

export async function addCheckin(checkin: Checkin): Promise<void> {
  await (await getBackend()).put('checkins', checkin as unknown as Row);
}

// ---------------- metrics ----------------
export async function getAllMetrics(): Promise<Metric[]> {
  const rows = await getBackend().then((b) => b.getAll('metrics'));
  return rows as unknown as Metric[];
}

export async function saveMetric(metric: Metric): Promise<void> {
  await (await getBackend()).put('metrics', metric as unknown as Row);
}

export async function deleteMetric(id: string): Promise<void> {
  await (await getBackend()).delete('metrics', id);
}

// ---------------- bodyEntries ----------------
export async function getAllBodyEntries(): Promise<BodyEntry[]> {
  const rows = await getBackend().then((b) => b.getAll('bodyEntries'));
  return rows as unknown as BodyEntry[];
}

export async function saveBodyEntry(entry: BodyEntry): Promise<void> {
  await (await getBackend()).put('bodyEntries', entry as unknown as Row);
}

/** 按日期查找身体录入（日期字符串唯一）。 */
export async function getBodyEntryByDate(date: string): Promise<BodyEntry | undefined> {
  const all = await getAllBodyEntries();
  return all.find((e) => e.date === date);
}

// ---------------- 批量 / 重置 ----------------
/** 批量写入（用于导入）。 */
export async function bulkPut(store: StoreName, items: unknown[]): Promise<void> {
  await (await getBackend()).bulkPut(store, items);
}

/** 清空全部数据表。 */
export async function clearAll(): Promise<void> {
  await (await getBackend()).clearAll();
}

/** 首次运行时写入默认指标（仅当 metrics 为空）。 */
export async function initDefaults(): Promise<void> {
  const b = await getBackend();
  const count = await b.count('metrics');
  if (count === 0) {
    await b.bulkPut('metrics', defaultMetrics as unknown as Row[]);
  }
}
