// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { PlayerRef } from "@remotion/player";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PreviewControls } from "./PreviewControls";

afterEach(cleanup);

function createPlayerRef() {
  let playing = false;
  const player = {
    addEventListener: vi.fn(),
    isPlaying: vi.fn(() => playing),
    pause: vi.fn(() => { playing = false; }),
    play: vi.fn(() => { playing = true; }),
    removeEventListener: vi.fn(),
    seekTo: vi.fn(),
  } as unknown as PlayerRef;

  // 中文注释：测试通过同一个 Player 引用观察外部控制栏是否真正驱动 Remotion 播放器。
  return { current: player };
}

describe("实时预览工作区控制栏", () => {
  it("播放、暂停和进度定位会同步到 Remotion Player 与页面播放头", () => {
    const playerRef = createPlayerRef();
    const onFrameChange = vi.fn();

    render(
      <PreviewControls
        currentFrame={12}
        durationInFrames={90}
        fps={30}
        onFrameChange={onFrameChange}
        playerRef={playerRef}
      />,
    );

    expect(screen.getByText("00:00 / 00:03")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "播放预览" }));
    expect(playerRef.current?.play).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "暂停预览" }));
    expect(playerRef.current?.pause).toHaveBeenCalledOnce();

    fireEvent.change(screen.getByLabelText("预览进度"), { target: { value: "45" } });
    expect(playerRef.current?.seekTo).toHaveBeenLastCalledWith(45);
    expect(onFrameChange).toHaveBeenLastCalledWith(45);
  });
});
