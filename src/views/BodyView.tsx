import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import type { Metric, BodyEntry } from '../types';
import { uid } from '../utils/id';
import { toDateStr } from '../utils/stats';
import { colorFor, colorWithAlpha } from '../utils/color';
import MetricChart from '../components/MetricChart';

export default function BodyView() {
  const { metrics, bodyEntries, saveMetric, deleteMetric, saveBodyEntry } = useApp();

  const [dateStr, setDateStr] = useState(toDateStr(new Date()));
  const [values, setValues] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [newName, setNewName] = useState('');
  const [newUnit, setNewUnit] = useState('');

  useEffect(() => {
    const entry = bodyEntries.find((e) => e.date === dateStr);
    const v: Record<string, string> = {};
    for (const m of metrics) {
      v[m.id] = entry?.values[m.id] != null ? String(entry.values[m.id]) : '';
    }
    setValues(v);
  }, [dateStr, bodyEntries, metrics]);

  useEffect(() => {
    if (selected.length === 0 && metrics.length > 0) {
      setSelected([metrics[0].id]);
    }
  }, [metrics, selected.length]);

  const handleSaveEntry = async () => {
    const vals: Record<string, number> = {};
    for (const m of metrics) {
      const raw = values[m.id];
      if (raw !== undefined && raw !== '' && !Number.isNaN(Number(raw))) {
        vals[m.id] = Number(raw);
      }
    }
    const entry: BodyEntry = { id: uid(), date: dateStr, values: vals };
    await saveBodyEntry(entry);
    window.alert('已保存 🐾');
  };

  const handleAddMetric = async () => {
    if (!newName.trim()) return;
    await saveMetric({ id: uid(), name: newName.trim(), unit: newUnit.trim() || '-' });
    setNewName('');
    setNewUnit('');
  };

  const handleRemoveMetric = (metric: Metric) => {
    if (window.confirm(`删除指标「${metric.name}」？历史录入中该指标的数据仍保留，但不再显示。`)) {
      void deleteMetric(metric.id);
    }
  };

  const toggleMetric = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const chartData = useMemo(() => {
    const sorted = [...bodyEntries].sort((a, b) => (a.date < b.date ? -1 : 1));
    const labels = sorted.map((e) => e.date);
    const datasets = metrics
      .filter((m) => selected.includes(m.id))
      .map((m) => ({
        label: `${m.name} (${m.unit})`,
        data: sorted.map((e) => (e.values[m.id] != null ? e.values[m.id] : null)),
        borderColor: colorFor(m.id),
        backgroundColor: colorWithAlpha(m.id, 0.15),
        spanGaps: true,
        tension: 0.3,
      }));
    return { labels, datasets };
  }, [bodyEntries, metrics, selected]);

  const sectionCls = 'rounded-xl2 border border-cream bg-white p-4 shadow-card';
  const inputCls =
    'rounded-lg border border-cream px-3 py-2 text-sm outline-none focus:border-leaf';

  return (
    <div className="space-y-4">
      <section className={sectionCls}>
        <h2 className="font-bold text-ink">身体指标</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {metrics.map((m) => (
            <span
              key={m.id}
              className="inline-flex items-center gap-1 rounded-full bg-cream/60 px-3 py-1 text-sm text-ink"
            >
              {m.name}
              <span className="text-cocoa/70">{m.unit}</span>
              <button
                type="button"
                onClick={() => handleRemoveMetric(m)}
                className="text-rose-500"
                aria-label={`删除 ${m.name}`}
              >
                ×
              </button>
            </span>
          ))}
          {metrics.length === 0 && <span className="text-sm text-cocoa/70">暂无指标</span>}
        </div>

        <div className="mt-3 flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="新指标名，如：体脂%"
            className={`flex-1 ${inputCls}`}
          />
          <input
            value={newUnit}
            onChange={(e) => setNewUnit(e.target.value)}
            placeholder="单位"
            className={`w-20 ${inputCls}`}
          />
          <button
            type="button"
            onClick={handleAddMetric}
            className="rounded-lg bg-leaf px-3 py-1.5 text-sm font-semibold text-cream"
          >
            添加
          </button>
        </div>
      </section>

      <section className={sectionCls}>
        <h2 className="font-bold text-ink">录入数据</h2>
        <label className="mt-2 block">
          <span className="text-sm text-cocoa">日期</span>
          <input
            type="date"
            value={dateStr}
            onChange={(e) => setDateStr(e.target.value)}
            className={`mt-1 w-full ${inputCls}`}
          />
        </label>

        <div className="mt-3 space-y-2">
          {metrics.map((m) => (
            <div key={m.id} className="flex items-center gap-2">
              <span className="w-24 shrink-0 text-sm text-cocoa">
                {m.name}
                <span className="text-cocoa/60"> ({m.unit})</span>
              </span>
              <input
                type="number"
                step="any"
                inputMode="decimal"
                value={values[m.id] ?? ''}
                onChange={(e) => setValues((prev) => ({ ...prev, [m.id]: e.target.value }))}
                placeholder="—"
                className={`flex-1 ${inputCls}`}
              />
            </div>
          ))}
          {metrics.length === 0 && <p className="text-sm text-cocoa/70">请先在上方添加指标。</p>}
        </div>

        <button
          type="button"
          onClick={handleSaveEntry}
          disabled={metrics.length === 0}
          className="mt-3 w-full rounded-lg bg-leaf py-2.5 font-semibold text-cream disabled:opacity-40"
        >
          保存当天数据
        </button>
      </section>

      <section className={sectionCls}>
        <h2 className="font-bold text-ink">趋势图</h2>
        {metrics.length > 1 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {metrics.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => toggleMetric(m.id)}
                className={`rounded-full px-3 py-1 text-xs transition-colors ${
                  selected.includes(m.id) ? 'bg-leaf text-cream' : 'bg-cream/60 text-cocoa'
                }`}
              >
                {m.name}
              </button>
            ))}
          </div>
        )}
        <div className="mt-3">
          {selected.length > 0 && bodyEntries.length > 0 ? (
            <MetricChart labels={chartData.labels} datasets={chartData.datasets} />
          ) : (
            <p className="py-10 text-center text-sm text-cocoa/60">暂无数据，先录入几天身体数据吧。</p>
          )}
        </div>
      </section>
    </div>
  );
}
