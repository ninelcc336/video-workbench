import React from "react";
import { AbsoluteFill, OffthreadVideo, Sequence, useCurrentFrame } from "remotion";
import type { EditProject, EffectClip } from "../domain/project/model";
import { getTemplate, normalizeParams } from "../domain/templates/registry";
import type { TemplateDefinition } from "../domain/templates/types";
import { assertMediaSource, type MediaSources } from "./media";

// 中文注释：预览和导出都通过这个组合消费同一份编辑项目快照。
export type EditorCompositionProps = {
  project: EditProject;
  mediaSources: MediaSources;
};

export function getCompositionDurationInFrames(project: EditProject): number {
  const videoEnd = project.videoClips.reduce(
    (end, clip) => Math.max(end, clip.fromFrame + clip.durationInFrames),
    0,
  );
  const effectEnd = project.effectClips.reduce(
    (end, clip) => Math.max(end, clip.fromFrame + clip.durationInFrames),
    0,
  );

  return Math.max(1, videoEnd, effectEnd);
}

export function getCompositionMediaSources(
  project: EditProject,
  mediaSources: MediaSources,
): Array<{ clipId: string; mediaId: string; src: string; audioEnabled: boolean }> {
  return project.videoClips.map((clip) => ({
    clipId: clip.id,
    mediaId: clip.mediaId,
    src: assertMediaSource(clip.mediaId, mediaSources),
    audioEnabled: clip.audioEnabled,
  }));
}

function TemplateLayer({
  clip,
  template,
  project,
}: {
  clip: EffectClip;
  template: TemplateDefinition;
  project: EditProject;
}) {
  const frame = useCurrentFrame();

  return template.render({
    frame,
    fps: project.settings.fps,
    width: project.settings.width,
    height: project.settings.height,
    durationInFrames: clip.durationInFrames,
    params: normalizeParams(template, clip.params),
  });
}

export function EditorComposition({ project, mediaSources }: EditorCompositionProps) {
  const videoSources = getCompositionMediaSources(project, mediaSources);

  return (
    <AbsoluteFill style={{ backgroundColor: "#000000" }}>
      {project.videoClips.map((clip) => {
        const source = videoSources.find((item) => item.clipId === clip.id);

        if (!source) {
          return null;
        }

        return (
          <Sequence
            durationInFrames={clip.durationInFrames}
            from={clip.fromFrame}
            key={clip.id}
          >
            <OffthreadVideo
              muted={!clip.audioEnabled}
              startFrom={clip.sourceStartFrame}
              src={source.src}
              style={{ height: "100%", objectFit: "contain", width: "100%" }}
            />
          </Sequence>
        );
      })}
      {project.effectClips.map((clip) => {
        const template = getTemplate(clip.templateId, clip.templateVersion);

        return (
          <Sequence
            durationInFrames={clip.durationInFrames}
            from={clip.fromFrame}
            key={clip.id}
          >
            <AbsoluteFill>
              <TemplateLayer clip={clip} project={project} template={template} />
            </AbsoluteFill>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
}
