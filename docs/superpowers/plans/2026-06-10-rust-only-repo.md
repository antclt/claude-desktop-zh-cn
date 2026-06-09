# Rust 重构版独立 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将仓库重组为仅保留 Rust / Tauri 重构版的单轨结构，并确保构建、发布、文档入口全部切换到新的根目录主项目。

**Architecture:** 先固化当前设计与基线，再把 `claude-desktop-zh-cn-rs` 提升到仓库根目录，随后修复所有路径引用与自动化配置，最后删除旧脚本版实现并统一收尾文档。整个过程不改写 Git 历史，只调整当前工作树，并用命令级验证保证迁移后仓库仍可测试、构建和发布。

**Tech Stack:** Git、PowerShell、Rust、Cargo、React、TypeScript、Vite、Tauri 2、GitHub Actions

---

### Task 1: 固化迁移基线

**Files:**
- Modify: `.gitignore`
- Create: `docs/superpowers/plans/2026-06-10-rust-only-repo.md`
- Verify: `README.md`

- [ ] **Step 1: 补齐根目录 `.gitignore`，覆盖 Rust / Node 产物**

```gitignore
.DS_Store
__pycache__/
*.py[cod]
.venv/
venv/
*.log

target/
node_modules/
dist/
*.tmp
apps/desktop/src-tauri/target/
apps/desktop/dist/

# 工具生成目录
.claude/
.omc/
.understand-anything/
```

- [ ] **Step 2: 运行 Git 状态检查，确认仅有设计与计划文件变更**

Run: `git status --short`
Expected: 仅出现 `.gitignore`、`docs/superpowers/specs/...`、`docs/superpowers/plans/...`，并忽略 `.codegraph/`

- [ ] **Step 3: 提交基线整理**

```bash
git add .gitignore docs/superpowers/plans/2026-06-10-rust-only-repo.md
git commit -m "chore(仓库基线): 补齐 Rust 主仓忽略规则"
```

### Task 2: 提升 Rust 主项目到仓库根目录

**Files:**
- Create: `Cargo.toml`
- Create: `Cargo.lock`
- Create: `apps/**`
- Create: `crates/**`
- Create: `resources/**`
- Create: `scripts/**`
- Create: `README.md`
- Delete: `claude-desktop-zh-cn-rs/**`

- [ ] **Step 1: 先记录待提升目录，避免遗漏主项目内容**

```powershell
Get-ChildItem 'claude-desktop-zh-cn-rs' -Force
```

Expected: 至少包含 `.github`、`apps`、`crates`、`resources`、`scripts`、`Cargo.toml`、`Cargo.lock`、`README.md`

- [ ] **Step 2: 将 Rust 主项目文件复制到仓库根目录**

```powershell
Copy-Item 'claude-desktop-zh-cn-rs\Cargo.toml' '.\Cargo.toml'
Copy-Item 'claude-desktop-zh-cn-rs\Cargo.lock' '.\Cargo.lock'
Copy-Item 'claude-desktop-zh-cn-rs\README.md' '.\README.rs-source.md'
Copy-Item 'claude-desktop-zh-cn-rs\apps' '.\apps' -Recurse
Copy-Item 'claude-desktop-zh-cn-rs\crates' '.\crates' -Recurse
Copy-Item 'claude-desktop-zh-cn-rs\resources' '.\resources-rs' -Recurse
Copy-Item 'claude-desktop-zh-cn-rs\scripts' '.\scripts-rs' -Recurse
```

- [ ] **Step 3: 用迁移后的 Rust 版本内容覆盖根目录旧资源与脚本目录**

```powershell
Remove-Item '.\resources' -Recurse -Force
Move-Item '.\resources-rs' '.\resources'
Remove-Item '.\scripts' -Recurse -Force
Move-Item '.\scripts-rs' '.\scripts'
```

- [ ] **Step 4: 将 Rust / Tauri 目录结构加入版本控制**

```bash
git add Cargo.toml Cargo.lock apps crates resources scripts README.rs-source.md
git status --short
```

Expected: 出现新的根目录 Rust 主项目文件，同时旧版文件仍暂时存在

