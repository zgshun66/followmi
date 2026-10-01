import React, { useEffect, useRef, useState } from 'react';
import { PawPrint, FishIcon, YarnIcon, CanIcon } from './CatIcons';

interface CheckinFlashProps {
  /** 触发一次盖爪印动画（由 false -> true 触发）。 */
  show: boolean;
  onDone: () => void;
}

/** 打卡完成时的「猫咪盖爪印」flash 动画。 */
export default function CheckinFlash({ show, onDone }: CheckinFlashProps) {
  const [visible, setVisible] = useState(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (!show) {
      setVisible(false);
      return;
    }
    setVisible(true);
    const timer = window.setTimeout(() => {
      setVisible(false);
      onDoneRef.current();
    }, 1350);
    return () => window.clearTimeout(timer);
  }, [show]);

  if (!visible) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center">
      <div className="anim-flash absolute inset-0 bg-cream" />
      <div className="relative flex flex-col items-center">
        <PawPrint size={150} color="#7E9142" className="anim-paw drop-shadow-[0_8px_16px_rgba(74,81,48,0.18)]" />
        <div className="anim-pop mt-4 rounded-full bg-leaf px-5 py-2 text-sm font-bold text-cream shadow-soft">
          打卡成功 · 喵～
        </div>
        <div className="mt-3 flex items-center gap-3 text-leaf/70">
          <FishIcon size={30} />
          <YarnIcon size={24} />
          <CanIcon size={24} />
        </div>
      </div>
    </div>
  );
}
