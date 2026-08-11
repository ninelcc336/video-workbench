import { PNG } from "pngjs";

/** 中文注释：测试专用的纯色 PNG 夹具用于比较器和基线生命周期测试，避免重复维护像素填充逻辑。 */
export function createSolidPng(
  width: number,
  height: number,
  fill: [number, number, number, number],
): Buffer {
  const png = new PNG({ width, height });
  for (let offset = 0; offset < png.data.length; offset += 4) {
    png.data[offset] = fill[0];
    png.data[offset + 1] = fill[1];
    png.data[offset + 2] = fill[2];
    png.data[offset + 3] = fill[3];
  }
  return PNG.sync.write(png);
}
