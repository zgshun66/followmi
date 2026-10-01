import React, { useState } from 'react';
import TabBar, { type TabKey } from './components/TabBar';
import { useApp } from './context/AppContext';
import { CatMark, CatSilhouette } from './components/CatIcons';
import TodayView from './views/TodayView';
import RecordsView from './views/RecordsView';
import SettingsView from './views/SettingsView';

const TITLES: Record<TabKey, string> = {
  today: '今日任务',
  records: '打卡记录',
  settings: '设置',
};

export default function App() {
  const [tab, setTab] = useState<TabKey>('today');
  const { loading, error, storageMode } = useApp();

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col bg-paper pb-24">
      <header className="sticky top-0 z-30 border-b border-cream bg-paper/90 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-2.5">
          <CatMark size={36} />
          <div className="leading-tight">
            <h1 className="text-lg font-extrabold text-leaf">follow咪</h1>
            <p className="text-[11px] text-cocoa">{TITLES[tab]}</p>
          </div>
        </div>
      </header>

      {storageMode === 'memory' && (
        <div className="bg-sun/25 px-4 py-2 text-xs leading-relaxed text-cocoa">
          当前环境禁用了本地数据库（常见于应用内预览面板或浏览器隐私模式），数据仅在本次打开内有效。请用 iPhone Safari 或普通桌面浏览器打开以正常保存。
        </div>
      )}

      <main className="flex-1 px-4 py-4">
        {loading ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2 text-cocoa/70">
            <CatSilhouette size={54} className="anim-wiggle text-leaf/40" />
            <span className="text-sm">加载中…</span>
          </div>
        ) : error ? (
          <div className="rounded-xl2 border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
            初始化失败：{error}
          </div>
        ) : (
          <>
            {tab === 'today' && <TodayView />}
            {tab === 'records' && <RecordsView />}
            {tab === 'settings' && <SettingsView />}
          </>
        )}
      </main>

      <TabBar active={tab} onChange={setTab} />
    </div>
  );
}
