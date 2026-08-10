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

/**
 * 中文注释：特效片段的放置方式。范围放置沿用旧版时间字段，交界点放置只保存相邻视频片段引用，
 * 具体起始帧由后续转场模型根据当前时间轴计算，避免移动视频后留下过期坐标。
 */
export type EffectClipPlacement =
  | { type: "range" }
  | {
      type: "boundary";
      beforeVideoClipId: string;
      afterVideoClipId: string;
    };

export type EffectClip = {
  id: string;
  templateId: string;
  templateVersion: number;
  /** 中文注释：新版特效族标识暂时可选，旧模板不会在加载时被静默归入新族。 */
  effectFamilyId?: string;
  /** 中文注释：旧模板没有起始样式，兼容读取时使用 legacy-default 来源标记。 */
  startingStyleId?: string;
  /** 中文注释：缺少该字段的历史片段按范围放置读取，不改变原有时间范围。 */
  placement?: EffectClipPlacement;
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
