import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import type { Task } from '../types';
import { isDueOn, requiredTimesOn, getRemaining, scheduleText } from '../utils/schedule';
import { PawPrint, PawPrintOutline, CatPose, CatCoverPlaceholder, FishIcon } from '../components/CatIcons';
import CatGreeting from '../components/CatGreeting';
import VideoPlayer from '../components/VideoPlayer';
import LinkPlayer from '../components/LinkPlayer';
import CheckinFlash from '../components/CheckinFlash';

export default function TodayView() {
  const { tasks, checkins, addCheckin } = useApp();
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const [playing, setPlaying] = useState<Task | null>(null);
  const [flash, setFlash] = useState(false);

  const dueTasks = useMemo(() => tasks.filter((t) => isDueOn(t, today)), [tasks, today]);

  // 今天还没做够的任务数（用于顶部云朵里的提示）
  const remainingTasks = useMemo(
    () => dueTasks.filter((t) => getRemaining(t, checkins, today) > 0).length,
    [dueTasks, checkins, today],
  );

  const doCheckin = async (task: Task) => {
    await addCheckin({
      taskId: task.id,
      taskName: task.name,
      type: task.type,
      ts: Date.now(),
    });
    setFlash(true);
  };

  return (
    <div className="space-y-4">
      <CatGreeting remaining={remainingTasks} total={dueTasks.length} />

      {dueTasks.length === 0 ? (
        <div className="rounded-xl2 border border-cream bg-white p-6 text-center shadow-card">
          <CatPose pose="stretch" width={168} className="mx-auto text-mint" />
          <p className="mt-2 text-sm text-cocoa">今天没有安排的任务，咪陪你伸个懒腰~</p>
          <FishIcon size={34} className="mx-auto mt-2 text-sun" />
        </div>
      ) : (
        dueTasks.map((task) => {
          const required = requiredTimesOn(task, today);
          const remaining = getRemaining(task, checkins, today);
          const done = required - remaining;
          const finished = remaining === 0;
          return (
            <div key={task.id} className="rounded-xl2 border border-cream bg-white p-3 shadow-card">
              <div className="flex gap-3">
                <div className="h-20 w-28 shrink-0 overflow-hidden rounded-xl">
                  {task.cover ? (
                    <img src={task.cover} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <CatCoverPlaceholder className="h-full w-full" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <span className="truncate font-bold text-ink">{task.name}</span>
                    <span className="shrink-0 text-[11px] text-cocoa">{scheduleText(task.schedule)}</span>
                  </div>

                  <div className="mt-1.5 flex flex-wrap items-center gap-0.5">
                    {Array.from({ length: Math.min(required, 12) }).map((_, i) =>
                      i < done ? (
                        <PawPrint key={i} size={16} color="#7E9142" />
                      ) : (
                        <PawPrintOutline key={i} size={16} color="#D2E096" />
                      ),
                    )}
                    <span className="ml-1 text-xs text-cocoa">
                      {done}/{required}
                    </span>
                  </div>

                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setPlaying(task)}
                      disabled={finished}
                      className="flex-1 rounded-lg bg-leaf py-1.5 text-sm font-semibold text-cream disabled:opacity-40"
                    >
                      {task.type === 'upload' ? '播放视频' : '打开 / 播放'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void doCheckin(task)}
                      disabled={finished}
                      className="rounded-lg bg-sun px-3 py-1.5 text-sm font-semibold text-ink disabled:opacity-40"
                    >
                      打卡
                    </button>
                  </div>
                </div>
              </div>

              {finished && <p className="mt-2 text-center text-xs font-medium text-leaf">今日已完成 🐾</p>}
            </div>
          );
        })
      )}

      {playing &&
        (playing.type === 'upload' ? (
          <VideoPlayer
            task={playing}
            onComplete={() => void doCheckin(playing)}
            onClose={() => setPlaying(null)}
          />
        ) : (
          <LinkPlayer
            task={playing}
            onComplete={() => void doCheckin(playing)}
            onClose={() => setPlaying(null)}
          />
        ))}

      <CheckinFlash show={flash} onDone={() => setFlash(false)} />
    </div>
  );
}
