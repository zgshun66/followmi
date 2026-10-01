import type { Task, Checkin } from '../types';
import { requiredTimesOn } from './schedule';

/** Date -> YYYY-MM-DD（本地时区）。 */
export function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** YYYY-MM-DD -> 本地 Date（零点）。 */
export function fromDateStr(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** 归零到当天 00:00。 */
export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** 本周一 00:00（以周一为一周起点）。 */
export function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  const offset = (x.getDay() + 6) % 7; // 0=周一 ... 6=周日
  x.setDate(x.getDate() - offset);
  return x;
}

/** 本月 1 号 00:00。 */
export function startOfMonth(d: Date): Date {
  const x = startOfDay(d);
  x.setDate(1);
  return x;
}

/** 年初 00:00。 */
export function startOfYear(d: Date): Date {
  const x = startOfDay(d);
  x.setMonth(0, 1);
  return x;
}

/** 累计打卡次数。 */
export function getTotalCheckins(checkins: Checkin[]): number {
  return checkins.length;
}

/** 按日期（YYYY-MM-DD）统计打卡次数。 */
export function getCheckinCountsByDate(checkins: Checkin[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const c of checkins) {
    const ds = toDateStr(new Date(c.ts));
    counts.set(ds, (counts.get(ds) ?? 0) + 1);
  }
  return counts;
}

/**
 * 当前连续打卡天数：从今天起向前数连续有打卡的日期。
 * 若今天尚未打卡，则从昨天开始计算（避免断签误判）。
 */
export function getCurrentStreak(checkins: Checkin[]): number {
  if (checkins.length === 0) return 0;
  const days = new Set(checkins.map((c) => toDateStr(new Date(c.ts))));
  let streak = 0;
  const cursor = startOfDay(new Date());
  if (!days.has(toDateStr(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
  }
  while (days.has(toDateStr(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/**
 * 某周期内的完成率（%）：应完成总次数 vs 实际完成总次数。
 * 周期范围为 [periodStart, periodEnd]（含两端），通常 periodEnd 取今天，
 * 以避免对尚未到来的日期计入分母。
 */
export function getCompletionRate(
  checkins: Checkin[],
  tasks: Task[],
  periodStart: Date,
  periodEnd: Date,
): number {
  let required = 0;
  let actual = 0;
  const cursor = startOfDay(periodStart);
  const end = startOfDay(periodEnd);
  while (cursor.getTime() <= end.getTime()) {
    for (const t of tasks) required += requiredTimesOn(t, cursor);
    const ds = toDateStr(cursor);
    actual += checkins.filter((c) => toDateStr(new Date(c.ts)) === ds).length;
    cursor.setDate(cursor.getDate() + 1);
  }
  if (required === 0) return 0;
  return Math.min(100, Math.round((actual / required) * 100));
}

/** 热力图数据点。 */
export interface HeatCell {
  date: string;
  count: number;
}

/**
 * 生成最近 weeks 周（按周日为列、7 行为行）的每日打卡次数。
 * （保留旧接口；新版日历已改用周/月/年视图。）
 */
export function getHeatmap(checkins: Checkin[], weeks = 16): HeatCell[] {
  const counts = getCheckinCountsByDate(checkins);
  const today = startOfDay(new Date());
  const end = new Date(today);
  end.setDate(end.getDate() + (6 - end.getDay())); // 对齐到周六

  const start = new Date(end);
  start.setDate(start.getDate() - (weeks * 7 - 1));

  const result: HeatCell[] = [];
  for (const d = new Date(start); d.getTime() <= end.getTime(); d.setDate(d.getDate() + 1)) {
    const ds = toDateStr(d);
    result.push({ date: ds, count: counts.get(ds) ?? 0 });
  }
  return result;
}
