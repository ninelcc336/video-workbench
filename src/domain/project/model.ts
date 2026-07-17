/** 编辑项目当前使用的数据结构版本。 */
export type ProjectSchemaVersion = 1;

export type ProjectSettings = {
  width: number;
  height: number;
  fps: number;
};

export type ExportSettings = {
  format: "mp4";
  width: number;
  height: number;
  fps: number;
};

export type VideoClip = {
  id: string;
  mediaId: string;
  // 中文注释：fromFrame 是主视频轨道上的起点，所有持久化时间都用非负整数帧表示。
  fromFrame: number;
  // 中文注释：sourceStartFrame 是源视频的起点，同样必须是非负整数帧。
  sourceStartFrame: number;
  // 中文注释：durationInFrames 必须是正整数，区间按 [fromFrame, fromFrame + durationInFrames) 计算。
  durationInFrames: number;
  audioEnabled: boolean;
};

export type EffectClip = {
  id: string;
  templateId: string;
  templateVersion: number;
  trackId: string;
  // 中文注释：特效片段的时间范围使用帧而不是浮点秒，保证拖拽和 Remotion 渲染边界一致。
  fromFrame: number;
  durationInFrames: number;
  params: Record<string, unknown>;
};

export type EditProject = {
  schemaVersion: ProjectSchemaVersion;
  settings: ProjectSettings;
  videoClips: VideoClip[];
  effectClips: EffectClip[];
  export: ExportSettings;
};
