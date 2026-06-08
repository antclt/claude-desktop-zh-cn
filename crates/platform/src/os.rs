use chrono::Local;
#[cfg(windows)]
use claude_zh_core::{
    asar_header_hash, patched_version_record, remove_language_files, unregister_language,
};
use claude_zh_core::{
    copy_file, err, install_into_resources, remove_path, set_config_locale, write_json, CoreError,
    InstallPaths, InstallRequest, LogSink, LogSinkExt, Result,
};
use std::{
    env,
    fs,
    path::{Path, PathBuf},
    process::{Command, Stdio},
};
use walkdir::WalkDir;

use crate::{
    environment::detect_claude,
    logging::{hide_command_window, run_command},
    paths::claude_config_paths,
};

#[cfg(windows)]
const WATCHER_TASK: &str = "ClaudeDesktopZhCn-UpdateWatcher";

#[cfg(target_os = "macos")]
fn quit_claude(logger: &dyn LogSink) {
    logger.info("正在请求 Claude Desktop 退出。");
    let _ = run_command(
        {
            let mut cmd = Command::new("osascript");
            cmd.arg("-e").arg(r#"tell application "Claude" to quit"#);
            cmd
        },
        logger,
        "关闭 Claude Desktop",
    );
}

#[cfg(windows)]
fn quit_claude(logger: &dyn LogSink) {
    logger.info("正在强制关闭 Claude Desktop 进程。");
    let _ = run_command(
        {
            let mut cmd = Command::new("taskkill");
            cmd.args(["/IM", "Claude.exe", "/F"]);
            cmd
        },
        logger,
        "关闭 Claude Desktop",
    );
}

#[cfg(not(any(target_os = "macos", windows)))]
fn quit_claude(_logger: &dyn LogSink) {}

#[cfg(target_os = "macos")]
pub(crate) fn launch_claude(path: &Path, logger: &dyn LogSink) {
    let _ = run_command(
        {
            let mut cmd = Command::new("open");
            cmd.arg("-a").arg(path);
            cmd
        },
        logger,
        "启动 Claude Desktop",
    );
}

#[cfg(windows)]
pub(crate) fn launch_claude(app: &Path, logger: &dyn LogSink) {
    let exe = [
        "Claude.exe",
        "claude.exe",
        r"app\Claude.exe",
        r"app\claude.exe",
    ]
    .iter()
    .map(|name| app.join(name))
    .find(|path| path.is_file());
    if let Some(exe) = exe {
        let mut cmd = Command::new(exe);
        hide_command_window(&mut cmd);
        cmd.stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        let _ = cmd.spawn();
        logger.info("已启动 Claude Desktop");
    }
}

#[cfg(not(any(target_os = "macos", windows)))]
pub(crate) fn launch_claude(_app: &Path, _logger: &dyn LogSink) {}

#[cfg(target_os = "macos")]
fn macos_backup_candidates() -> Result<Vec<PathBuf>> {
    let mut backups: Vec<PathBuf> = fs::read_dir("/Applications")?
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| {
            path.is_dir()
                && path
                    .file_name()
                    .and_then(OsStr::to_str)
                    .is_some_and(|name| name.starts_with("Claude.backup-before-zh-CN-"))
        })
        .collect();
    backups.sort();
    Ok(backups)
}

#[cfg(target_os = "macos")]
fn macos_entitlements(path: &Path) -> Result<Option<plist::Dictionary>> {
    let output = Command::new("codesign")
        .arg("-d")
        .arg("--entitlements")
        .arg(":-")
        .arg("--xml")
        .arg(path)
        .output()?;
    if output.stdout.is_empty() {
        return Ok(None);
    }
    let value: plist::Value = plist::from_bytes(&output.stdout)?;
    match value {
        plist::Value::Dictionary(dict) => Ok(Some(dict)),
        _ => Ok(None),
    }
}

#[cfg(target_os = "macos")]
fn macos_has_entitlement(path: &Path, key: &str) -> bool {
    macos_entitlements(path)
        .ok()
        .flatten()
        .is_some_and(|ents| ents.contains_key(key))
}

