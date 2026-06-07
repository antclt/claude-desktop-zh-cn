import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  AlertTriangle,
  CheckCircle2,
  Clipboard,
  Download,
  Eraser,
  Languages,
  Loader2,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Wrench,
  XCircle,
} from "lucide-react";
import "./styles.css";

type EnvironmentReport = {
  platform: string;
  arch: string;
  resourcesDir?: string | null;
  resourcesOk: boolean;
  resourceIssues: string[];
  claudePath?: string | null;
  resourcesPath?: string | null;
  installKind?: string | null;
  isAdmin: boolean;
  needsAdmin: boolean;
  currentLocale?: string | null;
  backupCount: number;
  ccSwitchSkillsDir?: string | null;
  skillsPluginRoot?: string | null;
  autoUpdatesEnabled?: boolean | null;
  warnings: string[];
};

type LogEvent = {
  level: "info" | "warn" | "error" | string;
  message: string;
};

type ActionStarted = {
  actionId: string;
};

type ActionFinished = {
  actionId: string;
  action: string;
  ok: boolean;
  error?: string | null;
};

type ActionLogDrain = {
  logs: LogEvent[];
  nextOffset: number;
  finished?: ActionFinished | null;
};

type Language = "zh-CN" | "zh-TW" | "zh-HK";
type PatchMode = "safe" | "official" | "full";

const languages: Array<{ value: Language; label: string; hint: string }> = [
  { value: "zh-CN", label: "简体中文", hint: "中国大陆" },
  { value: "zh-TW", label: "繁体中文", hint: "中国台湾" },
  { value: "zh-HK", label: "繁体中文", hint: "中国香港" },
];

const modes: Array<{ value: PatchMode; label: string; hint: string; risk: string }> = [
  {
    value: "safe",
    label: "Cowork 兼容",
    hint: "跳过在线页面和模型名 asar 补丁",
    risk: "适合需要截图工作区或沙箱的用户。",
  },
  {
    value: "official",
    label: "官方账号登录",
    hint: "启用在线页面显示层汉化",
    risk: "会修改 app.asar，Windows 签名状态会改变。",
  },
  {
    value: "full",
    label: "第三方 API 实验",
    hint: "在线汉化 + 去除模型名限制",
    risk: "功能最完整，风险也最高。",
  },
];

function statusText(env: EnvironmentReport | null) {
  if (!env) return "等待检测";
  if (!env.resourcesOk) return "资源异常";
  if (!env.claudePath) return "未找到 Claude";
  return "可执行";
}

function levelLabel(level: string) {
  if (level === "error") return "错误";
  if (level === "warn") return "警告";
  return "日志";
}

function waitForPaint() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