### Task 3: 修复根目录工程配置与应用元数据

**Files:**
- Modify: `Cargo.toml`
- Modify: `apps/desktop/package.json`
- Modify: `apps/desktop/src-tauri/tauri.conf.json`
- Modify: `apps/desktop/src-tauri/Cargo.toml`
- Modify: `README.md`

- [ ] **Step 1: 校正根目录 `Cargo.toml`，确保 workspace 直接引用根目录成员**

```toml
[workspace]
members = [
  "crates/core",
  "crates/platform",
  "apps/desktop/src-tauri",
]
resolver = "2"
```

- [ ] **Step 2: 修正 Tauri 资源路径，移除对子目录层级的依赖**

```json
{
  "bundle": {
    "resources": {
      "../../../resources": "resources"
    }
  }
}
```

Update to:

```json
{
  "bundle": {
    "resources": {
      "../../resources": "resources"
    }
  }
}
```

- [ ] **Step 3: 调整应用标识和包名中的旧子目录痕迹**

```json
{
  "name": "claude-desktop-zh-cn",
  "version": "0.1.6"
}
```

```json
{
  "identifier": "cn.javaht.claude-desktop-zh-cn"
}
```

- [ ] **Step 4: 以 Rust 版为基础重写根 `README.md` 的最小骨架**

```markdown
# Claude-Zh

基于 Rust / Tauri 的 Claude Desktop 中文安装器。

## 开发

```bash
cargo test --workspace
cd apps/desktop
npm install
npm run build
npm run tauri build
```
```

- [ ] **Step 5: 运行配置搜索，确认不再引用 `claude-desktop-zh-cn-rs/`**

Run: `Get-ChildItem -Recurse -File | Select-String -Pattern 'claude-desktop-zh-cn-rs/'`
Expected: 配置文件中不再出现旧子目录路径；品牌或历史说明中的文本引用除外

### Task 4: 合并并精简 GitHub Actions

**Files:**
- Modify: `.github/workflows/build-rs-installers.yml`
- Modify: `.github/workflows/prepare-release.yml`
- Delete: `claude-desktop-zh-cn-rs/.github/workflows/build-installers.yml`

- [ ] **Step 1: 更新 `build-rs-installers.yml` 中所有工作目录与缓存路径**

```yaml
cache-dependency-path: apps/desktop/package-lock.json
workspaces: |
  . -> target
  apps/desktop/src-tauri -> apps/desktop/src-tauri/target
working-directory: apps/desktop
path: |
  target/release/bundle/**
  apps/desktop/src-tauri/target/release/bundle/**
```

- [ ] **Step 2: 更新 `prepare-release.yml`，移除旧子目录前缀**

```yaml
cache-dependency-path: apps/desktop/package-lock.json
working-directory: apps/desktop
working-directory: .
run: cargo test --workspace
```

- [ ] **Step 3: 删除子目录内的重复工作流文件**

```powershell
Remove-Item 'claude-desktop-zh-cn-rs\.github\workflows\build-installers.yml' -Force
```

- [ ] **Step 4: 验证工作流文件中不存在旧路径**

Run: `Get-ChildItem '.github/workflows' -File | Select-String -Pattern 'claude-desktop-zh-cn-rs'`
Expected: 无输出

- [ ] **Step 5: 提交工作流切换**

```bash
git add .github/workflows
git commit -m "ci(工作流): 切换 Rust 主仓路径"
```

### Task 5: 删除旧脚本版实现与入口

**Files:**
- Delete: `install-mac.command`
- Delete: `install-windows.bat`
- Delete: `scripts/patch_claude_zh_cn.py`
- Delete: `scripts/install_windows.ps1`
- Delete: `resources/*` 中只属于旧版的残留文件
- Delete: `README.rs-source.md`
- Delete: `claude-desktop-zh-cn-rs/**`

- [ ] **Step 1: 先搜索旧版入口与脚本引用，确认不会误删 Rust 版依赖**

Run: `Get-ChildItem -Recurse -File | Select-String -Pattern 'install-windows.bat|install-mac.command|patch_claude_zh_cn.py'`
Expected: 仅在旧版文档或旧版入口中命中

