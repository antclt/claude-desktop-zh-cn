import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ActionButtons } from "./components/ActionButtons";
import { InstallOptions } from "./components/InstallOptions";
import { LogPanel } from "./components/LogPanel";
import { StatusPanel } from "./components/StatusPanel";
import { TitleBar } from "./components/TitleBar";
import { useActionRunner } from "./hooks/useActionRunner";
import { useEnvironment } from "./hooks/useEnvironment";
import { useResourceRelease } from "./hooks/useResourceRelease";
import { useTheme } from "./hooks/useTheme";
import type { ActionStarted, Language, PatchMode } from "./types";

export default function App() {
  useTheme(); // 跟随系统主题，无需消费返回值
  const { env, detectEnvironment } = useEnvironment();
  const {
    busy,
    logs,
    logText,
    lastError,
    appendLog,
    setLogs,
    runAction,
    runBackgroundAction,
    runRefresh,
  } = useActionRunner(detectEnvironment);
  const [language, setLanguage] = useState<Language>("zh-CN");
  const [mode, setMode] = useState<PatchMode>("safe");
  const [launchAfter, setLaunchAfter] = useState(true);
  const [dryRun, setDryRun] = useState(false);

  useEffect(() => {
    void runRefresh();
  }, [runRefresh]);

  useResourceRelease(appendLog, runBackgroundAction);

  const canRun = Boolean(env?.resourcesOk && env?.claudePath && !busy);

  const handleRefresh = useCallback(() => {
    void runRefresh();
  }, [runRefresh]);

  const handleInstall = useCallback(() => {
    void runBackgroundAction("安装中文补丁", (actionId) =>
      invoke<ActionStarted>("install_patch", {
        actionId,
        request: { language, mode, launchAfter, dryRun },
      }),
    );
  }, [dryRun, language, launchAfter, mode, runBackgroundAction]);

  const handleRestore = useCallback(() => {
    void runBackgroundAction("恢复原样", (actionId) => invoke<ActionStarted>("restore_patch", { actionId }));
  }, [runBackgroundAction]);

  const handleEnableAutoUpdates = useCallback(() => {
    void runAction("开启自动更新", () => invoke("set_auto_updates", { enabled: true }));
  }, [runAction]);

  const handleDisableAutoUpdates = useCallback(() => {
    void runAction("停止自动更新", () => invoke("set_auto_updates", { enabled: false }));
  }, [runAction]);

  const handleSyncSkills = useCallback(() => {
    void runAction("同步 CC Switch skills", () => invoke("sync_cc_switch_skills"));
  }, [runAction]);

  const handleUnsyncSkills = useCallback(() => {
    void runAction("删除 skills 同步", () => invoke("unsync_cc_switch_skills"));
  }, [runAction]);

  const handleCopyLogs = useCallback(() => {
    void navigator.clipboard.writeText(logText);
  }, [logText]);

  const handleClearLogs = useCallback(() => {
    setLogs([]);
  }, [setLogs]);

  return (
    <div className="flex flex-col h-screen">
      <TitleBar />
      <main className="shell flex-1 overflow-y-auto">
      <StatusPanel env={env} busy={busy} lastError={lastError} onRefresh={handleRefresh} />

      <div className="grid">
        <InstallOptions
          language={language}
          mode={mode}
          launchAfter={launchAfter}
          dryRun={dryRun}
          busy={busy}
          canRun={canRun}
          onLanguageChange={setLanguage}
          onModeChange={setMode}
          onLaunchAfterChange={setLaunchAfter}
          onDryRunChange={setDryRun}
          onInstall={handleInstall}
        />
        <ActionButtons
          canRun={canRun}
          busy={busy}
          onRestore={handleRestore}
          onEnableAutoUpdates={handleEnableAutoUpdates}
          onDisableAutoUpdates={handleDisableAutoUpdates}
          onSyncSkills={handleSyncSkills}
          onUnsyncSkills={handleUnsyncSkills}
        />
      </div>

      <LogPanel logs={logs} logText={logText} onCopy={handleCopyLogs} onClear={handleClearLogs} />
    </main>
    </div>
  );
}
