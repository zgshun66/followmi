import type { Metric } from '../types';

/** 首次运行时的默认身体指标。 */
export const defaultMetrics: Metric[] = [
  { id: 'm_weight', name: '体重', unit: 'kg' },
  { id: 'm_waist', name: '腰围', unit: 'cm' },
];
