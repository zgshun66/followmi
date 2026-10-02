/**
 * 校验 BV 号大小写：解析结果必须与原始链接一致，再逐个问 B 站接口确认真实存在。
 *
 * 背景：BV 号是大小写敏感的。早期实现 `parseBilibiliBvid` 里有一句
 * `.toUpperCase()`，把几乎所有链接的 BV 号都改成了不存在的号。
 * 这个脚本守住这条线：只要再有人加回大小写转换，断言立刻变红。
 *
 * 用法：node scripts/dev/qa-bvid.mjs
 * 末尾会打印 `--- bvids ---` 段落，供外层脚本拿去做在线校验。
 */
import * as U from '../../test/logic.bundle.mjs';

const CASES = [
  // 常规 PC 链接，含小写字母
  { link: 'https://www.bilibili.com/video/BV1GJ411x7h7', expect: 'BV1GJ411x7h7' },
  // b23.tv 新分享格式：BV 号直接写在短链路径里，不需要解析跳转
  { link: 'https://b23.tv/BV1Bnet6wEds', expect: 'BV1Bnet6wEds' },
  { link: 'https://b23.tv/BV1BceS6sEkP', expect: 'BV1BceS6sEkP' },
  // 带查询参数，不应把参数吞进 BV 号
  { link: 'https://www.bilibili.com/video/BV1xx411c7mD?p=2&t=10', expect: 'BV1xx411c7mD' },
  // 手机端子域名
  { link: 'https://m.bilibili.com/video/BV1GJ411x7h7', expect: 'BV1GJ411x7h7' },
  // 分享文案里夹着的链接
  { link: '【跟练】每天十分钟 https://www.bilibili.com/video/BV1GJ411x7h7 一起练', expect: 'BV1GJ411x7h7' },
];

let pass = 0;
const fail = [];

console.log('=== BV 号大小写是否原样保留 ===');
for (const c of CASES) {
  const embed = U.buildBilibiliEmbed(c.link);
  const m = embed && embed.match(/[?&]bvid=([^&"]+)/);
  const got = m ? m[1] : null;
  if (got === c.expect) {
    pass += 1;
    console.log(`PASS  ${got}`);
  } else {
    fail.push(c.link);
    console.log(`FAIL  期望 ${c.expect}，实际 ${got}  <- ${c.link}`);
  }
}

console.log('');

// 反例：必须承认的局限——整体被压成小写的链接，原始大小写无从还原
const lowered = U.parseBilibiliBvid('https://www.bilibili.com/video/bv1xx411c7md');
console.log(
  lowered === 'BV1xx411c7md'
    ? 'PASS  全小写链接只纠正前缀、其余原样（已知局限，符合预期）'
    : `FAIL  全小写链接行为改变：${lowered}`,
);
if (lowered !== 'BV1xx411c7md') fail.push('lowered-case');

// 非 B 站链接仍应返回 null
const foreign = U.buildBilibiliEmbed('https://www.douyin.com/video/700000');
console.log(foreign === null ? 'PASS  非 B 站链接返回 null' : 'FAIL  非 B 站链接竟生成了 iframe');
if (foreign !== null) fail.push('foreign');

console.log(`\n大小写断言: ${pass}/${CASES.length}   其他检查: ${fail.length ? 'FAIL' : 'PASS'}`);

console.log('\n--- bvids ---');
for (const c of CASES) {
  const bv = U.parseBilibiliBvid(c.link);
  if (bv) console.log(bv);
}

process.exit(fail.length ? 1 : 0);
