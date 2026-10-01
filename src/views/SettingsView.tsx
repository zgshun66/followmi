import React, { useRef } from 'react';
import { useApp } from '../context/AppContext';
import type { BackupData } from '../types';
import TasksView from './TasksView';
import { CatMark } from '../components/CatIcons';

export default function SettingsView() {
  const { exportAll, importAll, resetAll } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);

  const handleExport = async () => {
    const data = await exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `followmi-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text) as Partial<BackupData>;
      if (!window.confirm('导入将清空并覆盖当前所有数据，确定继续？')) {
        return;
      }
      await importAll(data);
      window.alert('导入成功');
    } catch {
      window.alert('文件解析失败，请确认是有效的备份 JSON 文件。');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleReset = async () => {
    if (!window.confirm('确定要清空全部数据（任务、打卡、身体数据）吗？此操作不可恢复！')) {
      return;
    }
    if (!window.confirm('再次确认：所有数据将被删除并恢复默认指标。')) {
      return;
    }
    await resetAll();
    window.alert('已重置为初始状态');
  };

  const sectionCls = 'rounded-xl2 border border-cream bg-white p-4 shadow-card';

  return (
    <div className="space-y-4">
      <section>
        <h2 className="mb-2 px-1 font-bold text-ink">任务管理</h2>
        <TasksView />
      </section>

      <section className={sectionCls}>
        <h2 className="font-bold text-ink">数据备份</h2>
        <p className="mt-1 text-xs leading-relaxed text-cocoa/80">
          导出为 JSON 文件；导入将覆盖当前数据。注意：上传的视频文件与封面不含在 JSON 中。
        </p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={handleExport}
            className="flex-1 rounded-lg bg-leaf py-2.5 font-semibold text-cream"
          >
            导出 JSON
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex-1 rounded-lg bg-cream/60 py-2.5 font-semibold text-ink"
          >
            从 JSON 导入
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={handleImportFile}
          />
        </div>
      </section>

      <section className="rounded-xl2 border border-rose-100 bg-rose-50 p-4 shadow-card">
        <h2 className="font-bold text-rose-700">危险区域</h2>
        <p className="mt-1 text-xs text-rose-400">重置将删除全部数据并恢复默认指标，请先导出备份。</p>
        <button
          type="button"
          onClick={handleReset}
          className="mt-3 w-full rounded-lg bg-rose-600 py-2.5 font-semibold text-white"
        >
          重置全部数据
        </button>
      </section>

      <section className={`${sectionCls} flex items-center gap-3`}>
        <CatMark size={42} />
        <div className="text-xs leading-relaxed text-cocoa/80">
          <p className="text-sm font-bold text-ink">follow咪 · 纯前端 PWA</p>
          <p>数据存储于浏览器 IndexedDB（fitness_pwa）。清除站点数据将丢失全部记录。</p>
        </div>
      </section>
    </div>
  );
}
