/**
 * 从本地视频文件截取一帧作为封面（返回 dataURL）。
 * 失败时返回 null，调用方回退到占位封面。
 */
export interface ThumbOptions {
  /** 截取时间点（秒），默认 1s */
  time?: number;
  /** 输出最大宽度，默认 480 */
  maxWidth?: number;
  /** JPEG 质量，默认 0.72 */
  quality?: number;
}

export function generateVideoThumbnail(
  file: Blob,
  opts: ThumbOptions = {},
): Promise<string | null> {
  const { time = 1, maxWidth = 480, quality = 0.72 } = opts;
  return new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve(null);
      return;
    }
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    const url = URL.createObjectURL(file);

    let settled = false;
    let timer: number | undefined;

    const finish = (result: string | null) => {
      if (settled) return;
      settled = true;
      if (timer) window.clearTimeout(timer);
      URL.revokeObjectURL(url);
      video.removeAttribute('src');
      resolve(result);
    };

    const capture = () => {
      try {
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        if (!vw || !vh) {
          finish(null);
          return;
        }
        const scale = Math.min(1, maxWidth / vw);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(vw * scale));
        canvas.height = Math.max(1, Math.round(vh * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          finish(null);
          return;
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        finish(canvas.toDataURL('image/jpeg', quality));
      } catch {
        finish(null);
      }
    };

    video.onloadeddata = () => {
      const dur = Number.isFinite(video.duration) ? video.duration : 0;
      const target = Math.min(time, Math.max(0, dur - 0.1));
      try {
        video.currentTime = Number.isFinite(target) && target > 0 ? target : 0;
      } catch {
        capture();
      }
    };
    video.onseeked = capture;
    video.onerror = () => finish(null);

    // 兜底：4 秒内未成功也尝试截取当前帧 / 放弃
    timer = window.setTimeout(capture, 4000);

    video.src = url;
  });
}
