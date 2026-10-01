/**
 * 链接任务处理工具：
 * - B 站视频页 URL -> 解析 BV 号 -> 官方 iframe 嵌入代码
 * - b23.tv / bili2233.cn 短链 -> 无法解析视频号，给出提示
 * - 抖音 / 小红书等 -> 仅保留原链接（跳转）
 * - 用户直接粘贴 iframe / HTML 片段 -> 原样保留渲染
 */

/** 从任意文本中提取 B 站 BV 号（如 BV1xx411c7mD）。 */
export function parseBilibiliBvid(url: string): string | null {
  if (!url) return null;
  const match = url.match(/(BV[0-9A-Za-z]+)/i);
  return match ? match[1].toUpperCase() : null;
}

/** 是否 B 站链接（含短链）。 */
export function isBilibiliUrl(url: string): boolean {
  return /bilibili\.com|b23\.tv|bili2233\.cn|acg\.tv/i.test(url ?? '');
}

/** 是否会话短链（不含 BV 号，纯前端无法解析）。 */
export function isBilibiliShortLink(url: string): boolean {
  return /b23\.tv|bili2233\.cn/i.test(url ?? '');
}

/** 由 B 站链接生成官方播放器 iframe 嵌入代码；无法解析返回 null。 */
export function buildBilibiliEmbed(url: string): string | null {
  const bvid = parseBilibiliBvid(url);
  if (!bvid) return null;
  return (
    `<iframe src="https://player.bilibili.com/player.html?bvid=${bvid}` +
    `&p=1&high_quality=1&danmaku=0&autoplay=0&as_wide=1" ` +
    `scrolling="no" border="0" frameborder="no" framespacing="0" ` +
    `allowfullscreen="true" ` +
    `referrerpolicy="no-referrer-when-downgrade" ` +
    `style="width:100%;height:100%;border:0;"></iframe>`
  );
}

export type LinkPlatform = 'bilibili' | 'bilibili-short' | 'other';

export interface LinkResolution {
  linkUrl: string;
  embedHtml: string;
  platform: LinkPlatform;
  /** 给用户看的说明/提示（可为空）。 */
  note: string;
}

/**
 * 解析链接输入，给出可用的嵌入代码与提示。
 * @param linkUrl 用户粘贴的链接
 * @param embedHtmlInput 用户粘贴的嵌入代码（可选，优先使用）
 */
export function resolveLink(linkUrl: string, embedHtmlInput: string): LinkResolution {
  const url = (linkUrl ?? '').trim();
  const embed = (embedHtmlInput ?? '').trim();

  if (embed) {
    return {
      linkUrl: url,
      embedHtml: embed,
      platform: isBilibiliUrl(url) ? 'bilibili' : 'other',
      note: '已使用你粘贴的嵌入代码。',
    };
  }

  if (isBilibiliUrl(url)) {
    const bEmbed = buildBilibiliEmbed(url);
    if (bEmbed) {
      return {
        linkUrl: url,
        embedHtml: bEmbed,
        platform: 'bilibili',
        note: '已自动解析为 B 站播放器。若提示“无法播放”（部分视频有版权/地区限制），请点下方「打开原链接」到 B 站观看。',
      };
    }
    if (isBilibiliShortLink(url)) {
      return {
        linkUrl: url,
        embedHtml: '',
        platform: 'bilibili-short',
        note: '检测到 b23.tv 短链：短链不含视频号，无法解析。请用电脑网页版打开该视频，复制地址栏含 BV 号的完整链接；或从网页版「分享-嵌入代码」粘贴嵌入代码。',
      };
    }
    return {
      linkUrl: url,
      embedHtml: '',
      platform: 'bilibili',
      note: '未在链接中找到 BV 号，请粘贴含 BV 号的完整视频页地址。',
    };
  }

  if (!url) {
    return { linkUrl: '', embedHtml: '', platform: 'other', note: '' };
  }

  return {
    linkUrl: url,
    embedHtml: '',
    platform: 'other',
    note: '该平台通常不允许外部网页内嵌播放，将使用「打开原链接」跳转跟练后手动打卡。',
  };
}

/**
 * 兼容旧接口：规范化链接任务的输入。
 */
export function processLinkInput(
  linkUrl: string,
  embedHtml: string,
): { linkUrl: string; embedHtml: string } {
  const r = resolveLink(linkUrl, embedHtml);
  return { linkUrl: r.linkUrl, embedHtml: r.embedHtml };
}
