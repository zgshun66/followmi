import React from 'react';
import {
  CAT_ICON_PATH,
  CAT_POSES,
  CAT_VIEWBOX,
  PAW_PATH,
  PAW_VIEWBOX,
  type CatPoseKey,
} from './CatShape';

interface IconProps {
  size?: number;
  className?: string;
  color?: string;
}

/** 猫爪印（实心）。形状与 App 图标同源，严格左右对称。 */
export function PawPrint({ size = 24, className, color = 'currentColor' }: IconProps) {
  return (
    <svg
      viewBox={`0 0 ${PAW_VIEWBOX} ${PAW_VIEWBOX}`}
      width={size}
      height={size}
      className={className}
      fill={color}
      aria-hidden="true"
    >
      <path d={PAW_PATH} />
    </svg>
  );
}

/** 猫爪印（描边版，用于未完成的空位）。 */
export function PawPrintOutline({ size = 24, className, color = 'currentColor' }: IconProps) {
  return (
    <svg
      viewBox={`0 0 ${PAW_VIEWBOX} ${PAW_VIEWBOX}`}
      width={size}
      height={size}
      className={className}
      fill="none"
      stroke={color}
      strokeWidth="34"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PAW_PATH} />
    </svg>
  );
}

interface CatPoseProps extends IconProps {
  pose: CatPoseKey;
  /** 指定宽度；高度按姿态原始比例自动计算 */
  width?: number;
}

/**
 * 按姿态渲染猫咪剪影（单色，宽高比取自参考图描摹结果）。
 * 形状与 App 图标同源：scripts/gen-icons.mjs → CatShape.ts
 */
export function CatPose({ pose, width = 120, className, color = 'currentColor' }: CatPoseProps) {
  const shape = CAT_POSES[pose];
  const height = (width * shape.h) / shape.w;
  return (
    <svg
      viewBox={`0 0 ${shape.w} ${shape.h}`}
      width={width}
      height={height}
      className={className}
      aria-hidden="true"
    >
      <path d={shape.path} fill={color} fillRule="nonzero" />
    </svg>
  );
}

/** 纯剪影（无底色），等价于默认的坐姿猫。 */
export function CatSilhouette({ size = 32, className, color = 'currentColor' }: IconProps) {
  return <CatPose pose="sit" width={size} className={className} color={color} />;
}

/**
 * follow咪 徽标——牛油果绿圆角底 + 鹅黄猫剪影（与 App 图标同一形状）。
 * 传 pose 可换成其它姿态。
 */
export function CatMark({ size = 34, className, pose }: IconProps & { pose?: CatPoseKey }) {
  return (
    <svg
      viewBox={`0 0 ${CAT_VIEWBOX} ${CAT_VIEWBOX}`}
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
    >
      <rect width={CAT_VIEWBOX} height={CAT_VIEWBOX} rx={CAT_VIEWBOX * 0.23} fill="#7E9142" />
      {pose ? (
        <g transform={`translate(${(CAT_VIEWBOX - CAT_POSES[pose].w) / 2} ${(CAT_VIEWBOX - CAT_POSES[pose].h) / 2})`}>
          <path d={CAT_POSES[pose].path} fill="#F4D27E" fillRule="nonzero" />
        </g>
      ) : (
        <path d={CAT_ICON_PATH} fill="#F4D27E" fillRule="nonzero" />
      )}
    </svg>
  );
}

/** 小鱼干（猫咪小细节）。 */
export function FishIcon({ size = 24, className, color = 'currentColor' }: IconProps) {
  return (
    <svg viewBox="0 0 64 34" width={size} height={size * 0.53} className={className} fill={color} aria-hidden="true">
      <path d="M2 17C13 3 34 3 46 17 34 31 13 31 2 17Z" />
      <path d="M46 17l16-9v18z" />
      <circle cx="16" cy="14" r="2.4" fill="#FDFBF2" />
    </svg>
  );
}

/** 猫粮罐头（猫咪小细节）。 */
export function CanIcon({ size = 24, className }: IconProps) {
  return (
    <svg viewBox="0 0 48 64" width={size * 0.75} height={size} className={className} aria-hidden="true">
      <ellipse cx="24" cy="13" rx="16" ry="7" fill="#7E9142" />
      <rect x="8" y="13" width="32" height="42" rx="7" fill="#D2E096" />
      <ellipse cx="24" cy="15" rx="12" ry="5" fill="#FBF3CB" />
      <path d="M17 36c4-3 10-3 14 0" stroke="#7E9142" strokeWidth="2.6" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/** 毛线球（猫咪小细节）。 */
export function YarnIcon({ size = 24, className }: IconProps) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} aria-hidden="true">
      <circle cx="32" cy="34" r="22" fill="#F0CB74" />
      <path
        d="M13 30c10 6 28 4 38-6M11 40c13 8 31 6 41-4M20 15c-2 15 3 31 15 39"
        stroke="#7E9142"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** 任务无封面时的猫咪占位封面（趴盒子猫）。 */
export function CatCoverPlaceholder({ className }: { className?: string }) {
  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden bg-gradient-to-br from-mint to-leaf ${className ?? ''}`}
    >
      <FishIcon size={30} className="absolute left-1.5 top-1.5 text-cream/60" />
      <YarnIcon size={22} className="absolute bottom-1.5 right-1.5 text-cream/60" />
      <CatPose pose="box" width={86} className="relative text-cream/95" />
    </div>
  );
}

/* ---------------- 底部导航图标 ---------------- */
export function IconToday({ size = 24, className, color = 'currentColor' }: IconProps) {
  return <PawPrint size={size} className={className} color={color} />;
}

export function IconRecords({ size = 24, className, color = 'currentColor' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="15" rx="3" />
      <path d="M3.5 9.5h17M8 3v3M16 3v3" />
      <path d="M8.2 14.2h.01M12 14.2h.01M15.8 14.2h.01" strokeWidth="2.6" />
    </svg>
  );
}

export function IconSettings({ size = 24, className, color = 'currentColor' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.6v2.6M12 18.8v2.6M2.6 12h2.6M18.8 12h2.6M5.3 5.3l1.9 1.9M16.8 16.8l1.9 1.9M18.7 5.3l-1.9 1.9M7.2 16.8l-1.9 1.9" />
    </svg>
  );
}
