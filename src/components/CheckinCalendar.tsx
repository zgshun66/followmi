import React, { useMemo, useState } from 'react';
import type { Checkin } from '../types';
import { getCheckinCountsByDate, startOfWeek, toDateStr } from '../utils/stats';
import { PawPrint, PawPrintOutline } from './CatIcons';

type Period = 'week' | 'month' | 'year';

const WD_MON_FIRST = ['一', '二', '三', '四', '五', '六', '日'];

/* ---------------- 每年视图：按次数随机散布爪印 ---------------- */

/** 年视图单格高度（px）。12 格 × 3 列，不会因此撑破布局。 */
const YEAR_CELL_H = 80;
/** 标签行「n月 | 次数」的高度（px），爪印散布区从它下面开始。 */
const YEAR_HEAD_H = 20;
/** 格内边距（px），爪印中心再额外内缩「半个爪印」，保证不溢出。 */
const YEAR_EDGE = 4;
/** 抖动幅度：相对单元尺寸的比例（±）。 */
const JITTER = 0.4;
/** 旋转幅度（度，±）。 */
const ROT_DEG = 25;

/**
 * 确定性伪随机（mulberry32）。同一个种子永远给出同一串数——
 * 所以同一个月每次重渲染爪印位置完全一致，界面不会闪跳。
 * @param {number} seed 32 位无符号种子
 * @returns {() => number} 返回 [0,1) 的取数函数
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * 抖动网格：把一块归一化区域（x,y ∈ [0,1]）切成 cols×rows 个单元，
 * 每只爪印落在「所在单元中心 + 随机抖动」处，并叠加一个随机小角度。
 *
 * 单元数按面积铺满 count 只爪印、且长宽比贴合区域（本视图的格子偏宽扁），
 * 避免方阵在高次数时竖向挤成一坨、或在次数较少时只占上半格。
 *
 * @param {number} count 爪印数（≥1）
 * @param {number} seed 确定性随机种子
 * @returns {{x:number,y:number,rot:number}[]} 归一化坐标 + 旋转角（度）
 */
function scatterPaws(count: number, seed: number): { x: number; y: number; rot: number }[] {
  const rnd = mulberry32(seed);
  // 年视图格内可用区域大致「宽 : 高 ≈ 2 : 1」，据此选列数，让单元接近方形。
  const aspect = 2;
  const cols = Math.max(1, Math.round(Math.sqrt(count * aspect)));
  const rows = Math.max(1, Math.ceil(count / cols));
  const cellW = 1 / cols;
  const cellH = 1 / rows;
  const pts: { x: number; y: number; rot: number }[] = [];
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = (col + 0.5) * cellW + (rnd() * 2 - 1) * JITTER * cellW;
    const y = (row + 0.5) * cellH + (rnd() * 2 - 1) * JITTER * cellH;
    const rot = (rnd() * 2 - 1) * ROT_DEG;
    pts.push({ x: clamp01(x), y: clamp01(y), rot });
  }
  return pts;
}

/** 爪印尺寸随当月次数自适应（次数越多，爪印越小、越密）。 */
function pawSizeFor(count: number): number {
  if (count <= 6) return 11;
  if (count <= 14) return 9;
  if (count <= 24) return 7.5;
  if (count <= 40) return 6;
  return 5;
}

interface CheckinCalendarProps {
  checkins: Checkin[];
}

