import type { Task, Checkin } from '../types';

/** 星期标签，索引与 Date.getDay() 对齐：0=周日 ... 6=周六。 */
export const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

/** 判断任务在某天是否需要做。 */
export function isDueOn(task: Task, date: Date): boolean {
  const { mode, weekdays } = task.schedule;
  if (mode === 'daily') return true;
  if (mode === 'weekly') {
    const day = date.getDay();
    return (weekdays ?? []).includes(day);
  }
  return false;
}

/** 某天该任务的计划次数（不需要则为 0）。 */
export function requiredTimesOn(task: Task, date: Date): number {
  return isDueOn(task, date) ? Math.max(0, task.schedule.perTimes || 0) : 0;
}

/** 两个 Date 是否为同一天（本地时区）。 */
export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** 某天该任务的剩余未完成次数。 */
export function getRemaining(task: Task, checkins: Checkin[], date: Date): number {
  const required = requiredTimesOn(task, date);
  const done = checkins.filter(
    (c) => c.taskId === task.id && isSameDay(new Date(c.ts), date),
  ).length;
  return Math.max(0, required - done);
}

/** 将周期配置渲染为人类可读文本。 */
export function scheduleText(schedule: Task['schedule']): string {
  if (schedule.mode === 'daily') {
    return `每天 ${Math.max(1, schedule.perTimes)} 次`;
  }
  const days = (schedule.weekdays ?? []).map((d) => WEEKDAYS[d]).join('');
  return `每周 ${days || '无'} ${Math.max(1, schedule.perTimes)} 次`;
}
