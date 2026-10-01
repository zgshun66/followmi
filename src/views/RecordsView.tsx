import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  getCurrentStreak,
  getTotalCheckins,
  getCompletionRate,
  startOfWeek,
  startOfMonth,
  startOfDay,
} from '../utils/stats';
import CheckinCalendar from '../components/CheckinCalendar';
import BodyView from './BodyView';

type SubTab = 'checkin' | 'body';

export default function RecordsView() {
  const { tasks, checkins } = useApp();
  const [sub, setSub] = useState<SubTab>('checkin');

  const total = getTotalCheckins(checkins);
  const streak = getCurrentStreak(checkins);
  const today = startOfDay(new Date());
  const weekRate = getCompletionRate(checkins, tasks, startOfWeek(today), today);
  const monthRate = getCompletionRate(checkins, tasks, startOfMonth(today), today);

  const cards = [
    { label: '累计打卡', value: total, unit: '次' },
    { label: '连续打卡', value: streak, unit: '天' },
    { label: '本周完成率', value: weekRate, unit: '%' },
    { label: '本月完成率', value: monthRate, unit: '%' },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl2 border border-cream bg-white p-4 shadow-card">
            <div className="text-xs text-cocoa">{c.label}</div>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-2xl font-extrabold text-leaf">{c.value}</span>
              <span className="text-xs text-cocoa">{c.unit}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="flex rounded-full bg-cream/60 p-0.5">
        {(['checkin', 'body'] as SubTab[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSub(s)}
            className={`flex-1 rounded-full py-1.5 text-sm font-semibold transition-colors ${
              sub === s ? 'bg-leaf text-cream' : 'text-cocoa'
            }`}
          >
            {s === 'checkin' ? '打卡日历' : '身体数据'}
          </button>
        ))}
      </div>

      {sub === 'checkin' ? <CheckinCalendar checkins={checkins} /> : <BodyView />}
    </div>
  );
}
