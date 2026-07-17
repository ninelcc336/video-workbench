import { Player } from "@remotion/player";
import { EditorComposition, getCompositionDurationInFrames, type EditorCompositionProps } from "../../remotion/EditorComposition";

export function PreviewPlayer({ project, mediaSources }: EditorCompositionProps) {
  return (
    <Player
      component={EditorComposition}
      compositionHeight={project.settings.height}
      compositionWidth={project.settings.width}
      durationInFrames={getCompositionDurationInFrames(project)}
      fps={project.settings.fps}
      inputProps={{ project, mediaSources }}
      style={{ height: "100%", width: "100%" }}
    />
  );
}