#[cfg(target_os = "macos")]
fn macos_patch_source(app: &Path, logger: &dyn LogSink) -> Result<PathBuf> {
    const REQUIRED_ENTITLEMENT: &str = "com.apple.security.virtualization";
    if macos_has_entitlement(app, REQUIRED_ENTITLEMENT) {
        return Ok(app.to_path_buf());
    }

    logger.warn(
        "当前 Claude.app 缺少 virtualization entitlement，可能已经被粗签名破坏；尝试改用官方备份作为补丁源。",
    );
    for backup in macos_backup_candidates()? {
        if macos_has_entitlement(&backup, REQUIRED_ENTITLEMENT) {
            logger.info(format!("使用现有官方备份作为补丁源: {}", backup.display()));
            return Ok(backup);
        }
    }
    err("当前 Claude.app 缺少必要 entitlement，且没有找到可用官方备份。请先恢复或重装官方 Claude.app。")
}

#[cfg(target_os = "macos")]
fn copy_macos_app_to_temp(source: &Path, target: &Path, logger: &dyn LogSink) -> Result<()> {
    let mut cp = Command::new("cp");
    cp.args(["-cR"]).arg(source).arg(target);
    match run_command(cp, logger, "快速克隆 Claude.app 到临时目录") {
        Ok(_) => Ok(()),
        Err(error) => {
            logger.warn(format!("快速克隆失败，回退 ditto 完整复制: {error}"));
            if target.exists() {
                remove_path(target)?;
            }
            run_command(
                {
                    let mut cmd = Command::new("ditto");
                    cmd.arg(source).arg(target);
                    cmd
                },
                logger,
                "复制 Claude.app 到临时目录",
            )?;
            Ok(())
        }
    }
}

#[cfg(target_os = "macos")]
fn strip_and_augment_entitlements(ents: &mut plist::Dictionary) {
    ents.remove("com.apple.application-identifier");
    ents.remove("com.apple.developer.team-identifier");
    ents.remove("keychain-access-groups");
    ents.insert(
        "com.apple.security.cs.disable-library-validation".to_string(),
        plist::Value::Boolean(true),
    );
}

