import { AlertTriangle, Boxes, CheckCircle2, Languages, Loader2, RefreshCw, Wrench, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { EnvironmentReport } from "../types";
import { compactPath, statusText } from "../utils/status";

type StatusPanelProps = {
  env: EnvironmentReport | null;
  busy: string | null;
  lastError: string | null;
  onRefresh: () => void;
};

export function StatusPanel({ env, busy, lastError, onRefresh }: StatusPanelProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Boxes className="h-4 w-4" />
          环境检测
        </CardTitle>
        <Button
          variant="ghost"
          size="icon"
          onClick={onRefresh}
          disabled={Boolean(busy)}
          title="重新检测"
        >
          {busy === "detect" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="flex items-center gap-3 rounded-lg border p-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted/60">
              {env?.claudePath ? (
                <CheckCircle2 className="h-5 w-5 text-[hsl(var(--success))]" />
              ) : (
                <XCircle className="h-5 w-5 text-[hsl(var(--error))]" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-base font-semibold truncate">{statusText(env)}</p>
              <p className="text-xs text-muted-foreground">
                {env ? `${env.platform} / ${env.arch}` : "尚未完成环境检测"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border p-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted/60">
              <Wrench className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-base font-semibold truncate">{env?.installKind ?? "未知安装类型"}</p>
              <p className="text-xs text-muted-foreground truncate" title={env?.claudePath ?? undefined}>
                {env?.claudePath ? compactPath(env.claudePath) : "未检测到安装路径"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border p-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted/60">
              <Languages className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-base font-semibold truncate">{env?.currentLocale ?? "未设置语言"}</p>
              <p className="text-xs text-muted-foreground">{env?.backupCount ?? 0} 个补丁备份</p>
            </div>
          </div>
        </div>

        {(lastError || env?.warnings?.length || env?.resourceIssues?.length) ? (
          <div className="flex gap-3 rounded-lg border border-[hsl(38_85%_52%/0.20)] bg-[hsl(38_85%_52%/0.08)] p-3 text-[hsl(38_70%_35%)] dark:border-[hsl(38_80%_58%/0.20)] dark:bg-[hsl(38_80%_58%/0.12)]">
            <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" />
            <div className="min-w-0 space-y-1">
              {lastError ? (
                <p className="text-sm font-medium">{lastError}</p>
              ) : (
                <p className="text-sm font-medium">检测到需要注意的事项</p>
              )}
              {[...(env?.warnings ?? []), ...(env?.resourceIssues ?? [])].slice(0, 5).map((item) => (
                <p key={item} className="text-xs">{item}</p>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
