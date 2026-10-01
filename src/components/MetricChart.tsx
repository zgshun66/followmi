import React from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

export interface ChartDataset {
  label: string;
  data: (number | null)[]; // 与 labels 对齐，缺失为 null
  borderColor: string;
  backgroundColor: string;
  spanGaps: boolean;
  tension: number;
}

interface MetricChartProps {
  labels: string[];
  datasets: ChartDataset[];
}

export default function MetricChart({ labels, datasets }: MetricChartProps) {
  const data = { labels, datasets };
  const grid = 'rgba(201, 221, 113, 0.35)';
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index' as const, intersect: false },
    plugins: {
      legend: { position: 'bottom' as const, labels: { color: '#4A5130', boxWidth: 12 } },
    },
    scales: {
      x: {
        ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 8, color: '#857A57' },
        grid: { color: grid },
      },
      y: {
        beginAtZero: false,
        ticks: { color: '#857A57' },
        grid: { color: grid },
      },
    },
  };

  return (
    <div style={{ height: 280 }}>
      <Line data={data} options={options} />
    </div>
  );
}
