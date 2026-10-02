import React, { useEffect, useRef, useState } from 'react';
import type { Task } from '../types';
import { FishIcon } from './CatIcons';

interface LinkPlayerProps {
  task: Task;
  /**
   * 今日还差的次数（剩余额度），由 TodayView 依据「最新的 checkins」实时算好后传进来。
   * 面板内部不自己数数，免得拿着陈旧快照把自己锁死。
   */
  remaining: number;
  onComplete: () => void;
  onClose: () => void;
}

/** 记一次打卡后按钮的兜底解锁时间（毫秒）：万一 remaining 没能刷新，也不至于永久禁用。 */
const UNLOCK_FALLBACK_MS = 2500;

/**
 * 复制文本：
 * - 优先用异步剪贴板 navigator.clipboard.writeText（只在 https / localhost 等安全上下文可用）；
 * - 不可用或抛错时退回 execCommand('copy') 的隐藏 textarea 老办法。
 */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* 落到下面的降级方案 */
  }
  return legacyCopy(text);
}

/** 老浏览器 / 非安全上下文的降级复制：临时 textarea + execCommand('copy')。 */
function legacyCopy(text: string): boolean {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-9999px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/**
 * 是否处于「装到桌面」的独立窗口模式。
 * - iOS：navigator.standalone === true；
 * - 安卓 / 桌面 PWA：matchMedia('(display-mode: standalone)')。
 * 只此一处判断，openExternal 与组件按钮主次共用，避免写两遍。
 */
function isStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false;
  const byDisplayMode =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches;
  return byDisplayMode || (navigator as unknown as { standalone?: boolean }).standalone === true;
}

/**
 * 打开外部链接。取舍依据（重点是装到桌面的独立窗口模式）：
 * - 独立窗口（standalone）下用 target="_blank" / window.open 会开出一个既没有地址栏、也没有返回入口的
 *   新窗口，用户看到的就是「白屏且回不来」——这正是用户踩到的坑，所以这里坚决不开新窗口；
 * - 改为同窗口跳转（location.href）：iOS 上多数版本会把跨域跳转交给 Safari 打开，用户点左上角即可回到 App；
 *   即便留在本窗口，也只是正常加载网页、不会白屏，重开 App 数据都还在（打卡记录存在 IndexedDB，不丢）；
 * - PWA 里没有权限唤起别的 App（universal link / 自定义 scheme 会被系统拦），所以唤起 App 这条路走不通，
 *   只能靠「复制链接」让用户自己去浏览器或 App 里粘贴打开，这才是最稳的兜底。
 * - 普通浏览器里新标签打开最自然；万一被拦截（返回 null），退回同窗口导航。
 *   注意：特征串里**不能**带 noopener/noreferrer —— 照 HTML 规范那样「成功也返回 null」，
 *   会让下面的兜底被每次正常点击误命中、连带把当前 follow咪 页也导航走。改为拿到代理后手动断开 opener。
 */
function openExternal(url: string) {
  if (isStandaloneMode()) {
    window.location.href = url;
    return;
  }
  // 先正常开新标签；拿到 WindowProxy 后手动置空 opener（等价于 noopener，且不会让返回值变成 null）。
  const win = window.open(url, '_blank');
  if (win) {
    try {
      win.opener = null;
    } catch {
      /* 跨域时设置可能被忽略，忽略即可 */
    }
  } else {
    // 这里返回 null 才可靠地表示「被拦截」，此时才退回同窗口导航。
    window.location.href = url;
  }
}

/**
 * 链接类任务的播放/跳转面板：
 * - 有 embedHtml（B站 iframe 或用户粘贴的嵌入片段）→ 用 16:9 外壳铺满渲染；
 * - 仅有 linkUrl → 提供「打开原链接」+「复制链接」兜底（抖音/小红书等不支持内嵌的平台）；
 * - standalone（装到桌面）时按钮主次反转：复制链接是唯一 100% 可靠的路径（打开会把自己导航走），故为主色且排前面；
 * - 支持「同一任务再来一次」：remaining > 0 时主按钮变「再来一次」，继续累计打卡；
 * - 跨域 iframe 无法检测播放结束，只能手动打卡。
 */
