import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  renderSmokeMedia,
  renderTransitionSmokeMedia,
} from "../src/server/render/render-smoke";

const execFileAsync = promisify(execFile);

async function main(): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "video-effect-render-smoke-"));
  const inputPath = join(directory, "input.mp4");
  const beforePath = join(directory, "before.mp4");
  const afterPath = join(directory, "after.mp4");
  const outputPath = join(directory, "output.mp4");
  const transitionOutputPath = join(directory, "transition-output.mp4");

  try {
    // 中文注释：用 FFmpeg 生成带静音音轨的真实 MP4，避免冒烟测试依赖用户私有素材。
    const createInput = (color: string, outputPath: string) => execFileAsync("ffmpeg", [
      "-y",
      "-f", "lavfi", "-i", `color=c=${color}:s=64x64:r=30:d=1`,
      "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
      "-t", "1",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac",
      outputPath,
    ]);
    await createInput("0x26324a", inputPath);
    await createInput("0xc24141", beforePath);
    await createInput("0x3b82f6", afterPath);
    await renderSmokeMedia(inputPath, outputPath);
    const outputStats = await stat(outputPath);
    if (outputStats.size <= 0) throw new Error("渲染结果为空");
    console.log(`真实 MP4 渲染冒烟通过：${outputPath}（${outputStats.size} 字节）`);
    await renderTransitionSmokeMedia(beforePath, afterPath, transitionOutputPath);
    const transitionOutputStats = await stat(transitionOutputPath);
    if (transitionOutputStats.size <= 0) throw new Error("真实转场渲染结果为空");
    console.log(`真实双素材转场渲染冒烟通过：${transitionOutputPath}（${transitionOutputStats.size} 字节）`);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
