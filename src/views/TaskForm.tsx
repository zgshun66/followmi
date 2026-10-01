import React, { useMemo, useState } from 'react';
import type { Task, TaskType, Schedule, ScheduleMode } from '../types';
import { WEEKDAYS } from '../utils/schedule';
import { resolveLink } from '../utils/bilibili';
import { generateVideoThumbnail } from '../utils/thumbnail';
import { CatCoverPlaceholder } from '../components/CatIcons';

interface TaskFormProps {
  task: Task;
  isNew: boolean;
  onClose: () => void;
  onSave: (task: Task) => Promise<void>;
}

export default function TaskForm({ task, isNew, onClose, onSave }: TaskFormProps) {
  const [name, setName] = useState(task.name);
  const [type, setType] = useState<TaskType>(task.type);
  const [videoBlob, setVideoBlob] = useState<Blob | undefined>(task.videoBlob);
  const [fileName, setFileName] = useState<string | undefined>(task.fileName);
  const [linkUrl, setLinkUrl] = useState(task.linkUrl ?? '');
  const [embedHtml, setEmbedHtml] = useState(task.embedHtml ?? '');
  const [cover, setCover] = useState<string | undefined>(task.cover);
  const [generatingCover, setGeneratingCover] = useState(false);
  const [mode, setMode] = useState<ScheduleMode>(task.schedule.mode);
  const [perTimes, setPerTimes] = useState(task.schedule.perTimes);
  const [weekdays, setWeekdays] = useState<number[]>(task.schedule.weekdays ?? [1, 2, 3, 4, 5, 6, 0]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setVideoBlob(file);
    setFileName(file.name);
    setGeneratingCover(true);
    const thumb = await generateVideoThumbnail(file);
    if (thumb) setCover(thumb);
    setGeneratingCover(false);
  };

  const handleCoverFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCover(typeof reader.result === 'string' ? reader.result : undefined);
    reader.readAsDataURL(file);
  };

  const toggleWeekday = (day: number) => {
    setWeekdays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  };

  const linkInfo = useMemo(() => resolveLink(linkUrl, embedHtml), [linkUrl, embedHtml]);

  const handleSave = async () => {
    if (!name.trim()) {
      window.alert('请填写任务名称');
      return;
    }
    if (type === 'upload' && !videoBlob) {
      window.alert('请选择要上传的视频文件');
      return;
    }
    if (type === 'link' && !linkUrl.trim() && !embedHtml.trim()) {
      window.alert('请粘贴视频链接或嵌入代码');
      return;
    }

    const schedule: Schedule =
      mode === 'daily'
        ? { mode: 'daily', perTimes: Math.max(1, perTimes | 0) }
        : {
            mode: 'weekly',
            perTimes: Math.max(1, perTimes | 0),
            weekdays: weekdays.length ? weekdays : [1, 2, 3, 4, 5, 6, 0],
          };

    const updated: Task = {
      ...task,
      name: name.trim(),
      type,
      videoBlob: type === 'upload' ? videoBlob : undefined,
      fileName: type === 'upload' ? fileName : undefined,
      linkUrl: type === 'link' ? linkInfo.linkUrl : undefined,
      embedHtml: type === 'link' ? linkInfo.embedHtml : undefined,
      cover,
      schedule,
    };
    await onSave(updated);
  };

  const segBtn = (active: boolean) =>
    `flex-1 rounded-lg border py-2 text-sm font-medium transition-colors ${
      active ? 'border-leaf bg-mint/40 text-leaf' : 'border-cream text-cocoa'
    }`;
  const inputCls =
    'mt-1 w-full rounded-lg border border-cream px-3 py-2 text-sm outline-none focus:border-leaf';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="max-h-[90vh] w-full max-w-md overflow-auto rounded-t-2xl bg-paper p-5 sm:rounded-2xl">
        <h2 className="mb-4 text-lg font-bold text-ink">{isNew ? '新增任务' : '编辑任务'}</h2>

        <label className="block">
          <span className="text-sm text-cocoa">任务名称</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="如：HIIT 燃脂"
            className={inputCls}
          />
        </label>

        <div className="mt-4">
          <span className="text-sm text-cocoa">类型</span>
          <div className="mt-1 flex gap-2">
            <button type="button" onClick={() => setType('upload')} className={segBtn(type === 'upload')}>
              上传视频
            </button>
            <button type="button" onClick={() => setType('link')} className={segBtn(type === 'link')}>
              链接 / 嵌入
            </button>
          </div>
        </div>

        {type === 'upload' ? (
          <label className="mt-4 block">
            <span className="text-sm text-cocoa">视频文件</span>
            <input type="file" accept="video/*" onChange={handleFile} className="mt-1 w-full text-sm" />
            {fileName && <p className="mt-1 text-xs text-cocoa/70">已选：{fileName}</p>}
            {!fileName && task.fileName && (
              <p className="mt-1 text-xs text-cocoa/70">原文件：{task.fileName}（未重新选择则保留）</p>
            )}
          </label>
        ) : (
          <div className="mt-4 space-y-3">
            <label className="block">
              <span className="text-sm text-cocoa">视频链接（B站 / 抖音 / 小红书 等）</span>
              <input
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://..."
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className="text-sm text-cocoa">嵌入代码（可选：平台分享的 iframe / HTML）</span>
              <textarea
                value={embedHtml}
                onChange={(e) => setEmbedHtml(e.target.value)}
                placeholder="<iframe ...></iframe>"
                className="mt-1 h-20 w-full rounded-lg border border-cream px-3 py-2 font-mono text-xs outline-none focus:border-leaf"
              />
            </label>
            {linkInfo.note && (
              <p className="rounded-lg bg-cream/60 px-3 py-2 text-xs leading-relaxed text-cocoa">
                {linkInfo.note}
              </p>
            )}
          </div>
        )}

        {/* 封面 */}
        <div className="mt-4">
          <span className="text-sm text-cocoa">封面预览</span>
          <div className="mt-1 flex items-center gap-3">
            <div className="h-20 w-28 shrink-0 overflow-hidden rounded-xl border border-cream">
              {cover ? (
                <img src={cover} alt="" className="h-full w-full object-cover" />
              ) : (
                <CatCoverPlaceholder className="h-full w-full" />
              )}
            </div>
            <div className="flex flex-col gap-2">
              <label className="cursor-pointer rounded-lg bg-cream/60 px-3 py-2 text-center text-sm text-ink">
                上传封面图
                <input type="file" accept="image/*" className="hidden" onChange={handleCoverFile} />
              </label>
              {cover && (
                <button
                  type="button"
                  onClick={() => setCover(undefined)}
                  className="rounded-lg bg-rose-50 px-3 py-1 text-xs text-rose-600"
                >
                  清除封面
                </button>
              )}
            </div>
          </div>
          {type === 'upload' && (
            <p className="mt-1 text-xs text-cocoa/70">
              {generatingCover ? '正在从视频截取封面…' : '选择视频后会自动截取一帧作为封面，也可手动上传。'}
            </p>
          )}
        </div>

        <div className="mt-4">
          <span className="text-sm text-cocoa">周期</span>
          <div className="mt-1 flex gap-2">
            <button type="button" onClick={() => setMode('daily')} className={segBtn(mode === 'daily')}>
              每天
            </button>
            <button type="button" onClick={() => setMode('weekly')} className={segBtn(mode === 'weekly')}>
              每周选天
            </button>
          </div>

          {mode === 'weekly' && (
            <div className="mt-2 flex gap-1">
              {WEEKDAYS.map((label, day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleWeekday(day)}
                  className={`flex-1 rounded-lg py-1.5 text-sm ${
                    weekdays.includes(day) ? 'bg-leaf text-cream' : 'bg-cream/60 text-cocoa'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          <div className="mt-2 flex items-center gap-2">
            <span className="text-sm text-cocoa">每天 / 每次次数</span>
            <input
              type="number"
              min={1}
              value={perTimes}
              onChange={(e) => setPerTimes(Number(e.target.value))}
              className="w-20 rounded-lg border border-cream px-2 py-1 outline-none focus:border-leaf"
            />
          </div>
        </div>

        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg bg-cream/60 py-2.5 font-semibold text-ink"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex-1 rounded-lg bg-leaf py-2.5 font-semibold text-cream"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
