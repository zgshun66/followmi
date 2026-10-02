import React, { useEffect, useRef, useState } from 'react';
import type { Task } from '../types';

interface VideoPlayerProps {
  task: Task;
  /**
   * 今日还差的次数（剩余额度），由 TodayView 依据「最新的 checkins」实时算好后传进来。
   * 播放器内部不自己数数，免得拿着陈旧快照把自己锁死。
   */
  remaining: number;
  /** 视频结束或手动标记完成时的回调。 */
  onComplete: () => void;
  onClose: () => void;
}

/** 记一次打卡后按钮的兜底解锁时间（毫秒）：万一 remaining 没能刷新，也不至于永久禁用。 */
const UNLOCK_FALLBACK_MS = 2500;

/**
 * 全屏上传视频播放器：
 * - 监听 ended 事件自动触发完成；
 * - 支持「同一视频再来一次」：remaining > 0 时主按钮变「再来一次」，点击即从头重播；
 * - 提供手动「标记完成」兜底；
 * - 「横屏全屏」优先调用 iOS webkitEnterFullscreen，否则回退标准 Fullscreen API。
 */
export default function VideoPlayer({ task, remaining, onComplete, onClose }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [url, setUrl] = useState('');
  // 本次打开面板后是否已至少完成过一次：用于把主按钮从「标记完成」切成「再来一次」。
  const [started, setStarted] = useState(false);
  // 记一次打卡后短暂禁用按钮，等父组件回传新的 remaining，防止手快连点重复计数。
  const [busy, setBusy] = useState(false);
  const unlockTimer = useRef<number | null>(null);

  const finished = remaining <= 0;

  useEffect(() => {
    if (!task.videoBlob) return;
    const objectUrl = URL.createObjectURL(task.videoBlob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [task.videoBlob]);

  // remaining 一变（说明上一次打卡已经落库、父组件重算过了），立刻解除 busy 并撤掉兜底计时器。
  useEffect(() => {
    setBusy(false);
    if (unlockTimer.current !== null) {
      window.clearTimeout(unlockTimer.current);
      unlockTimer.current = null;
    }
  }, [remaining]);

  // 卸载时清掉兜底计时器，避免对已卸载组件 setState。
  useEffect(() => {
    return () => {
      if (unlockTimer.current !== null) window.clearTimeout(unlockTimer.current);
    };
  }, []);

  const markComplete = () => {
    // 次数由父组件实时下发，这里只在还有额度时才记一次；因此播完一次不会再被锁死。
    if (finished || busy) return;
    setBusy(true);
    setStarted(true);
    onComplete();
    // 兜底解锁：解锁本依赖 remaining 变化，但 doCheckin 失败时 remaining 不会变，
    // 光靠它会把按钮永久禁用。挂一个一次性计时器，无论如何都恢复可点。
    if (unlockTimer.current !== null) window.clearTimeout(unlockTimer.current);
    unlockTimer.current = window.setTimeout(() => setBusy(false), UNLOCK_FALLBACK_MS);
  };

  // 从头重播：先回到 0 秒再 play。个别浏览器在视频还没加载完时设 currentTime 会抛错，忽略即可。
  const replay = () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      video.currentTime = 0;
    } catch {
      /* 忽略设置失败 */
    }
    const p = video.play();
    if (p && typeof p.catch === 'function') p.catch(() => undefined);
  };

  const enterLandscapeFullscreen = () => {
    const video = videoRef.current;
    if (!video) return;
    // @ts-expect-error webkit 前缀为非标准 API
    if (typeof video.webkitEnterFullscreen === 'function') {
      // @ts-expect-error webkit 前缀为非标准 API
      video.webkitEnterFullscreen();
    } else if (video.requestFullscreen) {
      video.requestFullscreen().catch(() => undefined);
    }
    try {
      // @ts-expect-error screen.orientation.lock 在部分浏览器不存在
      screen.orientation?.lock?.('landscape').catch(() => undefined);
    } catch {
      /* 忽略不支持的环境 */
    }
  };

  const mainDisabled = finished || busy;
  const mainLabel = finished ? '已打卡 ✓' : started ? '再来一次' : '标记完成';
  const mainOnClick = finished ? undefined : started ? replay : markComplete;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ink">
      <div className="flex items-center justify-between px-4 py-3 text-cream">
        <span className="truncate font-semibold">{task.name}</span>
        <button
          type="button"
          onClick={onClose}
          className="ml-2 shrink-0 rounded-full bg-cream/15 px-3 py-1 text-sm"
        >
          关闭
        </button>
      </div>

      <div className="flex flex-1 items-center justify-center bg-black">
        {url ? (
          <video
            ref={videoRef}
            src={url}
            controls
            playsInline
            className="max-h-full max-w-full bg-black"
            onEnded={markComplete}
          />
        ) : (
          <span className="text-cream/60">视频加载中…</span>
        )}
      </div>

      <div className="flex flex-col gap-3 p-4">
        {!finished && (
          <p className="text-center text-xs text-cream/60">今日还差 {remaining} 次，练完自动记一次</p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={enterLandscapeFullscreen}
            className="flex-1 rounded-xl bg-sun py-3 font-bold text-ink"
          >
            横屏全屏
          </button>
          <button
            type="button"
            onClick={mainOnClick}
            disabled={mainDisabled}
            className="flex-1 rounded-xl bg-leaf py-3 font-bold text-cream disabled:opacity-50"
          >
            {mainLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
