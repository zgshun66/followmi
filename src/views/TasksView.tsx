import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import type { Task } from '../types';
import { scheduleText } from '../utils/schedule';
import { uid } from '../utils/id';
import { CatCoverPlaceholder } from '../components/CatIcons';
import TaskForm from './TaskForm';

export default function TasksView() {
  const { tasks, saveTask, deleteTask } = useApp();
  const [form, setForm] = useState<{ task: Task; isNew: boolean } | null>(null);

  const openNew = () => {
    const blank: Task = {
      id: uid(),
      name: '',
      type: 'upload',
      schedule: { mode: 'daily', perTimes: 1 },
      createdAt: Date.now(),
    };
    setForm({ task: blank, isNew: true });
  };

  const openEdit = (task: Task) => {
    setForm({ task: { ...task }, isNew: false });
  };

  const handleSave = async (task: Task) => {
    await saveTask(task);
    setForm(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-cocoa">共 {tasks.length} 个任务</span>
        <button
          type="button"
          onClick={openNew}
          className="rounded-lg bg-leaf px-3 py-1.5 text-sm font-semibold text-cream"
        >
          + 新增任务
        </button>
      </div>

      {tasks.length === 0 && (
        <div className="rounded-xl2 border border-cream bg-white p-6 text-center text-sm text-cocoa shadow-card">
          还没有任务，点「新增任务」添加第一个跟练视频吧。
        </div>
      )}

      {tasks.map((task) => (
        <div
          key={task.id}
          className="flex items-center gap-3 rounded-xl2 border border-cream bg-white p-3 shadow-card"
        >
          <div className="h-14 w-20 shrink-0 overflow-hidden rounded-lg">
            {task.cover ? (
              <img src={task.cover} alt="" className="h-full w-full object-cover" />
            ) : (
              <CatCoverPlaceholder className="h-full w-full" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold text-ink">{task.name}</div>
            <div className="mt-0.5 text-xs text-cocoa">
              {task.type === 'upload' ? '上传视频' : '链接 / 嵌入'} · {scheduleText(task.schedule)}
            </div>
          </div>
          <div className="flex shrink-0 flex-col gap-1.5">
            <button
              type="button"
              onClick={() => openEdit(task)}
              className="rounded-lg bg-cream/60 px-3 py-1 text-xs text-ink"
            >
              编辑
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`确定删除任务「${task.name}」？`)) {
                  void deleteTask(task.id);
                }
              }}
              className="rounded-lg bg-rose-50 px-3 py-1 text-xs text-rose-600"
            >
              删除
            </button>
          </div>
        </div>
      ))}

      {form && (
        <TaskForm
          task={form.task}
          isNew={form.isNew}
          onClose={() => setForm(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