- [ ] **Step 2: 删除旧版安装入口与 Python 补丁实现**

```powershell
Remove-Item '.\install-mac.command' -Force
Remove-Item '.\install-windows.bat' -Force
Remove-Item '.\scripts\patch_claude_zh_cn.py' -Force
Remove-Item '.\scripts\install_windows.ps1' -Force
```

- [ ] **Step 3: 删除已完成提升的旧子目录**

```powershell
Remove-Item '.\claude-desktop-zh-cn-rs' -Recurse -Force
```

- [ ] **Step 4: 检查工作树中不再存在旧版实现目录**

Run: `Get-ChildItem -Name`
Expected: 不再出现 `claude-desktop-zh-cn-rs`、`install-mac.command`、`install-windows.bat`

### Task 6: 统一 README、Pages 与文档入口

**Files:**
- Modify: `README.md`
- Modify: `docs/index.html`
- Modify: `docs/agent/QUICKSTART.md`
- Modify: `docs/agent/AGENT_HANDOFF.md`
- Keep: `docs/images/*.png`

- [ ] **Step 1: 重写根 `README.md`，只保留 Rust / Tauri 版说明**

```markdown
## 特性

- 基于 Rust / Tauri 的图形安装器
- 支持 macOS 与 Windows
- 支持中文资源安装、恢复、自动更新管理与 skills 同步

## 快速开始

### 开发环境

- Rust stable
- Node.js 22

### 本地构建

```bash
cargo test --workspace
cd apps/desktop
npm ci
npm run build
```
```

- [ ] **Step 2: 更新 `docs/index.html`，将首页叙事切换到 Rust 版**

```html
<title>Claude-Zh</title>
<meta name="description" content="基于 Rust / Tauri 的 Claude Desktop 中文安装器" />
```

- [ ] **Step 3: 清理 `docs/agent` 中对旧版结构的描述，但保留截图资源**

```markdown
旧版脚本版已废弃，当前仓库仅维护 Rust / Tauri 重构版。
截图资源保留在 `docs/images/`，仅用于展示。
```

- [ ] **Step 4: 检查文档引用未误删截图资源**

Run: `Get-ChildItem 'docs/images' -File`
Expected: `claude-desktop-zh-cn-home.png`、`claude-desktop-zh-cn-settings.png` 等截图仍存在

### Task 7: 完整验证与收尾提交

**Files:**
- Verify: `Cargo.toml`
- Verify: `apps/desktop/package.json`
- Verify: `.github/workflows/*.yml`
- Verify: `README.md`

- [ ] **Step 1: 运行 Rust 测试**

Run: `cargo test --workspace`
Expected: 全部测试通过

- [ ] **Step 2: 运行前端依赖安装与构建**

Run: `cd apps/desktop && npm ci && npm run build`
Expected: Vite 构建成功，生成 `apps/desktop/dist`

- [ ] **Step 3: 运行 Tauri 基础打包检查**

Run: `cd apps/desktop && npm run tauri -- build --ci --no-sign --bundles nsis`
Expected: 至少通过配置解析并进入打包流程；若受环境限制失败，需要记录具体限制

- [ ] **Step 4: 搜索旧路径与旧入口残留**

Run: `Get-ChildItem -Recurse -File | Select-String -Pattern 'claude-desktop-zh-cn-rs|install-windows.bat|install-mac.command|patch_claude_zh_cn.py'`
Expected: 不再命中当前实现文件；仅允许出现在迁移说明中

- [ ] **Step 5: 检查最终 Git 状态**

Run: `git status --short`
Expected: 仅包含本次迁移相关变更，无 `target/`、`node_modules/`、`.codegraph/`

- [ ] **Step 6: 提交完整迁移**

```bash
git add .
git commit -m "refactor(仓库结构): 提升 Rust 重构版为唯一主仓"
```

- [ ] **Step 7: 记录验证结果**

```markdown
- `cargo test --workspace`：通过 / 未通过
- `npm run build`：通过 / 未通过
- `npm run tauri -- build --ci --no-sign --bundles nsis`：通过 / 受环境限制
```

