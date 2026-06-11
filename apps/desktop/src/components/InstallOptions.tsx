import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { languages, modes } from "../constants";
import type { Language, PatchMode } from "../types";

type InstallOptionsProps = {
  language: Language;
  mode: PatchMode;
  launchAfter: boolean;
  dryRun: boolean;
  busy: string | null;
  canRun: boolean;
  onLanguageChange: (language: Language) => void;
  onModeChange: (mode: PatchMode) => void;
  onLaunchAfterChange: (checked: boolean) => void;
  onDryRunChange: (checked: boolean) => void;
  onInstall: () => void;
};

export function InstallOptions({
  language,
  mode,
  launchAfter,
  dryRun,
  busy,
  canRun,
  onLanguageChange,
  onModeChange,
  onLaunchAfterChange,
  onDryRunChange,
  onInstall,
}: InstallOptionsProps) {
  const isBusy = Boolean(busy);

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-base font-medium">安装选项</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">语言</Label>
            <Select value={language} onValueChange={(v) => onLanguageChange(v as Language)} disabled={isBusy}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {languages.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">安装模式</Label>
            <Select value={mode} onValueChange={(v) => onModeChange(v as PatchMode)} disabled={isBusy}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {modes.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Checkbox
              id="launchAfter"
              checked={launchAfter}
              onCheckedChange={(checked) => onLaunchAfterChange(checked === true)}
              disabled={isBusy}
            />
            <Label htmlFor="launchAfter" className="text-sm font-medium">安装后启动</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="dryRun"
              checked={dryRun}
              onCheckedChange={(checked) => onDryRunChange(checked === true)}
              disabled={isBusy}
            />
            <Label htmlFor="dryRun" className="text-sm font-medium">试运行（不写入）</Label>
          </div>
        </div>

        <Button
          className="w-full h-12 text-base font-semibold"
          disabled={!canRun}
          onClick={onInstall}
        >
          {busy === "安装中文补丁" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          {busy === "安装中文补丁" ? "安装中..." : "开始安装"}
        </Button>

        {busy === "安装中文补丁" ? (
          <div className="flex items-center gap-2 rounded-md border bg-muted/50 p-2.5 text-xs text-muted-foreground" aria-live="polite">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>授权已提交，正在复制、补丁和签名 Claude.app。</span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
