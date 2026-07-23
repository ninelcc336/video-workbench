import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  clampEditorPanelWidths,
  DEFAULT_EDITOR_PANEL_WIDTHS,
  resizeEditorPanel,
} from "./editor-layout";

const editorCss = readFileSync(resolve(process.cwd(), "src/ui/editor/editor.css"), "utf8");

describe("编辑器视口滚动边界", () => {
  it("固定编辑器视口并把页面溢出交给内部滚动容器", () => {
    // 中文注释：CSS 契约避免页面滚动条抢走编辑器高度，滚动应留在各自面板内。
    expect(editorCss).toMatch(/html,\s*body,\s*#root\s*\{[^}]*overflow:\s*hidden/s);
    expect(editorCss).toMatch(/\.editor-shell\s*\{[^}]*height:\s*100dvh/s);
    expect(editorCss).toMatch(/\.editor-main-grid\s*\{[^}]*min-height:\s*0/s);
    expect(editorCss).toMatch(/\.timeline-panel\s*\{[^}]*display:\s*flex/s);
    expect(editorCss).toMatch(/\.timeline-scroll\s*\{[^}]*overflow:\s*auto/s);
  });

  it("为所有滚动容器提供统一的标准与 WebKit 滚动条主题", () => {
    // 中文注释：样式契约确保 Firefox 等标准实现和 Chromium/WebKit 伪元素都不会回退到默认外观。
    expect(editorCss).toMatch(/:root\s*\{[^}]*--scrollbar-track:/s);
    expect(editorCss).toMatch(/:root,\s*\*\s*\{[^}]*scrollbar-width:\s*thin/s);
    expect(editorCss).toMatch(/:root,\s*\*\s*\{[^}]*scrollbar-color:\s*var\(--scrollbar-thumb\)/s);
    expect(editorCss).toMatch(/\*::\-webkit\-scrollbar\s*\{[^}]*width:\s*9px[^}]*height:\s*9px/s);
    expect(editorCss).toMatch(/\*::\-webkit\-scrollbar-track\s*\{[^}]*border-radius:\s*999px/s);
    expect(editorCss).toMatch(/\*::\-webkit\-scrollbar-thumb\s*\{[^}]*border:\s*2px\s+solid\s+var\(--scrollbar-track\)[^}]*border-radius:\s*999px/s);
    expect(editorCss).toMatch(/\*::\-webkit\-scrollbar-thumb:hover\s*\{[^}]*background:\s*var\(--scrollbar-thumb-hover\)/s);
    expect(editorCss).toMatch(/\*::\-webkit\-scrollbar-thumb:active\s*\{[^}]*background:\s*var\(--scrollbar-thumb-active\)/s);
    expect(editorCss).not.toMatch(/\*::\-webkit\-scrollbar\s*\{[^}]*display:\s*none/s);
  });

  it("为时间轴的关键编辑状态和 1024px 桌面密度提供主题化视觉契约", () => {
    // 中文注释：该契约防止时间轴回退成原生边框，或窄桌面下重新出现顶栏溢出。
    expect(editorCss).toMatch(/\.timeline-ruler__gutter\s*\{[^}]*position:\s*sticky/s);
    expect(editorCss).toMatch(/\.timeline-track__label\s*\{[^}]*position:\s*sticky/s);
    expect(editorCss).toMatch(/\.timeline-clip\.video-clip\s*\{[^}]*background:/s);
    expect(editorCss).toMatch(/\.timeline-clip\.selected,[^{]*\[aria-pressed="true"\]\s*\{[^}]*box-shadow:/s);
    expect(editorCss).toMatch(/\.timeline-playhead::before\s*\{[^}]*border-bottom:\s*8px\s+solid\s+var\(--color-playhead\)/s);
    expect(editorCss).toMatch(/@media\s*\(max-width:\s*1100px\)\s*\{[^}]*\.editor-topbar\s*\{[^}]*min-height:\s*64px/s);
  });
});

describe("编辑器三栏布局宽度", () => {
  it("保留默认面板宽度", () => {
    expect(DEFAULT_EDITOR_PANEL_WIDTHS).toEqual({ left: 280, right: 288 });
  });

  it("拖拽素材库右边框时只增加素材库宽度", () => {
    expect(resizeEditorPanel({ left: 280, right: 288 }, "left", 100, 1200)).toEqual({
      left: 380,
      right: 288,
    });
  });

  it("拖拽特效参数面板左边框时只改变参数面板宽度", () => {
    expect(resizeEditorPanel({ left: 280, right: 288 }, "right", 100, 1200)).toEqual({
      left: 280,
      right: 230,
    });
  });

  it("向左拖拽特效参数面板边框时可以连续增加宽度", () => {
    expect(resizeEditorPanel({ left: 280, right: 288 }, "right", -100, 1200)).toEqual({
      left: 280,
      right: 388,
    });
  });

  it("拖拽时不允许预览区域小于编辑主区域的百分之四十", () => {
    expect(resizeEditorPanel({ left: 280, right: 288 }, "left", 500, 1200)).toEqual({
      left: 432,
      right: 288,
    });
  });

  it("拖拽素材库时不允许低于 220px", () => {
    expect(resizeEditorPanel({ left: 280, right: 288 }, "left", -500, 1200)).toEqual({
      left: 220,
      right: 288,
    });
  });

  it("窗口变窄时按最小面板宽度和预览比例收紧当前布局", () => {
    expect(clampEditorPanelWidths({ left: 500, right: 400 }, 1200)).toEqual({
      left: 388,
      right: 332,
    });
  });

  it("在 750px 最小支持宽度时保留两侧最小面板和预览下限", () => {
    expect(clampEditorPanelWidths({ left: 500, right: 400 }, 750)).toEqual({
      left: 220,
      right: 230,
    });
  });
});
