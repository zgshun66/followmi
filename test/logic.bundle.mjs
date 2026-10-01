// src/utils/bilibili.ts
function parseBilibiliBvid(url) {
  if (!url) return null;
  const match = url.match(/(BV[0-9A-Za-z]+)/i);
  return match ? match[1].toUpperCase() : null;
}
function isBilibiliUrl(url) {
  return /bilibili\.com|b23\.tv|bili2233\.cn|acg\.tv/i.test(url ?? "");
}
function isBilibiliShortLink(url) {
  return /b23\.tv|bili2233\.cn/i.test(url ?? "");
}
function buildBilibiliEmbed(url) {
  const bvid = parseBilibiliBvid(url);
  if (!bvid) return null;
  return `<iframe src="https://player.bilibili.com/player.html?bvid=${bvid}&p=1&high_quality=1&danmaku=0&autoplay=0&as_wide=1" scrolling="no" border="0" frameborder="no" framespacing="0" allowfullscreen="true" referrerpolicy="no-referrer-when-downgrade" style="width:100%;height:100%;border:0;"></iframe>`;
}
function resolveLink(linkUrl, embedHtmlInput) {
  const url = (linkUrl ?? "").trim();
  const embed = (embedHtmlInput ?? "").trim();
  if (embed) {
    return {
      linkUrl: url,
      embedHtml: embed,
      platform: isBilibiliUrl(url) ? "bilibili" : "other",
      note: "\u5DF2\u4F7F\u7528\u4F60\u7C98\u8D34\u7684\u5D4C\u5165\u4EE3\u7801\u3002"
    };
  }
  if (isBilibiliUrl(url)) {
    const bEmbed = buildBilibiliEmbed(url);
    if (bEmbed) {
      return {
        linkUrl: url,
        embedHtml: bEmbed,
        platform: "bilibili",
        note: "\u5DF2\u81EA\u52A8\u89E3\u6790\u4E3A B \u7AD9\u64AD\u653E\u5668\u3002\u82E5\u63D0\u793A\u201C\u65E0\u6CD5\u64AD\u653E\u201D\uFF08\u90E8\u5206\u89C6\u9891\u6709\u7248\u6743/\u5730\u533A\u9650\u5236\uFF09\uFF0C\u8BF7\u70B9\u4E0B\u65B9\u300C\u6253\u5F00\u539F\u94FE\u63A5\u300D\u5230 B \u7AD9\u89C2\u770B\u3002"
      };
    }
    if (isBilibiliShortLink(url)) {
      return {
        linkUrl: url,
        embedHtml: "",
        platform: "bilibili-short",
        note: "\u68C0\u6D4B\u5230 b23.tv \u77ED\u94FE\uFF1A\u77ED\u94FE\u4E0D\u542B\u89C6\u9891\u53F7\uFF0C\u65E0\u6CD5\u89E3\u6790\u3002\u8BF7\u7528\u7535\u8111\u7F51\u9875\u7248\u6253\u5F00\u8BE5\u89C6\u9891\uFF0C\u590D\u5236\u5730\u5740\u680F\u542B BV \u53F7\u7684\u5B8C\u6574\u94FE\u63A5\uFF1B\u6216\u4ECE\u7F51\u9875\u7248\u300C\u5206\u4EAB-\u5D4C\u5165\u4EE3\u7801\u300D\u7C98\u8D34\u5D4C\u5165\u4EE3\u7801\u3002"
      };
    }
    return {
      linkUrl: url,
      embedHtml: "",
      platform: "bilibili",
      note: "\u672A\u5728\u94FE\u63A5\u4E2D\u627E\u5230 BV \u53F7\uFF0C\u8BF7\u7C98\u8D34\u542B BV \u53F7\u7684\u5B8C\u6574\u89C6\u9891\u9875\u5730\u5740\u3002"
    };
  }
  if (!url) {
    return { linkUrl: "", embedHtml: "", platform: "other", note: "" };
  }
  return {
    linkUrl: url,
    embedHtml: "",
    platform: "other",
    note: "\u8BE5\u5E73\u53F0\u901A\u5E38\u4E0D\u5141\u8BB8\u5916\u90E8\u7F51\u9875\u5185\u5D4C\u64AD\u653E\uFF0C\u5C06\u4F7F\u7528\u300C\u6253\u5F00\u539F\u94FE\u63A5\u300D\u8DF3\u8F6C\u8DDF\u7EC3\u540E\u624B\u52A8\u6253\u5361\u3002"
  };
}
function processLinkInput(linkUrl, embedHtml) {
  const r = resolveLink(linkUrl, embedHtml);
  return { linkUrl: r.linkUrl, embedHtml: r.embedHtml };
}

