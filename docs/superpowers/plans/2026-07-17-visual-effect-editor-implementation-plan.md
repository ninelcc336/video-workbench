# 本地模板化视频特效编辑器 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个本地 Web 视频特效编辑器，让用户在 10 分钟内完成素材导入、时间轴排布、模板化特效编辑、个人预设保存和 MP4 导出。

**Architecture:** 使用 React + TypeScript + Vite 构建编辑器，Node.js 提供本地工作区和渲染任务接口。编辑器核心通过命令接口管理项目快照、时间轴、撤销重做和自动保存；模板注册表声明参数并提供唯一的 Remotion 实现，Remotion Player 预览和本地 Remotion 导出共享这份实现。文件系统和渲染器分别通过 Adapter seam 隔离，未来可以替换为云端实现。

**Tech Stack:** Node.js 20+、React、TypeScript、Vite、Remotion、`@remotion/player`、`@remotion/renderer`、Express、Multer、Zod、Vitest、React Testing Library、Playwright、CSS、SVG。

## Global Constraints

- 首个版本只运行在本地 Web 应用，不实现账号、云端存储和多人协作。
- 首个版本不加入 AI、自动字幕、配音、音乐编辑、关键帧、3D、WebGL 和独立音频轨道。
- 主视频轨道可以包含多个视频片段，但只实现导入、排序、裁剪和删除。
- 特效必须以特效片段存在于特效轨道，时间统一使用帧数，不使用浮点秒数作为持久化格式。
- 首批视觉模板只使用 React、Remotion、CSS 和 SVG 的 2D 实现。
- 预览与导出必须消费同一份编辑项目快照和同一套模板实现。
- 用户可调整模板公开参数并保存个人预设，但不能通过 UI 编写新的动画逻辑。
- 所有新增代码必须包含必要的中文注释，解释领域行为、时间换算和渲染边界。
- 每个任务都必须先写失败测试，再实现最小行为，最后运行该任务的定向测试和完整测试。
- 每个任务完成后创建一个小而明确的 Git 提交。

---

### Task 1: 建立可运行的前端、Node 服务和测试基线

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `src/main.tsx`
- Create: `src/ui/App.tsx`
- Create: `src/server/index.ts`
- Create: `src/server/health.ts`
- Test: `src/server/health.test.ts`

**Interfaces:**
- Produces `GET /api/health`，返回 `{ "ok": true }`。
- Produces前端 `App` 根组件，显示应用名称和“本地工作区未打开”空状态。

- [ ] **Step 1: 初始化 npm 项目和测试脚本**

运行 `npm init -y`，安装 React、Vite、TypeScript、Express、Vitest 以及本计划声明的 Remotion 依赖，并在 `package.json` 中加入 `dev`、`dev:server`、`test`、`build` 脚本；在 `.gitignore` 中忽略 `node_modules/`、`dist/`、`.superpowers/` 和本地渲染输出目录。

- [ ] **Step 2: 写健康检查失败测试**

在 `src/server/health.test.ts` 中测试健康检查函数返回 `ok: true`，并加入中文注释说明它只验证本地服务存活，不验证渲染器。

- [ ] **Step 3: 运行定向测试确认失败**

运行 `npm test -- src/server/health.test.ts`，预期因为 `health.ts` 尚未提供实现而失败。

- [ ] **Step 4: 实现健康检查和最小服务**

在 `src/server/health.ts` 导出纯函数 `getHealthStatus(): { ok: true }`，在 `src/server/index.ts` 注册 `/api/health`；在 `src/ui/App.tsx` 渲染中文空状态。

- [ ] **Step 5: 运行验证并提交**

运行 `npm test`、`npm run build`，预期全部通过；提交 `chore: 建立本地编辑器工程基线`。

### Task 2: 建立编辑项目模型、时间帧规则和参数校验

**Files:**
- Create: `src/domain/project/model.ts`
- Create: `src/domain/project/factories.ts`
- Create: `src/domain/project/validation.ts`
- Test: `src/domain/project/model.test.ts`
- Test: `src/domain/project/validation.test.ts`

**Interfaces:**
- `createEmptyProject(settings): EditProject`
- `secondsToFrames(seconds, fps): number`
- `framesToSeconds(frames, fps): number`
- `validateProject(project): ValidationResult`