#[cfg(target_os = "macos")]
fn sign_macos_path(path: &Path) -> Result<()> {
    let mut command = Command::new("codesign");
    command.args([
        "--force",
        "--sign",
        "-",
        "--options",
        "runtime",
        "--preserve-metadata=identifier,flags",
    ]);

    let entitlement_path = if let Some(mut ents) = macos_entitlements(path)? {
        strip_and_augment_entitlements(&mut ents);
        let path = env::temp_dir().join(format!(
            "claude-zh-cn-entitlements-{}.plist",
            Uuid::new_v4()
        ));
        plist::Value::Dictionary(ents).to_file_xml(&path)?;
        command.arg("--entitlements").arg(&path);
        Some(path)
    } else {
        None
    };

    command.arg(path);
    let output = command
        .stderr(Stdio::piped())
        .stdout(Stdio::piped())
        .output()?;
    if let Some(path) = entitlement_path {
        let _ = fs::remove_file(path);
    }
    if !output.status.success() {
        let mut text = String::new();
        text.push_str(&crate::logging::decode_command_output(&output.stdout));
        text.push_str(&crate::logging::decode_command_output(&output.stderr));
        return err(format!("codesign 失败: {}\n{text}", path.display()));
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn macos_path_depth(path: &Path) -> usize {
    path.components().count()
}

#[cfg(target_os = "macos")]
fn is_macos_nested_bundle(path: &Path) -> bool {
    let Some(ext) = path.extension().and_then(OsStr::to_str) else {
        return false;
    };
    matches!(ext, "app" | "framework" | "bundle" | "xpc")
}

#[cfg(target_os = "macos")]
fn is_macos_signable_file(path: &Path) -> bool {
    if path.is_symlink() || !path.is_file() {
        return false;
    }
    if path
        .extension()
        .and_then(OsStr::to_str)
        .is_some_and(|ext| matches!(ext, "dylib" | "node" | "so"))
    {
        return true;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        return fs::metadata(path)
            .map(|meta| meta.permissions().mode() & 0o111 != 0)
            .unwrap_or(false);
    }
    #[allow(unreachable_code)]
    false
}

#[cfg(target_os = "macos")]
fn resign_macos_app(app: &Path, logger: &dyn LogSink) -> Result<()> {
    let started = Instant::now();
    let contents = app.join("Contents");
    logger.info("开始扫描 Claude.app 内部可签名文件。");

    let mut file_targets = Vec::new();
    let mut bundle_targets = Vec::new();
    for entry in WalkDir::new(&contents).follow_links(false) {
        let entry = entry?;
        let path = entry.path();
        if entry.file_type().is_dir() {
            if is_macos_nested_bundle(path) {
                bundle_targets.push(path.to_path_buf());
            }
        } else if entry.file_type().is_file() && is_macos_signable_file(path) {
            file_targets.push(path.to_path_buf());
        }
    }

    file_targets.sort_by_key(|path| std::cmp::Reverse(macos_path_depth(path)));
    bundle_targets.sort_by_key(|path| std::cmp::Reverse(macos_path_depth(path)));
    logger.info(format!(
        "需要重签名 {} 个可执行文件、{} 个嵌套 bundle。",
        file_targets.len(),
        bundle_targets.len()
    ));

    for (index, path) in file_targets.iter().enumerate() {
        sign_macos_path(path)?;
        let done = index + 1;
        if done % 25 == 0 || done == file_targets.len() {
            logger.info(format!("已重签名可执行文件: {done}/{}", file_targets.len()));
        }
    }
    for (index, path) in bundle_targets.iter().enumerate() {
        sign_macos_path(path)?;
        let done = index + 1;
        if done % 10 == 0 || done == bundle_targets.len() {
            logger.info(format!(
                "已重签名嵌套 bundle: {done}/{}",
                bundle_targets.len()
            ));
        }
    }
    sign_macos_path(app)?;
    logger.info(format!(
        "Claude.app 重签名完成，用时 {} 秒。",
        started.elapsed().as_secs()
    ));
    Ok(())
}

#[cfg(target_os = "macos")]
fn verify_macos_app_signature(app: &Path, logger: &dyn LogSink) -> Result<()> {
    run_command(
        {
            let mut cmd = Command::new("codesign");
            cmd.args(["--verify", "--deep", "--strict", "--verbose=2"]);
            cmd.arg(app);
            cmd
        },
        logger,
        "验证 Claude.app 签名",
    )?;
    if macos_has_entitlement(app, "com.apple.security.virtualization") {
        logger.info("已确认保留 virtualization entitlement。");
    } else {
        return err("重签名后缺少 virtualization entitlement。");
    }
    Ok(())
}

#[cfg(target_os = "macos")]
pub(crate) fn platform_install_patch(
    resources: &Path,
    req: &InstallRequest,
    logger: &dyn LogSink,
) -> Result<()> {
    let (app, _resources_path, _) = detect_claude()
        .ok_or_else(|| CoreError::Message("未找到 /Applications/Claude.app。".to_string()))?;
    logger.info(format!("检测到 Claude.app: {}", app.display()));
    let source_app = macos_patch_source(&app, logger)?;
    if source_app != app {
        logger.info(format!("当前安装将从备份源复制: {}", source_app.display()));
    }
    if req.dry_run {
        logger.info("dry-run：不会关闭 Claude，也不会替换 /Applications/Claude.app。");
    } else {
        quit_claude(logger);
    }
    let tmp_root = env::temp_dir().join(format!(
        "claude-zh-cn-rs-{}",
        Local::now().format("%Y%m%d-%H%M%S")
    ));
    fs::create_dir_all(&tmp_root)?;
    let patched_app = tmp_root.join("Claude.app");
    logger.info(format!("临时工作目录: {}", tmp_root.display()));
    logger.info(format!(
        "正在复制 Claude.app 到临时目录: {}",
        patched_app.display()
    ));
    if patched_app.exists() {
        logger.info("临时 Claude.app 已存在，先清理旧副本。");
        remove_path(&patched_app)?;
    }
    copy_macos_app_to_temp(&source_app, &patched_app, logger)?;
    let patched_resources = patched_app.join("Contents/Resources");
    logger.info(format!(
        "开始写入中文资源和 app.asar 补丁: {}",
        patched_resources.display()
    ));
    install_into_resources(
        InstallPaths {
            source_resources: resources,
            target_resources: &patched_resources,
            mac_app_root: Some(&patched_app),
        },
        &req.language,
        &req.mode,
        None,
        logger,
    )?;
    logger.info("中文资源和 app.asar 补丁已写入临时 Claude.app。");
    logger.info("开始保留 entitlements 重签名临时 Claude.app。");
    resign_macos_app(&patched_app, logger)?;
    verify_macos_app_signature(&patched_app, logger)?;
    let _ = run_command(
        {
            let mut cmd = Command::new("xattr");
            cmd.args(["-dr", "com.apple.quarantine"]);
            cmd.arg(&patched_app);
            cmd
        },
        logger,
        "清理 quarantine 属性",
    );
    if req.dry_run {
        logger.info(format!(
            "dry-run 完成，临时 app 保留在: {}",
            patched_app.display()
        ));
        return Ok(());
    }
    logger.info("开始写入 Claude 语言配置。");
    for config in claude_config_paths() {
        set_config_locale(&config, &req.language, logger)?;
    }
    let backup = app.with_file_name(format!(
        "Claude.backup-before-zh-CN-{}.app",
        Local::now().format("%Y%m%d-%H%M%S")
    ));
    logger.info(format!(
        "准备替换正式 Claude.app，原始应用将备份到: {}",
        backup.display()
    ));
    fs::rename(&app, &backup)?;
    logger.info("原始 Claude.app 已移入备份。");
    fs::rename(&patched_app, &app)?;
    logger.info(format!("补丁版 Claude.app 已安装到: {}", app.display()));
    logger.info(format!("已备份原始 Claude.app: {}", backup.display()));
    if req.launch_after {
        launch_claude(&app, logger);
    }
    Ok(())
}

#[cfg(windows)]
pub(crate) fn platform_install_patch(
    resources: &Path,
    req: &InstallRequest,
    logger: &dyn LogSink,
) -> Result<()> {
    let (app, target_resources, _) =
        detect_claude().ok_or_else(|| CoreError::Message("未找到 Claude Desktop。".to_string()))?;
    logger.info(format!("检测到 Claude Desktop: {}", app.display()));
    logger.info(format!("目标 resources: {}", target_resources.display()));
    if req.dry_run {
        logger.info("dry-run：复制 resources 到临时目录验证，不会修改真实 Claude 安装。");
        let tmp_root = env::temp_dir().join(format!(
            "claude-zh-cn-rs-win-{}",
            Local::now().format("%Y%m%d-%H%M%S")
        ));
        let temp_resources = tmp_root.join("resources");
        logger.info(format!(
            "正在复制 resources 到临时目录: {}",
            temp_resources.display()
        ));
        copy_dir_recursive(&target_resources, &temp_resources)?;
        logger.info("临时 resources 复制完成，开始验证补丁写入。");
        install_into_resources(
            InstallPaths {
                source_resources: resources,
                target_resources: &temp_resources,
                mac_app_root: None,
            },
            &req.language,
            &req.mode,
            None,
            logger,
        )?;
        logger.info(format!(
            "dry-run 完成，临时 resources 保留在: {}",
            temp_resources.display()
        ));
        return Ok(());
    }
    quit_claude(logger);
    let backup_base = target_resources
        .join(".zh-cn-backups")
        .join(Local::now().format("%Y%m%d-%H%M%S").to_string());
    logger.info(format!("Windows 资源备份目录: {}", backup_base.display()));
    let backup = |path: &Path| -> Result<()> {
        if !path.exists() {
            return Ok(());
        }
        let rel = path.strip_prefix(&target_resources).unwrap_or(path);
        copy_file(path, &backup_base.join(rel))
    };
    install_into_resources(
        InstallPaths {
            source_resources: resources,
            target_resources: &target_resources,
            mac_app_root: None,
        },
        &req.language,
        &req.mode,
        Some(&backup),
        logger,
    )?;
    logger.info("Windows resources 补丁写入完成。");
    if req.mode != "safe" {
        logger.info("开始同步 Windows Claude.exe app.asar 完整性标记。");
        sync_windows_exe_asar_integrity(&target_resources, logger)?;
    }
    logger.info("开始写入 Claude 语言配置。");
    for config in claude_config_paths() {
        set_config_locale(&config, &req.language, logger)?;
    }
    save_patched_version(&app, &req.mode, &req.language, logger)?;
    let _ = unregister_update_watcher(logger);
    if req.launch_after {
        launch_claude(&app, logger);
    }
    Ok(())
}

#[cfg(windows)]
fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<()> {
    if dst.exists() {
        remove_path(dst)?;
    }
    fs::create_dir_all(dst)?;
    for entry in WalkDir::new(src) {
        let entry = entry?;
        let rel = entry.path().strip_prefix(src).unwrap();
        let target = dst.join(rel);
        if entry.file_type().is_dir() {
            fs::create_dir_all(&target)?;
        } else if entry.file_type().is_file() {
            copy_file(entry.path(), &target)?;
        }
    }
    Ok(())
}

#[cfg(not(any(target_os = "macos", windows)))]
pub(crate) fn platform_install_patch(
    _resources: &Path,
    _req: &InstallRequest,
    _logger: &dyn LogSink,
) -> Result<()> {
    err("unsupported platform")
}

#[cfg(target_os = "macos")]
pub(crate) fn platform_restore_patch(logger: &dyn LogSink) -> Result<()> {
    let app = PathBuf::from("/Applications/Claude.app");
    logger.info("正在查找 macOS Claude.app 备份。");
    let mut backups: Vec<PathBuf> = fs::read_dir("/Applications")?
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| {
            path.is_dir()
                && path
                    .file_name()
                    .and_then(OsStr::to_str)
                    .is_some_and(|name| name.starts_with("Claude.backup-before-zh-CN-"))
        })
        .collect();
    backups.sort();
    let Some(backup) = backups.first().cloned() else {
        return err("没有找到可恢复的 Claude 备份。");
    };
    logger.info(format!("将恢复备份: {}", backup.display()));
    quit_claude(logger);
    let current_tmp = app.with_file_name(format!(
        "Claude.restore-current-{}.app",
        Local::now().format("%Y%m%d-%H%M%S")
    ));
    if app.exists() {
        logger.info(format!(
            "当前 Claude.app 临时移动到: {}",
            current_tmp.display()
        ));
        fs::rename(&app, &current_tmp)?;
    }
    fs::rename(&backup, &app)?;
    logger.info(format!("官方 Claude.app 已恢复到: {}", app.display()));
    if current_tmp.exists() {
        logger.info("正在清理恢复前的补丁版 Claude.app。");
        remove_path(&current_tmp)?;
    }
    for extra in backups.into_iter().skip(1) {
        logger.info(format!("正在清理旧备份: {}", extra.display()));
        let _ = remove_path(&extra);
    }
    logger.info("正在恢复英文语言配置。");
    for config in claude_config_paths() {
        set_config_locale(&config, "en-US", logger)?;
    }
    logger.info("macOS 恢复完成。");
    Ok(())
}

#[cfg(windows)]
pub(crate) fn platform_restore_patch(logger: &dyn LogSink) -> Result<()> {
    let (_, resources, _) =
        detect_claude().ok_or_else(|| CoreError::Message("未找到 Claude Desktop。".to_string()))?;
    logger.info(format!(
        "Windows 恢复目标 resources: {}",
        resources.display()
    ));
    quit_claude(logger);
    restore_windows_backup(&resources, logger)?;
    logger.info("正在删除中文语言资源文件。");
    remove_language_files(&resources)?;
    unregister_language(&resources, logger)?;
    logger.info("正在恢复英文语言配置。");
    for config in claude_config_paths() {
        set_config_locale(&config, "en-US", logger)?;
    }
    let _ = unregister_update_watcher(logger);
    logger.info("Windows 恢复完成。");
    Ok(())
}

#[cfg(not(any(target_os = "macos", windows)))]
pub(crate) fn platform_restore_patch(_logger: &dyn LogSink) -> Result<()> {
    err("unsupported platform")
}

#[cfg(windows)]
fn restore_windows_backup(resources: &Path, logger: &dyn LogSink) -> Result<()> {
    let root = resources.join(".zh-cn-backups");
    logger.info(format!("正在查找 Windows 资源备份: {}", root.display()));
    let Some(entries) = fs::read_dir(&root).ok() else {
        logger.warn("没有找到 Windows 备份，跳过 bundle 恢复。");
        return Ok(());
    };
    let mut backups: Vec<PathBuf> = entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| path.is_dir())
        .collect();
    backups.sort();
    let Some(backup) = backups.pop() else {
        logger.warn("没有找到 Windows 备份，跳过 bundle 恢复。");
        return Ok(());
    };
    logger.info(format!("将恢复 Windows 资源备份: {}", backup.display()));
    for entry in WalkDir::new(&backup) {
        let entry = entry?;
        if !entry.file_type().is_file() {
            continue;
        }
        let rel = entry.path().strip_prefix(&backup).unwrap();
        copy_file(entry.path(), &resources.join(rel))?;
        logger.info(format!("已恢复: {}", rel.display()));
    }
    remove_path(&root)?;
    logger.info("已清理 Windows 资源备份目录。");
    Ok(())
}

