import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

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
});