```ts
export type EditProject = {
  schemaVersion: 1;
  settings: { width: number; height: number; fps: number };
  videoClips: VideoClip[];
  effectClips: EffectClip[];
  export: { format: "mp4"; width: number; height: number; fps: number };
};

// 中文注释：所有时间持久化为非负整数帧，避免浮点秒数在拖拽和渲染时产生误差。
export type EffectClip = {
  id: string;
  templateId: string;
  templateVersion: number;
  trackId: string;
  fromFrame: number;
  durationInFrames: number;
  params: Record<string, unknown>;
};
```

- [ ] **Step 1: 写项目工厂和帧换算的失败测试**

覆盖默认竖屏设置、`30fps` 下 `1.5` 秒转 `45` 帧、负数和小数帧输入拒绝。

- [ ] **Step 2: 实现模型和工厂**

创建 `EditProject`、`VideoClip`、`EffectClip`、模板和预设所需的共享类型；工厂生成稳定的空项目，并默认使用 `1080×1920 / 30fps`。

- [ ] **Step 3: 写项目校验失败测试**

覆盖重复 ID、重叠的视频片段、缺少模板 ID、非法时间范围和不支持的导出格式。

- [ ] **Step 4: 实现 Zod 校验和错误结果**

让校验返回可展示的字段级错误，不在领域核心直接抛出 UI 异常。

- [ ] **Step 5: 运行定向和完整测试并提交**

运行 `npm test -- src/domain/project` 和 `npm test`；提交 `feat: 建立编辑项目时间模型`。

### Task 3: 实现命令式编辑器核心和撤销重做

**Files:**
- Create: `src/domain/editor/commands.ts`
- Create: `src/domain/editor/editor-store.ts`
- Create: `src/domain/editor/history.ts`
- Test: `src/domain/editor/editor-store.test.ts`
- Test: `src/domain/editor/history.test.ts`

**Interfaces:**
- `createEditorStore(initialProject): EditorStore`
- `store.dispatch(command): void`
- `store.getSnapshot(): EditProject`
- `store.undo(): void`
- `store.redo(): void`
- `store.subscribe(listener): () => void`

- [ ] **Step 1: 写添加、移动、删除和参数修改的失败测试**

测试只通过命令修改快照，不允许测试直接改写数组；验证视频片段和特效片段的时间范围始终符合模型约束。

- [ ] **Step 2: 写撤销重做失败测试**

连续执行添加、移动、参数修改后，分别验证 `undo` 和 `redo` 恢复正确快照；验证新命令会清空 redo 栈。

- [ ] **Step 3: 实现命令和历史栈**

用不可变快照保存历史，命令只暴露领域操作；将合并连续参数修改的策略限制在同一片段、同一参数和短时间窗口内。

- [ ] **Step 4: 实现订阅接口并接入自动保存钩子**

编辑器核心只发出状态变化，不直接接触文件系统；自动保存由上层注入保存函数，避免核心模块绑定本地实现。

- [ ] **Step 5: 运行测试并提交**

运行 `npm test -- src/domain/editor` 和 `npm test`；提交 `feat: 增加命令式编辑器核心`。

### Task 4: 实现模板注册表、参数声明和首批模板

**Files:**
- Create: `src/domain/templates/types.ts`
- Create: `src/domain/templates/registry.ts`
- Create: `src/domain/templates/parameter-schema.ts`
- Create: `src/remotion/templates/CardOverlay.tsx`
- Create: `src/remotion/templates/BubbleDecoration.tsx`
- Create: `src/remotion/templates/BasicTransition.tsx`
- Test: `src/domain/templates/registry.test.ts`
- Test: `src/domain/templates/parameter-schema.test.ts`

**Interfaces:**
- `registerTemplate(template): void`
- `getTemplate(templateId, version): TemplateDefinition`
- `listTemplates(category?): TemplateSummary[]`
- `normalizeParams(template, params): Record<string, unknown>`
- `TemplateDefinition.render(props): React.ReactNode`

- [ ] **Step 1: 写模板查找、分类和参数默认值的失败测试**

验证三类模板都能按 ID 查找，非法参数会回退到默认值，未知参数不会泄漏到渲染输入。

- [ ] **Step 2: 实现参数声明类型和注册表**

支持文本、颜色、数字、单选、开关、位置和尺寸；注册表在启动时注册内置模板，并拒绝重复 ID/版本。

- [ ] **Step 3: 写三个模板的渲染冒烟测试**

验证卡片、气泡和基础转场在给定帧数和参数下返回可渲染 React 节点。