export default function LinkPlayer({ task, remaining, onComplete, onClose }: LinkPlayerProps) {
  const embed = (task.embedHtml ?? '').trim();
  const linkUrl = task.linkUrl ?? '';
  const finished = remaining <= 0;
  const standalone = isStandaloneMode();

  // 本次打开面板后是否已至少完成过一次：用于把主按钮从「标记完成」切成「再来一次」。
  const [started, setStarted] = useState(false);
  // 记一次打卡后短暂禁用按钮，等父组件回传新的 remaining，防止手快连点重复计数。
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const copyTimer = useRef<number | null>(null);
  const unlockTimer = useRef<number | null>(null);

  // remaining 一变（说明上一次打卡已经落库、父组件重算过了），立刻解除 busy 并撤掉兜底计时器。
  useEffect(() => {
    setBusy(false);
    if (unlockTimer.current !== null) {
      window.clearTimeout(unlockTimer.current);
      unlockTimer.current = null;
    }
  }, [remaining]);

  // 卸载时清掉「已复制」与「兜底解锁」两个计时器，避免对已卸载组件 setState。
  useEffect(() => {
    return () => {
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
      if (unlockTimer.current !== null) window.clearTimeout(unlockTimer.current);
    };
  }, []);

  const markComplete = () => {
    // 次数由父组件实时下发，这里只在还有额度时才记一次。
    if (finished || busy) return;
    setBusy(true);
    setStarted(true);
    onComplete();
    // 兜底解锁：解锁本依赖 remaining 变化，但 doCheckin 失败时 remaining 不会变，
    // 光靠它会把按钮永久禁用。挂一个一次性计时器，无论如何都恢复可点。
    if (unlockTimer.current !== null) window.clearTimeout(unlockTimer.current);
    unlockTimer.current = window.setTimeout(() => setBusy(false), UNLOCK_FALLBACK_MS);
  };

  // 复制成功后把按钮文案临时切成「已复制 ✓」，1.6 秒后复原。
  const handleCopy = async () => {
    if (!linkUrl) return;
    const ok = await copyText(linkUrl);
    setCopied(ok);
    setCopyFailed(!ok);
    if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => {
      setCopied(false);
      setCopyFailed(false);
    }, 1600);
  };

  // standalone 下「打开原链接」是次要动作（会离开 follow咪），普通浏览器下则是主色。
  const openBtn = linkUrl ? (
    <button
      type="button"
      onClick={() => openExternal(linkUrl)}
      className={
        standalone
          ? 'block w-full rounded-xl border border-cream/25 bg-cream/10 py-2.5 text-center text-sm font-bold text-cream'
          : 'block w-full rounded-xl bg-sun py-2.5 text-center text-sm font-bold text-ink'
      }
    >
      打开原链接
    </button>
  ) : null;

  // standalone 下「复制链接」是主色，普通浏览器下是次要样式。
  const copyBtn = linkUrl ? (
    <button
      type="button"
      onClick={() => void handleCopy()}
      className={
        standalone
          ? 'block w-full rounded-xl bg-sun py-2.5 text-center text-sm font-bold text-ink'
          : 'block w-full rounded-xl border border-cream/25 bg-cream/10 py-2.5 text-center text-sm font-bold text-cream'
      }
    >
      {copied ? '已复制 ✓' : '复制链接'}
    </button>
  ) : null;

  // 兜底：把链接原样展示成可长按选中的只读输入框，复制失败或没有剪贴板权限时也能手动复制。
  const linkBox = linkUrl ? (
    <input
      type="text"
      readOnly
      value={linkUrl}
      onFocus={(e) => e.currentTarget.select()}
      className="w-full select-all rounded-lg bg-ink/40 px-3 py-2 text-center text-[11px] text-cream/70 outline-none"
    />
  ) : null;

  const hint = linkUrl ? (
    <p className="text-xs leading-relaxed text-cream/60">
      {copyFailed
        ? '复制没成功，长按上面的链接手动复制也行~'
        : standalone
          ? '装到桌面后，直接打开会离开 follow咪；复制链接粘到浏览器或 App 里打开更稳。离开也没关系，练完从桌面图标重开，记录不会丢。'
          : '装到桌面（App 模式）时可能没法直接唤起对应的 App，复制链接粘到浏览器或 App 里打开更稳。'}
    </p>
  ) : null;

  // 按钮区块：standalone 时复制在前、打开在后；普通浏览器时打开在前、复制在后。
  const actionBlock = (
    <>
      {standalone ? (
        <>
          {copyBtn}
          {openBtn}
        </>
      ) : (
        <>
          {openBtn}
          {copyBtn}
        </>
      )}
      {linkBox}
      {hint}
    </>
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ink">
      <div className="flex items-center justify-between px-4 py-3 text-cream">
        <span className="truncate font-semibold">{task.name}</span>
        <button
          type="button"
          onClick={onClose}
          className="ml-2 shrink-0 rounded-full bg-cream/15 px-3 py-1 text-sm"
        >
          关闭
        </button>
      </div>

      <div className="flex-1 overflow-auto bg-ink px-4 pb-4">
        {embed ? (
          <>
            <div className="embed-shell" dangerouslySetInnerHTML={{ __html: embed }} />
            <p className="mt-3 text-center text-xs leading-relaxed text-cream/60">
              若播放器提示「无法播放」（部分视频有版权 / 地区限制），点下面的按钮去原站看。
            </p>
            <div className="mt-2 space-y-2">{actionBlock}</div>
          </>
        ) : linkUrl ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center text-cream">
            <FishIcon size={54} className="text-sun/80" />
            <p className="text-sm leading-relaxed text-cream/80">
              该平台不支持内嵌播放。点「打开原链接」去原站跟练，练完回来点下面的按钮打卡。
            </p>
            <div className="w-full space-y-2">{actionBlock}</div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-cream/60">未配置可用链接</div>
        )}
      </div>

      <div className="p-4">
        {!finished && <p className="mb-2 text-center text-xs text-cream/60">今日还差 {remaining} 次</p>}
        <button
          type="button"
          onClick={markComplete}
          disabled={finished || busy}
          className="w-full rounded-xl bg-leaf py-3 font-bold text-cream disabled:opacity-50"
        >
          {finished ? '已打卡 ✓' : started ? '再来一次' : '标记完成'}
        </button>
      </div>
    </div>
  );
}
