import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { cp, mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  renderSmokeMedia,
  renderTransitionSmokeMedia,
} from "../src/server/render/render-smoke";

const execFileAsync = promisify(execFile);

type ProbedMedia = {
  durationInSeconds: number;
  videoDurationInSeconds: number;
  videoFrameCount: number;
  videoWidth: number;
  videoHeight: number;
  videoFps: number;
  audioStreamCount: number;
};

const retainArtifacts = process.argv.includes("--retain-artifacts");

/** 中文注释：读取导出媒体的关键元数据，用于验证渲染结果没有丢帧、改画幅或丢失原始音频流。 */
async function probeMedia(filePath: string): Promise<ProbedMedia> {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "error",
    "-count_frames",
    "-print_format", "json",
    "-show_entries", "format=duration:stream=codec_type,width,height,r_frame_rate,duration,nb_frames,nb_read_frames",
    filePath,
  ]);
  const parsed = JSON.parse(stdout) as {
    format?: { duration?: string };
    streams?: Array<{
      codec_type?: string;
      height?: number;
      duration?: string;
      nb_frames?: string;
      nb_read_frames?: string;
      r_frame_rate?: string;
      width?: number;
    }>;
  };
  const streams = parsed.streams ?? [];
  const video = streams.find((stream) => stream.codec_type === "video");
  if (!video || !video.width || !video.height || !video.r_frame_rate) {
    throw new Error(`无法读取视频流元数据：${filePath}`);
  }
  const [numerator, denominator] = video.r_frame_rate.split("/").map(Number);
  const durationInSeconds = Number(parsed.format?.duration);
  const videoFps = denominator ? numerator / denominator : numerator;
  const videoDurationInSeconds = Number(video.duration);
  const videoFrameCount = Number(video.nb_read_frames ?? video.nb_frames);
  if (
    !Number.isFinite(durationInSeconds) ||
    durationInSeconds <= 0 ||
    !Number.isFinite(videoDurationInSeconds) ||
    videoDurationInSeconds <= 0 ||
    !Number.isFinite(videoFrameCount) ||
    !Number.isFinite(videoFps)
  ) {
    throw new Error(`无法读取媒体时长、帧数或帧率：${filePath}`);
  }

  return {
    durationInSeconds,
    videoDurationInSeconds,
    videoFrameCount,
    videoWidth: video.width,
    videoHeight: video.height,
    videoFps,
    audioStreamCount: streams.filter((stream) => stream.codec_type === "audio").length,
  };
}

/** 中文注释：统一检查冒烟导出契约，并把输入/输出音频是否保留交给命令行证据记录。 */
function assertSmokeOutput(
  label: string,
  media: ProbedMedia,
  inputAudioStreamCount: number,
): void {
  if (Math.abs(media.videoDurationInSeconds - 1) > 1 / 30 || media.videoFrameCount !== 30) {
    throw new Error(
      `${label}视频时长异常：${media.videoDurationInSeconds} 秒，${media.videoFrameCount} 帧`,
    );
  }
  if (
    media.videoWidth !== 64 ||
    media.videoHeight !== 64 ||
    Math.abs(media.videoFps - 30) > 0.01
  ) {
    throw new Error(`${label}视频规格异常：${media.videoWidth}x${media.videoHeight}@${media.videoFps}`);
  }
  if (inputAudioStreamCount > 0 && media.audioStreamCount === 0) {
    throw new Error(`${label}丢失输入音频流`);
  }
}

async function main(): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "video-effect-render-smoke-"));
  const inputPath = join(directory, "input.mp4");
  const beforePath = join(directory, "before.mp4");
  const afterPath = join(directory, "after.mp4");
  const outputPath = join(directory, "output.mp4");

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
    const inputProbe = await probeMedia(inputPath);
    const outputProbe = await probeMedia(outputPath);
    assertSmokeOutput("单素材导出", outputProbe, inputProbe.audioStreamCount);
    console.log(
      `真实 MP4 渲染冒烟通过：${outputPath}（${outputStats.size} 字节，` +
      `视频 ${outputProbe.videoDurationInSeconds.toFixed(3)} 秒/${outputProbe.videoFrameCount} 帧，` +
      `容器 ${outputProbe.durationInSeconds.toFixed(3)} 秒，音频流 ${inputProbe.audioStreamCount} -> ${outputProbe.audioStreamCount}）`,
    );
    const beforeProbe = await probeMedia(beforePath);
    const afterProbe = await probeMedia(afterPath);
    const retainedOutputs: Array<{
      file: string;
      media: ProbedMedia;
      styleId: "push-pull" | "directional-wipe" | "split-wipe";
    }> = [];
    for (const startingStyleId of ["push-pull", "directional-wipe", "split-wipe"] as const) {
      const styleOutputPath = join(directory, `transition-output-${startingStyleId}.mp4`);
      await renderTransitionSmokeMedia(beforePath, afterPath, styleOutputPath, startingStyleId);
      const transitionOutputStats = await stat(styleOutputPath);
      if (transitionOutputStats.size <= 0) throw new Error(`${startingStyleId} 转场渲染结果为空`);
      const transitionProbe = await probeMedia(styleOutputPath);
      retainedOutputs.push({ file: styleOutputPath, media: transitionProbe, styleId: startingStyleId });
      assertSmokeOutput(
        `双素材${startingStyleId}转场导出`,
        transitionProbe,
        beforeProbe.audioStreamCount + afterProbe.audioStreamCount,
      );
      console.log(
        `真实双素材${startingStyleId}转场渲染冒烟通过：${styleOutputPath}（${transitionOutputStats.size} 字节，` +
        `视频 ${transitionProbe.videoDurationInSeconds.toFixed(3)} 秒/${transitionProbe.videoFrameCount} 帧，` +
        `容器 ${transitionProbe.durationInSeconds.toFixed(3)} 秒，音频流 ` +
        `${beforeProbe.audioStreamCount + afterProbe.audioStreamCount} -> ${transitionProbe.audioStreamCount}）`,
      );
    }
    if (retainArtifacts) {
      const artifactDirectory = join(process.cwd(), "renders", "render-smoke", "directional-transition");
      await mkdir(artifactDirectory, { recursive: true });
      const retainedFiles = [
        { source: inputPath, name: "input.mp4" },
        { source: beforePath, name: "before.mp4" },
        { source: afterPath, name: "after.mp4" },
        { source: outputPath, name: "single-output.mp4" },
        ...retainedOutputs.map(({ file, styleId }) => ({
          source: file,
          name: `${styleId}-output.mp4`,
        })),
      ];
      await Promise.all(retainedFiles.map(({ source, name }) => cp(source, join(artifactDirectory, name))));
      await writeFile(
        join(artifactDirectory, "manifest.json"),
        JSON.stringify({
          generatedAt: new Date().toISOString(),
          outputs: {
            single: { file: "single-output.mp4", media: outputProbe },
            ...Object.fromEntries(retainedOutputs.map(({ media, styleId }) => [
              styleId,
              { file: `${styleId}-output.mp4`, media },
            ])),
          },
          sourceAudioStreams: {
            single: inputProbe.audioStreamCount,
            transition: beforeProbe.audioStreamCount + afterProbe.audioStreamCount,
          },
        }, null, 2),
        "utf8",
      );
      console.log(`已保留 MP4 冒烟证据：${artifactDirectory}`);
    }
  } finally {
    // 中文注释：证据已经复制到 renders 后即可清理临时目录，避免每次冒烟在系统临时目录累积素材。
    await rm(directory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