function createActionId(name: string) {
  return `${name}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function App() {
  const [env, setEnv] = useState<EnvironmentReport | null>(null);
  const [language, setLanguage] = useState<Language>("zh-CN");
  const [mode, setMode] = useState<PatchMode>("safe");
  const [launchAfter, setLaunchAfter] = useState(true);
  const [dryRun, setDryRun] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEvent[]>([]);
  const [lastError, setLastError] = useState<string | null>(null);
  const logRef = useRef<HTMLPreElement | null>(null);
  const activeActionRef = useRef<string | null>(null);
  const finishedActionRef = useRef<string | null>(null);
  const actionLogOffsetRef = useRef(0);
  const pollingActionLogsRef = useRef(false);

  const appendLogs = useCallback((entries: LogEvent[]) => {
    setLogs((items) => [...items, ...entries].slice(-700));
  }, []);

  const appendLog = useCallback((entry: LogEvent) => {
    appendLogs([entry]);
  }, [appendLogs]);

  const refresh = useCallback(async () => {
    setBusy((value) => value ?? "detect");
    try {
      const report = await invoke<EnvironmentReport>("detect_environment");
      setEnv(report);
      setLastError(null);
    } catch (error) {
      const message = String(error);
      setLastError(message);
      appendLog({ level: "error", message });
    } finally {
      setBusy((value) => (value === "detect" ? null : value));
    }
  }, [appendLog]);

  const finishBackgroundAction = useCallback(
    async (finished: ActionFinished) => {
      if (finished.actionId !== activeActionRef.current || finishedActionRef.current === finished.actionId) {
        return;
      }
      finishedActionRef.current = finished.actionId;
      activeActionRef.current = null;
      if (finished.ok) {
        appendLog({ level: "info", message: `完成：${finished.action}` });
        setLastError(null);
      } else {
        const message = finished.error ?? `${finished.action} 失败`;
        setLastError(message);
        appendLog({ level: "error", message });
      }
      setBusy(null);
      await refresh();
    },
    [appendLog, refresh],
  );

  useEffect(() => {
    const unlistenLog = listen<LogEvent>("installer-log", (event) => appendLog(event.payload));
    refresh();
    return () => {
      unlistenLog.then((dispose) => dispose()).catch(() => undefined);
    };
  }, [appendLog, refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const actionId = activeActionRef.current;
      if (!actionId || pollingActionLogsRef.current) {
        return;
      }
      pollingActionLogsRef.current = true;
      invoke<ActionLogDrain>("drain_action_logs", {
        actionId,
        offset: actionLogOffsetRef.current,
      })
        .then((drain) => {
          actionLogOffsetRef.current = drain.nextOffset;
          if (drain.logs.length > 0) {
            appendLogs(drain.logs);
          }
          if (drain.finished) {
            void finishBackgroundAction(drain.finished);
          }
        })
        .catch((error) => {
          appendLog({ level: "error", message: `读取后台日志失败: ${String(error)}` });
        })
        .finally(() => {
          pollingActionLogsRef.current = false;
        });
    }, 350);
    return () => window.clearInterval(timer);
  }, [appendLog, appendLogs, finishBackgroundAction]);

  useEffect(() => {
    const node = logRef.current;
    if (node) {
      node.scrollTop = node.scrollHeight;
    }
  }, [logs]);

  const canRun = Boolean(env?.resourcesOk && env?.claudePath && !busy);
  const risk = useMemo(() => modes.find((item) => item.value === mode)?.risk ?? "", [mode]);
  const logText = logs.map((item) => `[${levelLabel(item.level)}] ${item.message}`).join("\n");

  const runAction = useCallback(
    async (name: string, fn: () => Promise<void>) => {
      setBusy(name);
      setLastError(null);
      appendLog({ level: "info", message: `开始执行：${name}` });
      try {
        await waitForPaint();
        await fn();
        appendLog({ level: "info", message: `完成：${name}` });
        await refresh();
      } catch (error) {
        const message = String(error);
        setLastError(message);
        appendLog({ level: "error", message });
      } finally {
        setBusy(null);
      }
    },
    [appendLog, refresh],
  );

  const runBackgroundAction = useCallback(
    async (name: string, fn: (actionId: string) => Promise<ActionStarted>) => {
      const actionId = createActionId(name);
      activeActionRef.current = actionId;
      actionLogOffsetRef.current = 0;
      setBusy(name);
      setLastError(null);
      finishedActionRef.current = null;
      appendLog({ level: "info", message: `开始执行：${name}` });
      appendLog({ level: "info", message: "授权后会继续在这里显示后台执行进度。" });
      try {
        await waitForPaint();
        const started = await fn(actionId);
        if (finishedActionRef.current !== started.actionId) {
          activeActionRef.current = started.actionId;
          appendLog({ level: "info", message: `后台任务已提交：${name}` });
        }
      } catch (error) {
        const message = String(error);
        activeActionRef.current = null;
        setLastError(message);
        setBusy(null);
        appendLog({ level: "error", message });
      }
    },
    [appendLog],
  );

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">Claude Desktop 中文补丁 RS</div>
          <h1>双端 Rust 安装器</h1>
        </div>
        <button className="iconButton" onClick={refresh} disabled={Boolean(busy)} title="重新检测">
          {busy === "detect" ? <Loader2 className="spin" /> : <RefreshCw />}
        </button>
      </header>

      <section className="statusBand">
        <div className="statusItem">
          <span className="statusIcon ok">{env?.claudePath ? <CheckCircle2 /> : <XCircle />}</span>
          <div>
            <strong>{statusText(env)}</strong>
            <span>{env ? `${env.platform} / ${env.arch}` : "尚未完成环境检测"}</span>
          </div>
        </div>
        <div className="statusItem">
          <span className="statusIcon"><Wrench /></span>
          <div>
            <strong>{env?.installKind ?? "未知安装类型"}</strong>
            <span>{env?.claudePath ?? "未检测到安装路径"}</span>
          </div>
        </div>
        <div className="statusItem">
          <span className="statusIcon"><Languages /></span>
          <div>
            <strong>{env?.currentLocale ?? "未设置语言"}</strong>
            <span>{env?.backupCount ?? 0} 个补丁备份</span>
          </div>
        </div>
      </section>

      {(lastError || env?.warnings?.length || env?.resourceIssues?.length) ? (
        <section className="notice">
          <AlertTriangle />
          <div>
            {lastError ? <strong>{lastError}</strong> : <strong>检测到需要注意的事项</strong>}
            {[...(env?.warnings ?? []), ...(env?.resourceIssues ?? [])].slice(0, 5).map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </section>
      ) : null}

      <div className="grid">
        <section className="panel">
          <div className="panelHeader">
            <h2>安装补丁</h2>
            <span>语言、模式、启动选项</span>
          </div>

          <div className="field">
            <label>语言</label>
            <div className="segmented three">
              {languages.map((item) => (
                <button
                  key={item.value}
                  className={language === item.value ? "selected" : ""}
                  onClick={() => setLanguage(item.value)}
                  disabled={Boolean(busy)}
                >
                  <strong>{item.label}</strong>
                  <span>{item.hint}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label>安装模式</label>
            <div className="modeList">
              {modes.map((item) => (
                <button
                  key={item.value}
                  className={mode === item.value ? "mode selected" : "mode"}
                  onClick={() => setMode(item.value)}
                  disabled={Boolean(busy)}
                >
                  <strong>{item.label}</strong>
                  <span>{item.hint}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="warningLine">
            <ShieldAlert />
            <span>{risk}</span>
          </div>

          <div className="toggles">
            <label>
              <input type="checkbox" checked={launchAfter} onChange={(e) => setLaunchAfter(e.target.checked)} />
              完成后启动 Claude
            </label>
            <label>
              <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
              dry-run 验证
            </label>
          </div>

          <button
            className="primary"
            disabled={!canRun}
            onClick={() =>
              runBackgroundAction("安装中文补丁", (actionId) =>
                invoke<ActionStarted>("install_patch", {
                  actionId,
                  request: { language, mode, launchAfter, dryRun },
                }),
              )
            }
          >
            {busy === "安装中文补丁" ? <Loader2 className="spin" /> : <Download />}
            {busy === "安装中文补丁" ? "正在安装..." : "安装中文补丁"}
          </button>
          {busy === "安装中文补丁" ? (
            <div className="progressLine" aria-live="polite">
              <Loader2 className="spin" />
              <span>授权已提交，正在复制、补丁和签名 Claude.app。</span>
            </div>
          ) : null}
        </section>

        <section className="panel">
          <div className="panelHeader">
            <h2>维护操作</h2>
            <span>恢复、更新、skills 同步</span>
          </div>

          <div className="actions">
            <button
              disabled={!canRun}
              onClick={() =>
                runBackgroundAction("恢复原样", (actionId) => invoke<ActionStarted>("restore_patch", { actionId }))
              }
            >
              <RotateCcw />
              恢复 / 卸载补丁
            </button>
            <button disabled={Boolean(busy)} onClick={() => runAction("开启自动更新", () => invoke("set_auto_updates", { enabled: true }))}>
              <CheckCircle2 />
              允许自动更新
            </button>
            <button disabled={Boolean(busy)} onClick={() => runAction("停止自动更新", () => invoke("set_auto_updates", { enabled: false }))}>
              <XCircle />
              停止自动更新
            </button>
            <button disabled={Boolean(busy)} onClick={() => runAction("同步 CC Switch skills", () => invoke("sync_cc_switch_skills"))}>
              <Wrench />
              同步 CC Switch skills
            </button>
            <button disabled={Boolean(busy)} onClick={() => runAction("删除 skills 同步", () => invoke("unsync_cc_switch_skills"))}>
              <Eraser />
              删除 skills 同步
            </button>
          </div>

          <dl className="facts">
            <div>
              <dt>资源目录</dt>
              <dd>{env?.resourcesDir ?? "-"}</dd>
            </div>
            <div>
              <dt>Claude resources</dt>
              <dd>{env?.resourcesPath ?? "-"}</dd>
            </div>
            <div>
              <dt>skills 来源</dt>
              <dd>{env?.ccSwitchSkillsDir ?? "-"}</dd>
            </div>
            <div>
              <dt>skills plugin</dt>
              <dd>{env?.skillsPluginRoot ?? "-"}</dd>
            </div>
          </dl>
        </section>
      </div>

      <section className="logPanel">
        <div className="logHeader">
          <h2>执行日志</h2>
          <div>
            <button className="small" onClick={() => navigator.clipboard.writeText(logText)} title="复制日志">
              <Clipboard />
              复制
            </button>
            <button className="small" onClick={() => setLogs([])} title="清空日志">
              <Eraser />
              清空
            </button>
          </div>
        </div>
        <pre ref={logRef}>{logText || "日志会显示在这里。"}</pre>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
