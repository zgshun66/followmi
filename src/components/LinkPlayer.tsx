import React, { useState } from 'react';
import type { Task } from '../types';
import { FishIcon } from './CatIcons';

interface LinkPlayerProps {
  task: Task;
  onComplete: () => void;
  onClose: () => void;
}

/**
 * 链接类任务的播放/跳转面板：
 * - 有 embedHtml（B站 iframe 或用户粘贴的嵌入片段）→ 用 16:9 外壳铺满渲染；
 * - 仅有 linkUrl → 提供「打开原链接」跳转（抖音/小红书等不支持内嵌的平台）；
 * - 跨域 iframe 无法检测播放结束，只能手动「标记完成」。
 */
export default function LinkPlayer({ task, onComplete, onClose }: LinkPlayerProps) {
  const [done, setDone] = useState(false);
  const embed = (task.embedHtml ?? '').trim();

  const markComplete = () => {
    if (done) return;
    setDone(true);
    onComplete();
  };

  const openBtn = task.linkUrl ? (
    <a
      href={task.linkUrl}
      target="_blank"
      rel="noreferrer"
      className="block w-full rounded-xl bg-sun py-2.5 text-center text-sm font-bold text-ink"
    >
      打开原链接
    </a>
  ) : null;

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

      <div className="flex-1 overflow-auto bg-ink px-4 pb-4">
        {embed ? (
          <>
            <div className="embed-shell" dangerouslySetInnerHTML={{ __html: embed }} />
            <p className="mt-3 text-center text-xs leading-relaxed text-cream/60">
              若播放器提示「无法播放」（部分视频有版权 / 地区限制），请点下方按钮到原站观看。
            </p>
            <div className="mt-2">{openBtn}</div>
          </>
        ) : task.linkUrl ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-4 text-center text-cream">
            <FishIcon size={54} className="text-sun/80" />
            <p className="text-sm text-cream/80">
              该平台不支持内嵌播放。请点下方按钮跳转到原链接跟练，练完回来点「标记完成」。
            </p>
            {openBtn}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-cream/60">未配置可用链接</div>
        )}
      </div>

      <div className="p-4">
        <button
          type="button"
          onClick={markComplete}
          disabled={done}
          className="w-full rounded-xl bg-leaf py-3 font-bold text-cream disabled:opacity-50"
        >
          {done ? '已打卡 ✓' : '标记完成'}
        </button>
      </div>
    </div>
  );
}