/** 打卡日历：按「每周 / 每月 / 每年」呈现，每打卡一次显示一只猫爪印。 */
export default function CheckinCalendar({ checkins }: CheckinCalendarProps) {
  const [period, setPeriod] = useState<Period>('week');
  const [offset, setOffset] = useState(0); // 0=当前周期，1=上一个，以此类推
  const counts = useMemo(() => getCheckinCountsByDate(checkins), [checkins]);
  const today = new Date();

  const switchPeriod = (p: Period) => {
    setPeriod(p);
    setOffset(0);
  };

  // ---------- 每周 ----------
  const weekStart = useMemo(() => {
    const d = startOfWeek(today);
    d.setDate(d.getDate() - offset * 7);
    return d;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset]);

  const weekDays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart);
        d.setDate(weekStart.getDate() + i);
        return d;
      }),
    [weekStart],
  );

  const weekTotal = weekDays.reduce((s, d) => s + (counts.get(toDateStr(d)) ?? 0), 0);

  // ---------- 每月 ----------
  const monthBase = useMemo(() => new Date(today.getFullYear(), today.getMonth() - offset, 1), [offset]);
  const monthCells = useMemo(() => {
    const y = monthBase.getFullYear();
    const m = monthBase.getMonth();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const lead = (new Date(y, m, 1).getDay() + 6) % 7; // 周一为第一列
    const cells: (Date | null)[] = [];
    for (let i = 0; i < lead; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(y, m, d));
    return cells;
  }, [monthBase]);
  const monthTotal = monthCells.reduce(
    (s, d) => s + (d ? counts.get(toDateStr(d)) ?? 0 : 0),
    0,
  );

  // ---------- 每年 ----------
  const year = today.getFullYear() - offset;
  const yearMonthTotals = useMemo(() => {
    const totals = new Array(12).fill(0) as number[];
    for (const [ds, c] of counts.entries()) {
      if (ds.startsWith(`${year}-`)) {
        const m = Number(ds.slice(5, 7)) - 1;
        if (m >= 0 && m < 12) totals[m] += c;
      }
    }
    return totals;
  }, [counts, year]);
  const yearTotal = yearMonthTotals.reduce((a, b) => a + b, 0);
  const yearMax = Math.max(1, ...yearMonthTotals);

  // 每月一撮爪印：位置由 (year*100+month) 作种子确定性生成，随 counts / year 变化重算。
  const yearPaws = useMemo(
    () => yearMonthTotals.map((total, m) => (total > 0 ? scatterPaws(total, year * 100 + m) : [])),
    [yearMonthTotals, year],
  );

  const navBtn =
    'flex h-7 w-7 items-center justify-center rounded-full bg-cream/70 text-cocoa disabled:opacity-30';

  return (
    <div className="rounded-xl2 border border-cream bg-white p-4 shadow-card">
      <div className="flex items-center justify-between">
        <div className="flex rounded-full bg-cream/60 p-0.5">
          {(['week', 'month', 'year'] as Period[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => switchPeriod(p)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                period === p ? 'bg-leaf text-cream' : 'text-cocoa'
              }`}
            >
              {{ week: '每周', month: '每月', year: '每年' }[p]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <button type="button" className={navBtn} onClick={() => setOffset((o) => o + 1)} aria-label="上一周期">
            ‹
          </button>
          <button
            type="button"
            className={navBtn}
            disabled={offset === 0}
            onClick={() => setOffset((o) => Math.max(0, o - 1))}
            aria-label="下一周期"
          >
            ›
          </button>
        </div>
      </div>

      <div className="mt-1 text-center text-xs text-cocoa">
        {period === 'week' &&
          `${weekStart.getFullYear()}年${weekStart.getMonth() + 1}月${weekStart.getDate()}日 起这一周`}
        {period === 'month' && `${monthBase.getFullYear()}年${monthBase.getMonth() + 1}月`}
        {period === 'year' && `${year}年`}
      </div>

      <div className="mt-3">
        {period === 'week' && (
          <div className="grid grid-cols-7 gap-1.5">
            {weekDays.map((d) => {
              const ds = toDateStr(d);
              const c = counts.get(ds) ?? 0;
              const isToday = ds === toDateStr(today);
              return (
                <div
                  key={ds}
                  className={`flex flex-col items-center rounded-xl py-2 ${
                    isToday ? 'bg-mint/30 ring-1 ring-leaf/40' : ''
                  }`}
                >
                  <span className="text-[10px] text-cocoa/70">{WD_MON_FIRST[(d.getDay() + 6) % 7]}</span>
                  <span className="text-sm font-bold text-ink">{d.getDate()}</span>
                  <div className="mt-1 flex min-h-[50px] w-full flex-col items-center gap-0.5">
                    {c === 0 ? (
                      <PawPrintOutline size={13} color="#D2E096" />
                    ) : (
                      Array.from({ length: Math.min(c, 5) }).map((_, i) => (
                        <PawPrint key={i} size={13} color="#7E9142" />
                      ))
                    )}
                    {c > 5 && <span className="text-[10px] font-semibold text-leaf">×{c}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {period === 'month' && (
          <div>
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-cocoa/70">
              {WD_MON_FIRST.map((w) => (
                <span key={w}>{w}</span>
              ))}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {monthCells.map((d, i) => {
                if (!d) return <div key={`e${i}`} />;
                const ds = toDateStr(d);
                const c = counts.get(ds) ?? 0;
                const isToday = ds === toDateStr(today);
                return (
                  <div
                    key={ds}
                    title={`${ds}：${c} 次`}
                    className={`flex min-h-[44px] flex-col items-center rounded-lg py-1 ${
                      isToday ? 'bg-mint/30 ring-1 ring-leaf/40' : c > 0 ? 'bg-cream/40' : ''
                    }`}
                  >
                    <span className="text-[11px] font-medium text-ink">{d.getDate()}</span>
                    {c > 0 && (
                      <div className="mt-0.5 flex flex-wrap items-center justify-center gap-[1px]">
                        {Array.from({ length: Math.min(c, 3) }).map((_, k) => (
                          <PawPrint key={k} size={9} color="#7E9142" />
                        ))}
                        {c > 3 && <span className="text-[9px] font-semibold text-leaf">×{c}</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {period === 'year' && (
          <div className="grid grid-cols-3 gap-2">
            {yearMonthTotals.map((total, m) => {
              const alpha = total > 0 ? 0.2 + 0.45 * (total / yearMax) : 0.08;
              const size = pawSizeFor(total);
              const paws = yearPaws[m] ?? [];
              const inset = YEAR_EDGE + size / 2;
              return (
                <div
                  key={m}
                  title={`${m + 1}月：${total} 次`}
                  className="relative overflow-hidden rounded-xl"
                  style={{ height: YEAR_CELL_H, backgroundColor: `rgba(201, 221, 113, ${alpha})` }}
                >
                  <div className="relative z-10 flex items-center justify-between px-1.5 pt-1">
                    <span className="text-[11px] font-medium text-cocoa">{m + 1}月</span>
                    <span className="text-[10px] font-semibold text-leaf/90">{total || '—'}</span>
                  </div>
                  {total > 0 && (
                    <div
                      className="absolute"
                      style={{ left: inset, right: inset, bottom: inset, top: YEAR_HEAD_H + 2 + size / 2 }}
                    >
                      {paws.map((p, i) => (
                        <span
                          key={i}
                          data-paw="1"
                          className="absolute"
                          style={{
                            left: `${p.x * 100}%`,
                            top: `${p.y * 100}%`,
                            transform: `translate(-50%, -50%) rotate(${p.rot}deg)`,
                          }}
                        >
                          <PawPrint size={size} color="#7E9142" />
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {period === 'year' && (
        <p className="mt-2 text-center text-[11px] text-cocoa/80">
          每格按当月打卡次数随机铺爪印，打卡越多越密
        </p>
      )}

      <div className="mt-3 text-center text-xs text-cocoa">
        共 <span className="font-bold text-leaf">{period === 'week' ? weekTotal : period === 'month' ? monthTotal : yearTotal}</span> 个爪印
      </div>
    </div>
  );
}
