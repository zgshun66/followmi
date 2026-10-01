// 临时：给预览注入一批跨月打卡数据，用于核对「每年」密度视图与统计卡片。
// 仅在本地核对时通过 CDP 执行，不进任何构建产物。
(async () => {
  const DB = 'fitness_pwa';
  const open = () =>
    new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const s of ['tasks', 'checkins', 'metrics', 'bodyEntries']) {
          if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

  const db = await open();
  const put = (store, rows) =>
    new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      for (const r of rows) tx.objectStore(store).put(r);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  const clear = (store) =>
    new Promise((resolve) => {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).clear();
      tx.oncomplete = () => resolve();
    });

  await Promise.all(['tasks', 'checkins', 'bodyEntries'].map(clear));

  const tasks = [
    { id: 't1', name: '晨间拉伸', type: 'upload', schedule: { mode: 'daily', perTimes: 1 }, createdAt: Date.now() },
    { id: 't2', name: 'HIIT 燃脂 20 分钟', type: 'link', schedule: { mode: 'weekly', perTimes: 1, weekdays: [1, 3, 5] }, createdAt: Date.now() },
    { id: 't3', name: '核心训练', type: 'upload', schedule: { mode: 'daily', perTimes: 2 }, createdAt: Date.now() },
    { id: 't4', name: '晚间瑜伽', type: 'link', schedule: { mode: 'weekly', perTimes: 1, weekdays: [0, 2, 4, 6] }, createdAt: Date.now() },
  ];
  await put('tasks', tasks);

  // 每月密度不同：1 月最密，往里递减，模拟“打卡越来越多”的一年
  const now = new Date();
  const year = now.getFullYear();
  const monthlyTarget = [46, 42, 38, 30, 34, 26, 20, 24, 16, 12, 8, 4];
  const checkins = [];
  let n = 0;
  for (let m = 0; m < 12; m++) {
    const daysInMonth = new Date(year, m + 1, 0).getDate();
    let left = monthlyTarget[m];
    for (let d = 1; d <= daysInMonth && left > 0; d++) {
      const day = new Date(year, m, d);
      if (day > now) break;
      // 隔天休息一点，让日历有疏有密
      const take = (d % 7 === 0 ? 0 : m < 9 ? 1 + (d % 2) : 1) || 1;
      for (let k = 0; k < Math.min(take, left); k++) {
        const t = tasks[(d + k) % tasks.length];
        checkins.push({
          id: `c${n++}`,
          taskId: t.id,
          taskName: t.name,
          type: t.type,
          ts: new Date(year, m, d, 7 + k * 6, 20).getTime(),
        });
      }
      left -= take;
    }
  }
  await put('checkins', checkins);

  const today = new Date();
  const body = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i * 6);
    const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    body.push({ id: `b${i}`, date: ds, values: { 'm_weight': 68.4 - (6 - i) * 0.35, 'm_waist': 84 - (6 - i) * 0.6 } });
  }
  await put('bodyEntries', body);

  return `tasks=${tasks.length} checkins=${checkins.length} body=${body.length}`;
})();
