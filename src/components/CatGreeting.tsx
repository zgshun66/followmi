import React, { useEffect, useState } from 'react';
import { CatPose, PawPrint } from './CatIcons';

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

/** 每 10 秒对齐一次真实时间（分钟级显示，10 秒足够且几乎无开销）。 */
function useClock(intervalMs = 10000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/** 「2026年10月1日 周四 20:27」 */
export function formatDateTime(d: Date): string {
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 周${WEEK[d.getDay()]} ${hh}:${mm}`;
}

interface CatGreetingProps {
  /** 今天还未完成的任务数量 */
  remaining: number;
  /** 今天总共安排的任务数量 */
  total: number;
}

/**
 * 今日页顶部：一只趴卧的猫 + 头顶一片云。
 * 云里报当天日期时间与剩余任务，分钟级实时刷新。
 */
export default function CatGreeting({ remaining, total }: CatGreetingProps) {
  const now = useClock();

  return (
    <div className="relative rounded-xl2 border border-cream bg-gradient-to-br from-cream/70 to-mint/35 px-3 pt-3 shadow-card">
      <div className="relative z-10 rounded-[20px] bg-white/90 px-3.5 py-2.5 shadow-soft ring-1 ring-cream">
        <p className="text-[13px] font-bold leading-snug text-ink">今天是 {formatDateTime(now)}</p>
        <p className="mt-1 text-[13px] leading-snug text-cocoa">
          {total === 0 ? (
            <>今天还没有安排任务，去「设置」里添一个吧～</>
          ) : remaining === 0 ? (
            <>
              今天的 <span className="font-bold text-leaf">{total}</span> 个任务全都完成啦，咪给你盖个爪印！
            </>
          ) : (
            <>
              还有 <span className="font-bold text-leaf">{remaining}</span> 个任务没有完成哦
            </>
          )}
        </p>

        {/* 云的尾巴：两团小圆，指向下面的猫 */}
        <span className="absolute -bottom-1.5 right-12 h-2.5 w-2.5 rounded-full bg-white/90 ring-1 ring-cream" />
        <span className="absolute -bottom-3 right-9 h-1.5 w-1.5 rounded-full bg-white/90 ring-1 ring-cream" />
      </div>

      <div className="mt-[-8px] flex items-end justify-between pl-3 pr-2">
        <span className="pb-3 text-[11px] text-cocoa/80">
          {remaining === 0 && total > 0 ? (
            <PawPrint size={18} className="text-leaf anim-pop" />
          ) : (
            'follow咪 · 陪你练'
          )}
        </span>
        <CatPose pose="loaf" width={106} color="#7E9142" className="translate-y-0.5" />
      </div>
    </div>
  );
}