- [ ] **Step 4: 实现 2D Remotion 模板**

使用 CSS/SVG 和 Remotion 的帧进度实现卡片、气泡及基础转场；每个模板都写中文注释说明时间进度、参数含义和音频不由模板处理。

- [ ] **Step 5: 运行模板测试并提交**

运行 `npm test -- src/domain/templates src/remotion/templates`；提交 `feat: 增加参数化特效模板注册表`。

### Task 5: 打通 Remotion Player 预览和本地 MP4 渲染

**Files:**
- Create: `src/remotion/EditorComposition.tsx`
- Create: `src/remotion/Root.tsx`
- Create: `src/remotion/media.ts`
- Create: `src/server/render/render-adapter.ts`
- Create: `src/server/render/render-job.ts`
- Create: `src/server/render/render-routes.ts`
- Create: `src/ui/preview/PreviewPlayer.tsx`
- Test: `src/server/render/render-job.test.ts`
- Test: `src/remotion/EditorComposition.test.tsx`

**Interfaces:**
- `renderProject(project, outputPath): Promise<RenderResult>`
- `createRenderJob(project): RenderJob`
- `GET /api/render/:jobId`
- `POST /api/render`
- `POST /api/render/:jobId/cancel`

- [ ] **Step 1: 写渲染任务状态机的失败测试**

覆盖准备中、渲染中、已完成、失败和已取消的合法转换，拒绝完成后再次进入渲染。

- [ ] **Step 2: 实现渲染任务模块**

任务模块保存 job ID、状态、阶段、错误摘要和输出路径；渲染异常转换为可展示错误，不丢失项目数据。

- [ ] **Step 3: 写组合渲染失败测试**

验证主视频片段、原始音频、特效轨道和缺失素材的行为；缺失素材必须在渲染前被拒绝并返回明确错误。

- [ ] **Step 4: 实现共享 Remotion Composition 和 Player**

`EditorComposition` 只接收 `EditProject` 快照和模板注册表；`PreviewPlayer` 与服务端渲染使用相同的 composition 输入。

- [ ] **Step 5: 接入渲染路由并验证最小 MP4**

以一个视频片段和一个卡片模板完成真实渲染，运行 `npm test -- src/server/render src/remotion` 和 `npm run build`，提交 `feat: 打通预览与 MP4 渲染闭环`。

### Task 6: 实现本地工作区和素材适配器

**Files:**
- Create: `src/server/workspace/workspace-adapter.ts`
- Create: `src/server/workspace/workspace-paths.ts`
- Create: `src/server/workspace/project-repository.ts`
- Create: `src/server/workspace/media-repository.ts`
- Create: `src/server/workspace/workspace-routes.ts`
- Test: `src/server/workspace/workspace-adapter.test.ts`
- Test: `src/server/workspace/project-repository.test.ts`
- Test: `src/server/workspace/media-repository.test.ts`

**Interfaces:**
- `createWorkspace(rootPath): Promise<void>`
- `saveProject(project): Promise<void>`
- `loadProject(projectId): Promise<EditProject>`
- `importMedia(file): Promise<MediaAsset>`
- `listProjects(): Promise<ProjectSummary[]>`

- [ ] **Step 1: 写工作区路径和目录创建失败测试**

验证 `projects`、`media`、`presets`、`video-templates`、`renders` 都在工作区根目录下创建，拒绝工作区外的路径穿越。

- [ ] **Step 2: 实现工作区路径适配器**

所有文件名由 ID 生成，不接受用户输入直接拼接绝对路径；写 JSON 时先写临时文件，再替换正式文件。

- [ ] **Step 3: 写项目保存、重开和损坏文件测试**

验证保存后能读取相同快照，损坏 JSON 返回可展示错误而不是崩溃。

- [ ] **Step 4: 实现媒体复制和素材缺失检测**

导入媒体复制到 `media/`，项目只保存资产 ID；读取项目时为缺失资产返回缺失状态。

- [ ] **Step 5: 接入工作区 HTTP 路由并提交**

提供打开工作区、项目列表、项目读写和媒体导入接口；运行工作区定向测试和 `npm test`，提交 `feat: 增加本地工作区适配器`。

### Task 7: 实现三栏编辑器和基础时间轴

