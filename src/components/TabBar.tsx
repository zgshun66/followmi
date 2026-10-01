import React from 'react';
import { IconToday, IconRecords, IconSettings } from './CatIcons';

export type TabKey = 'today' | 'records' | 'settings';

interface TabDef {
  key: TabKey;
  label: string;
  icon: React.ReactNode;
}

const TABS: TabDef[] = [
  { key: 'today', label: '今日', icon: <IconToday size={22} /> },
  { key: 'records', label: '记录', icon: <IconRecords size={22} /> },
  { key: 'settings', label: '设置', icon: <IconSettings size={22} /> },
];

interface TabBarProps {
  active: TabKey;
  onChange: (key: TabKey) => void;
}

export default function TabBar({ active, onChange }: TabBarProps) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto flex max-w-md border-t border-cream bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      {TABS.map((t) => {
        const isActive = t.key === active;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            aria-current={isActive ? 'page' : undefined}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] transition-colors ${
              isActive ? 'font-semibold text-leaf' : 'text-cocoa/60'
            }`}
          >
            <span className={`rounded-full px-3 py-0.5 transition-colors ${isActive ? 'bg-mint/60 text-leaf' : ''}`}>
              {t.icon}
            </span>
            <span>{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
