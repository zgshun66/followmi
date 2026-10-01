/** 生成轻量唯一 ID（时间戳 + 随机串），用于本地实体主键。 */
export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