**Files:**
- Create: `src/ui/editor/EditorPage.tsx`
- Create: `src/ui/editor/MediaBin.tsx`
- Create: `src/ui/editor/TemplateLibrary.tsx`
- Create: `src/ui/editor/PreviewCanvas.tsx`
- Create: `src/ui/editor/Timeline.tsx`
- Create: `src/ui/editor/TimelineClip.tsx`
- Create: `src/ui/editor/PropertiesPanel.tsx`
- Create: `src/ui/editor/editor.css`
- Modify: `src/ui/App.tsx`
- Test: `src/ui/editor/Timeline.test.tsx`
- Test: `src/ui/editor/PropertiesPanel.test.tsx`

**Interfaces:**
- `EditorPage` consumes `EditorStore`、工作区接口和模板注册表。
- `Timeline` emits `selectClip`、`moveClip`、`resizeClip`、`deleteClip`。
- `PropertiesPanel` emits参数修改命令，不直接改写项目。

- [ ] **Step 1: 写时间轴选择、拖动和缩放的失败测试**

验证屏幕坐标到帧的换算、主轨道和特效轨道的显示、选中片段的高亮，以及拖动边界不会产生负时长。

- [ ] **Step 2: 实现 B 布局和基础样式**

完成左侧素材/模板库、中间预览、右侧参数面板和底部全宽时间轴；所有面向用户的文案使用中文。

- [ ] **Step 3: 接入编辑器命令**

将导入、选择、移动、裁剪、删除和参数修改全部转换为 `EditorStore` 命令，验证撤销重做能覆盖 UI 操作。

- [ ] **Step 4: 接入 Remotion Player**

播放头、选中片段和 Player 当前帧保持同步；预览更新只读取项目快照。

- [ ] **Step 5: 运行组件测试和构建并提交**

运行 `npm test -- src/ui/editor`、`npm run build`，提交 `feat: 增加三栏编辑器和时间轴`。

### Task 8: 实现模板拖拽、预览选择和画布直接调整

**Files:**
- Create: `src/ui/editor/TemplateCard.tsx`
- Create: `src/ui/editor/CanvasSelection.tsx`
- Create: `src/ui/editor/drag-and-drop.ts`
- Modify: `src/ui/editor/TemplateLibrary.tsx`
- Modify: `src/ui/editor/PreviewCanvas.tsx`
- Modify: `src/ui/editor/PropertiesPanel.tsx`
- Test: `src/ui/editor/drag-and-drop.test.ts`
- Test: `src/ui/editor/CanvasSelection.test.tsx`

**Interfaces:**
- `createEffectClipFromTemplate(template, dropFrame): EffectClip`
- `CanvasSelection` emits位置和尺寸命令。
- `TemplateCard` 显示模板动效预览、分类和“试用”行为。

- [ ] **Step 1: 写模板拖入时间轴的失败测试**

验证拖放位置转换为帧、默认持续时间来自模板、模板参数使用默认值，并拒绝未知模板。

- [ ] **Step 2: 实现模板卡片和拖放行为**

支持从模板库拖到特效轨道，支持播放头点击添加作为辅助入口；拖动片段边缘调整持续时间。

- [ ] **Step 3: 写画布边界和尺寸校验测试**

验证拖拽后特效不会超出画布，最小尺寸不小于模板声明的限制，拖拽结果通过命令进入历史栈。

- [ ] **Step 4: 实现画布选区和参数面板联动**

画布支持拖拽、缩放，右侧面板支持文本、颜色、数字、单选、开关、位置和尺寸；两种方式必须更新同一个项目快照。

- [ ] **Step 5: 运行 UI 测试并提交**

运行 `npm test -- src/ui/editor` 和 `npm run build`，提交 `feat: 增加模板拖拽和画布调参`。

### Task 9: 实现个人预设、视频模板和导出设置

**Files:**
- Create: `src/domain/assets/preset-model.ts`
- Create: `src/domain/assets/video-template-model.ts`
- Create: `src/server/assets/preset-repository.ts`
- Create: `src/server/assets/video-template-repository.ts`
- Create: `src/ui/editor/PresetDialog.tsx`
- Create: `src/ui/editor/VideoTemplateDialog.tsx`
- Create: `src/ui/editor/ExportDialog.tsx`
- Test: `src/domain/assets/preset-model.test.ts`
- Test: `src/domain/assets/video-template-model.test.ts`
- Test: `src/server/assets/repositories.test.ts`

**Interfaces:**
- `savePreset(templateId, templateVersion, params, name): Promise<Preset>`
- `applyPreset(presetId, effectClipId): void`
- `saveVideoTemplate(project): Promise<VideoTemplate>`
- `applyVideoTemplate(templateId, project): void`
- `buildExportSettings(preset, project): ExportSettings`

