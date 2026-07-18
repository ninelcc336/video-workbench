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
});
