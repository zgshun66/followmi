import React, { useEffect, useRef, useState } from 'react';
import type { Task } from '../types';

interface VideoPlayerProps {
  task: Task;
  /** 视频结束或手动标记完成时的回调。 */
  onComplete: () => void;
  onClose: () => void;
}

/**
 * 全屏上传视频播放器：
 * - 监听 ended 事件自动触发完成；
 * - 提供手动「标记完成」兜底；
 * - 「横屏全屏」优先调用 iOS webkitEnterFullscreen，否则回退标准 Fullscreen API。
 */
export default function VideoPlayer({ task, onComplete, onClose }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [url, setUrl] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!task.videoBlob) return;
    const objectUrl = URL.createObjectURL(task.videoBlob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [task.videoBlob]);

  const markComplete = () => {
    if (done) return;
    setDone(true);
    onComplete();
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

      <div className="flex gap-2 p-4">
        <button
          type="button"
          onClick={enterLandscapeFullscreen}
          className="flex-1 rounded-xl bg-sun py-3 font-bold text-ink"
        >
          横屏全屏
        </button>
        <button
          type="button"
          onClick={markComplete}
          disabled={done}
          className="flex-1 rounded-xl bg-leaf py-3 font-bold text-cream disabled:opacity-50"
        >
          {done ? '已打卡 ✓' : '标记完成'}
        </button>
      </div>
    </div>
  );
}