// src/utils/schedule.ts
var WEEKDAYS = ["\u65E5", "\u4E00", "\u4E8C", "\u4E09", "\u56DB", "\u4E94", "\u516D"];
function isDueOn(task, date) {
  const { mode, weekdays } = task.schedule;
  if (mode === "daily") return true;
  if (mode === "weekly") {
    const day = date.getDay();
    return (weekdays ?? []).includes(day);
  }
  return false;
}
function requiredTimesOn(task, date) {
  return isDueOn(task, date) ? Math.max(0, task.schedule.perTimes || 0) : 0;
}
function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function getRemaining(task, checkins, date) {
  const required = requiredTimesOn(task, date);
  const done = checkins.filter(
    (c) => c.taskId === task.id && isSameDay(new Date(c.ts), date)
  ).length;
  return Math.max(0, required - done);
}
function scheduleText(schedule) {
  if (schedule.mode === "daily") {
    return `\u6BCF\u5929 ${Math.max(1, schedule.perTimes)} \u6B21`;
  }
  const days = (schedule.weekdays ?? []).map((d) => WEEKDAYS[d]).join("");
  return `\u6BCF\u5468 ${days || "\u65E0"} ${Math.max(1, schedule.perTimes)} \u6B21`;
}

// src/utils/stats.ts
function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function fromDateStr(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function startOfWeek(d) {
  const x = startOfDay(d);
  const offset = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - offset);
  return x;
}
function startOfMonth(d) {
  const x = startOfDay(d);
  x.setDate(1);
  return x;
}
function startOfYear(d) {
  const x = startOfDay(d);
  x.setMonth(0, 1);
  return x;
}
function getTotalCheckins(checkins) {
  return checkins.length;
}
function getCheckinCountsByDate(checkins) {
  const counts = /* @__PURE__ */ new Map();
  for (const c of checkins) {
    const ds = toDateStr(new Date(c.ts));
    counts.set(ds, (counts.get(ds) ?? 0) + 1);
  }
  return counts;
}
function getCurrentStreak(checkins) {
  if (checkins.length === 0) return 0;
  const days = new Set(checkins.map((c) => toDateStr(new Date(c.ts))));
  let streak = 0;
  const cursor = startOfDay(/* @__PURE__ */ new Date());
  if (!days.has(toDateStr(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
  }
  while (days.has(toDateStr(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
function getCompletionRate(checkins, tasks, periodStart, periodEnd) {
  let required = 0;
  let actual = 0;
  const cursor = startOfDay(periodStart);
  const end = startOfDay(periodEnd);
  while (cursor.getTime() <= end.getTime()) {
    for (const t of tasks) required += requiredTimesOn(t, cursor);
    const ds = toDateStr(cursor);
    actual += checkins.filter((c) => toDateStr(new Date(c.ts)) === ds).length;
    cursor.setDate(cursor.getDate() + 1);
  }
  if (required === 0) return 0;
  return Math.min(100, Math.round(actual / required * 100));
}
function getHeatmap(checkins, weeks = 16) {
  const counts = getCheckinCountsByDate(checkins);
  const today = startOfDay(/* @__PURE__ */ new Date());
  const end = new Date(today);
  end.setDate(end.getDate() + (6 - end.getDay()));
  const start = new Date(end);
  start.setDate(start.getDate() - (weeks * 7 - 1));
  const result = [];
  for (const d = new Date(start); d.getTime() <= end.getTime(); d.setDate(d.getDate() + 1)) {
    const ds = toDateStr(d);
    result.push({ date: ds, count: counts.get(ds) ?? 0 });
  }
  return result;
}
export {
  WEEKDAYS,
  buildBilibiliEmbed,
  fromDateStr,
  getCheckinCountsByDate,
  getCompletionRate,
  getCurrentStreak,
  getHeatmap,
  getRemaining,
  getTotalCheckins,
  isBilibiliShortLink,
  isBilibiliUrl,
  isDueOn,
  isSameDay,
  parseBilibiliBvid,
  processLinkInput,
  requiredTimesOn,
  resolveLink,
  scheduleText,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
  toDateStr
};