- [ ] **Step 1: 写个人预设版本和参数隔离测试**

验证预设只保存模板 ID、版本、名称和参数，不污染源特效片段；应用预设会通过编辑器命令生成新的参数快照。

- [ ] **Step 2: 实现个人预设持久化和对话框**

保存到工作区 `presets/`，列表显示模板动效预览和名称，加载失败时显示可恢复错误。

- [ ] **Step 3: 写视频模板相对布局测试**

验证视频模板不保存媒体路径，套用后根据目标项目起点生成新的特效片段，并保留用户已有视频片段。

- [ ] **Step 4: 实现视频模板持久化和套用**

保存到 `video-templates/`，套用前显示将要新增的特效片段数量，套用操作进入撤销历史。

- [ ] **Step 5: 实现导出规格对话框并提交**

提供竖屏、横屏、方形和 30fps 选择，显示输出路径和渲染状态；运行资产模型、仓储和组件测试，提交 `feat: 增加个人预设和视频模板`。

### Task 10: 完成自动保存、渲染状态和十分钟端到端验收

**Files:**
- Create: `src/ui/editor/SaveIndicator.tsx`
- Create: `src/ui/editor/RenderStatus.tsx`
- Create: `tests/e2e/mvp-flow.spec.ts`
- Create: `tests/fixtures/sample-project.json`
- Create: `tests/fixtures/sample-media/README.md`
- Modify: `src/ui/editor/EditorPage.tsx`
- Modify: `src/server/render/render-routes.ts`
- Test: `src/ui/editor/SaveIndicator.test.tsx`
- Test: `src/ui/editor/RenderStatus.test.tsx`

**Interfaces:**
- `createAutosaveController(save, debounceMs): AutosaveController`
- `RenderStatus` consumes job状态并显示准备中、渲染中、已完成、失败或已取消。
- Playwright 流程覆盖导入、排布、添加 2–3 个特效、调参、保存预设和导出请求。

- [ ] **Step 1: 写自动保存和状态提示的失败测试**

验证编辑变更在防抖窗口后只保存一次，保存失败显示错误，成功后显示最后保存时间。

- [ ] **Step 2: 实现自动保存控制器和保存指示器**

由 `EditorStore` 的订阅触发，保存适配器通过依赖注入传入；组件不得直接调用文件系统。

- [ ] **Step 3: 写渲染状态组件测试**

验证每个任务状态都有中文文案、失败时显示阶段和可复制错误摘要、完成时提供输出文件入口。

- [ ] **Step 4: 实现渲染状态轮询和取消**

导出对话框提交任务后轮询 job 状态，允许取消未完成任务；项目仍可编辑，渲染结果写入 `renders/`。

- [ ] **Step 5: 编写并运行 Playwright MVP 流程**

运行 `npm run test:e2e -- tests/e2e/mvp-flow.spec.ts`，预期完成导入、时间轴操作、特效添加、画布调参、预设保存和 MP4 渲染请求；渲染冒烟测试使用固定小样本，避免依赖用户真实素材。

- [ ] **Step 6: 运行完整验证并提交**

运行 `npm test`、`npm run build`、`npm run test:e2e`，检查预览与导出使用同一 `EditProject` 快照；提交 `test: 验证本地特效编辑器 MVP 闭环`。

## 完成定义

- `npm test`、`npm run build` 和 `npm run test:e2e` 全部通过。
- 一个真实视频项目可以在本地工作区保存、关闭后重新打开并继续编辑。
- 至少一个信息叠加模板、一个装饰动画模板和一个片段转场模板可以预览并导出。
- 预览和导出都从同一个 `EditProject` 快照读取模板和参数。
- 10 分钟 MVP 流程可以由不查文档的剪辑小白完成。
- 所有错误都以中文向用户说明，领域时间规则和渲染边界有中文注释。

## 自检结果

- 规格覆盖：每个已确认的 MVP 范围都有对应任务或完成定义。
- 占位符扫描：未发现未决项、模糊任务或需要后续补写的实现步骤。
- 类型一致性：`EditProject`、`EffectClip`、`TemplateDefinition`、`EditorStore` 和渲染任务接口在相邻任务中保持同一命名。
- 范围检查：没有加入云端、AI、关键帧、字幕、独立音频轨道或 3D 能力。
