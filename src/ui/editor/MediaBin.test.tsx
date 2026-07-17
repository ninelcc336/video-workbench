// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createEmptyProject } from "../../domain/project/factories";
import { MediaBin } from "./MediaBin";

afterEach(cleanup);

describe("素材库缺失状态", () => {
  it("显示缺失素材提示，供页面阻止导出", () => {
    const project = createEmptyProject();
    project.videoClips.push({
      id: "video-1",
      mediaId: "missing-media",
      fromFrame: 0,
      sourceStartFrame: 0,
      durationInFrames: 30,
      audioEnabled: true,
    });

    render(<MediaBin missingMediaIds={["missing-media"]} project={project} />);

    expect(screen.getByRole("status").textContent).toContain("素材缺失");
  });
});
