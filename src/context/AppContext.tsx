import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { Task, Checkin, Metric, BodyEntry, BackupData } from '../types';
import * as db from '../db/database';
import { uid } from '../utils/id';

interface AppContextValue {
  tasks: Task[];
  checkins: Checkin[];
  metrics: Metric[];
  bodyEntries: BodyEntry[];
  loading: boolean;
  error: string | null;
  storageMode: 'indexeddb' | 'memory';
  reload: () => Promise<void>;

  saveTask: (task: Task) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;

  addCheckin: (input: Omit<Checkin, 'id'>) => Promise<void>;

  saveMetric: (metric: Metric) => Promise<void>;
  deleteMetric: (id: string) => Promise<void>;

  saveBodyEntry: (entry: BodyEntry) => Promise<void>;

  exportAll: () => Promise<BackupData>;
  importAll: (data: Partial<BackupData>) => Promise<void>;
  resetAll: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [bodyEntries, setBodyEntries] = useState<BodyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [storageMode, setStorageMode] = useState<'indexeddb' | 'memory'>('indexeddb');

  const reload = useCallback(async () => {
    const [t, c, m, b] = await Promise.all([
      db.getAllTasks(),
      db.getAllCheckins(),
      db.getAllMetrics(),
      db.getAllBodyEntries(),
    ]);
    setTasks(t);
    setCheckins(c);
    setMetrics(m);
    setBodyEntries(b);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await db.initDefaults();
        await reload();
        if (active) {
          setStorageMode(db.getStorageMode());
          setLoading(false);
        }
      } catch (err) {
        console.error('[fitness-pwa] 初始化失败:', err);
        if (active) {
          setStorageMode(db.getStorageMode());
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [reload]);

  const saveTask = useCallback(
    async (task: Task) => {
      await db.saveTask(task);
      await reload();
    },
    [reload],
  );

  const deleteTask = useCallback(
    async (id: string) => {
      await db.deleteTask(id);
      await reload();
    },
    [reload],
  );

  const addCheckin = useCallback(
    async (input: Omit<Checkin, 'id'>) => {
      const checkin: Checkin = { ...input, id: uid() };
      await db.addCheckin(checkin);
      await reload();
    },
    [reload],
  );

  const saveMetric = useCallback(
    async (metric: Metric) => {
      await db.saveMetric(metric);
      await reload();
    },
    [reload],
  );

  const deleteMetric = useCallback(
    async (id: string) => {
      await db.deleteMetric(id);
      await reload();
    },
    [reload],
  );

  const saveBodyEntry = useCallback(
    async (entry: BodyEntry) => {
      // 同一天只保留一条记录，按日期去重更新。
      const existing = await db.getBodyEntryByDate(entry.date);
      const toSave: BodyEntry = existing ? { ...entry, id: existing.id } : entry;
      await db.saveBodyEntry(toSave);
      await reload();
    },
    [reload],
  );

  const exportAll = useCallback(async (): Promise<BackupData> => {
    const [t, c, m, b] = await Promise.all([
      db.getAllTasks(),
      db.getAllCheckins(),
      db.getAllMetrics(),
      db.getAllBodyEntries(),
    ]);
    // 视频 Blob 无法序列化为 JSON，导出时置空并由导入方忽略。
    const tasks = t.map((task) => ({ ...task, videoBlob: undefined }));
    return {
      version: 1,
      exportedAt: Date.now(),
      tasks,
      checkins: c,
      metrics: m,
      bodyEntries: b,
    };
  }, []);

  const importAll = useCallback(
    async (data: Partial<BackupData>) => {
      await db.clearAll();
      await db.bulkPut('tasks', Array.isArray(data.tasks) ? data.tasks : []);
      await db.bulkPut('checkins', Array.isArray(data.checkins) ? data.checkins : []);
      await db.bulkPut('metrics', Array.isArray(data.metrics) ? data.metrics : []);
      await db.bulkPut('bodyEntries', Array.isArray(data.bodyEntries) ? data.bodyEntries : []);
      if (!data.metrics || data.metrics.length === 0) {
        await db.initDefaults();
      }
      await reload();
    },
    [reload],
  );

  const resetAll = useCallback(async () => {
    await db.clearAll();
    await db.initDefaults();
    await reload();
  }, [reload]);

  const value: AppContextValue = {
    tasks,
    checkins,
    metrics,
    bodyEntries,
    loading,
    error,
    storageMode,
    reload,
    saveTask,
    deleteTask,
    addCheckin,
    saveMetric,
    deleteMetric,
    saveBodyEntry,
    exportAll,
    importAll,
    resetAll,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

/** 在 AppProvider 内访问全局数据与方法。 */
export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useApp 必须在 <AppProvider> 内部使用');
  }
  return ctx;
}
