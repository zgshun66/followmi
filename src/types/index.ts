/**
 * 全局领域模型类型定义。
 * 数据持久化于 IndexedDB（库名 fitness_pwa），由 idb 驱动。
 */

/** 任务类型：上传视频 / 外链或嵌入代码 */
export type TaskType = 'upload' | 'link';

/** 周期模式：每天 / 每周选天 */
export type ScheduleMode = 'daily' | 'weekly';

/** 周期配置 */
export interface Schedule {
  mode: ScheduleMode;
  /** 每天需要完成的次数 */
  perTimes: number;
  /** 仅 weekly 模式有效：选中的星期（0=周日 ... 6=周六） */
  weekdays?: number[];
}

/** 任务 */
export interface Task {
  id: string;
  name: string;
  type: TaskType;
  /** 上传类型：视频二进制（不随 JSON 导出） */
  videoBlob?: Blob;
  /** 上传类型：原始文件名 */
  fileName?: string;
  /** 链接类型：原始链接（B站/抖音/小红书等） */
  linkUrl?: string;
  /** 链接类型：嵌入 HTML（B站自动解析的 iframe，或用户粘贴的嵌入片段） */
  embedHtml?: string;
  /** 封面图：dataURL（上传视频截帧/用户上传）或图片链接 */
  cover?: string;
  schedule: Schedule;
  createdAt: number;
}

/** 打卡记录 */
export interface Checkin {
  id: string;
  taskId: string;
  taskName: string;
  type: TaskType;
  /** 视频时长（秒），可选 */
  duration?: number;
  /** 打卡时间戳（毫秒） */
  ts: number;
}

/** 身体指标定义 */
export interface Metric {
  id: string;
  name: string;
  unit: string;
}

/** 某一天的身体状况录入 */
export interface BodyEntry {
  id: string;
  /** 日期字符串 YYYY-MM-DD */
  date: string;
  /** metricId -> 数值 */
  values: Record<string, number>;
}

/** 导出 / 导入的完整数据快照 */
export interface BackupData {
  version: number;
  exportedAt: number;
  tasks: Task[];
  checkins: Checkin[];
  metrics: Metric[];
  bodyEntries: BodyEntry[];
}
