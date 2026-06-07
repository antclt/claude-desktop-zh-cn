# Claude Desktop 中文补丁 RS

一个独立的 Rust/Tauri 双端重构项目，用于给 Claude Desktop 安装中文语言资源、恢复补丁、管理自动更新和同步 CC Switch skills。

## 开发

```bash
cargo test
cargo check --workspace
cd apps/desktop
npm install
npm run build
npm run tauri build
```

## 项目结构

- `crates/core`：跨平台补丁核心。
- `crates/platform`：macOS / Windows 平台适配与提权执行。
- `apps/desktop`：Tauri 2 图形安装器。
- `resources`：随包中文资源。
