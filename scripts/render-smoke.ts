import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderSmokeMedia } from "../src/server/render/render-smoke";

const execFileAsync = promisify(execFile);

async function main(): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "video-effect-render-smoke-"));
  const inputPath = join(directory, "input.mp4");
  const outputPath = join(directory, "output.mp4");

  try {
    // 中文注释：用 FFmpeg 生成带静音音轨的真实 MP4，避免冒烟测试依赖用户私有素材。
    await execFileAsync("ffmpeg", [
      "-y",
      "-f", "lavfi", "-i", "color=c=0x26324a:s=64x64:r=30:d=1",
      "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
      "-t", "1",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac",
      inputPath,
    ]);
    await renderSmokeMedia(inputPath, outputPath);
    const outputStats = await stat(outputPath);
    if (outputStats.size <= 0) throw new Error("渲染结果为空");
    console.log(`真实 MP4 渲染冒烟通过：${outputPath}（${outputStats.size} 字节）`);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