#[cfg(windows)]
fn sync_windows_exe_asar_integrity(resources: &Path, logger: &dyn LogSink) -> Result<()> {
    let app = resources
        .parent()
        .ok_or_else(|| CoreError::Message("resources 路径无父目录。".to_string()))?;
    let exe = [app.join("Claude.exe"), app.join("claude.exe")]
        .into_iter()
        .find(|path| path.is_file())
        .ok_or_else(|| CoreError::Message("未找到 Claude.exe。".to_string()))?;
    let header_hash = asar_header_hash(&resources.join("app.asar"))?;
    let marker = br#"resources\\app.asar","alg":"SHA256","value":""#;
    let mut data = fs::read(&exe)?;
    let pos = data
        .windows(marker.len())
        .position(|window| window == marker)
        .ok_or_else(|| CoreError::Message("未找到 Claude.exe app.asar 完整性标记。".to_string()))?;
    let hash_start = pos + marker.len();
    if hash_start + 64 > data.len() {
        return err("Claude.exe app.asar 完整性标记边界无效。");
    }
    data[hash_start..hash_start + 64].copy_from_slice(header_hash.as_bytes());
    fs::write(&exe, data)?;
    logger.info("已同步 Claude.exe app.asar 完整性哈希");
    Ok(())
}

#[cfg(windows)]
fn save_patched_version(
    app: &Path,
    mode: &str,
    language: &str,
    logger: &dyn LogSink,
) -> Result<()> {
    let Some(local) = dirs::data_local_dir() else {
        return Ok(());
    };
    let dir = local.join("ClaudeDesktopZhCn");
    fs::create_dir_all(&dir)?;
    let exe = env::current_exe().ok();
    write_json(
        &dir.join("patched-version.json"),
        &patched_version_record(app, mode, language, exe.as_deref()),
    )?;
    logger.info("已记录补丁版本");
    Ok(())
}

#[cfg(windows)]
fn unregister_update_watcher(logger: &dyn LogSink) -> Result<()> {
    let mut cmd = Command::new("schtasks");
    hide_command_window(&mut cmd);
    let removed = cmd
        .args(["/Delete", "/F", "/TN", WATCHER_TASK])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .is_ok_and(|status| status.success());
    if removed {
        logger.info("已移除旧的更新守护计划任务。");
    }
    Ok(())
}
