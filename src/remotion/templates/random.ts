/**
 * 中文注释：把字符串稳定转换为无符号整数；算法不依赖运行时随机源，保证浏览器与离线渲染一致。
 */
function hashSeed(seed: string): number {
  let hash = 2166136261;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

/** 中文注释：将局部帧或粒子索引编码进种子，避免依赖函数调用先后顺序。 */
export function seededRandom(seed: string, index = 0): number {
  const safeIndex = Number.isFinite(index) ? Math.trunc(index) : 0;
  const mixedSeed = hashSeed(`${seed}\u0000${safeIndex}`);
  const mixed = Math.imul(mixedSeed ^ (mixedSeed >>> 16), 2246822519) >>> 0;

  return mixed / 4294967296;
}

/**
 * 中文注释：创建按索引求值的确定性随机函数；调用方可以直接跳到任意帧或粒子编号，不需要维护游标。
 */
export function createSeededRandom(seed: string): (index?: number) => number {
  return (index = 0) => seededRandom(seed, index);
}
