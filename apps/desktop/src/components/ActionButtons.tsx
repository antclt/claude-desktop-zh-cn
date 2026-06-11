import { Bell, BellOff, Eraser, Loader2, RefreshCcw, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ActionButtonsProps = {
  canRun: boolean;
  busy: string | null;
  onRestore: () => void;
  onEnableAutoUpdates: () => void;
  onDisableAutoUpdates: () => void;
  onSyncSkills: () => void;
  onUnsyncSkills: () => void;
};

export function ActionButtons({
  canRun,
  busy,
  onRestore,
  onEnableAutoUpdates,
  onDisableAutoUpdates,
  onSyncSkills,
  onUnsyncSkills,
}: ActionButtonsProps) {
  const isBusy = Boolean(busy);

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-base font-medium">维护操作</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2">
          <Button
            variant="outline"
            className="w-full justify-start"
            disabled={!canRun}
            onClick={onRestore}
          >
            {busy === "恢复原样" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
            恢复
          </Button>
          <Button
            variant="outline"
            className="w-full justify-start"
            disabled={isBusy}
            onClick={onEnableAutoUpdates}
          >
            <Bell className="h-4 w-4" />
            开启自动更新
          </Button>
          <Button
            variant="outline"
            className="w-full justify-start"
            disabled={isBusy}
            onClick={onDisableAutoUpdates}
          >
            <BellOff className="h-4 w-4" />
            停止自动更新
          </Button>
          <Button
            variant="outline"
            className="w-full justify-start"
            disabled={isBusy}
            onClick={onSyncSkills}
          >
            <RefreshCcw className="h-4 w-4" />
            同步 Skills
          </Button>
          <Button
            variant="destructive"
            className="w-full justify-start"
            disabled={isBusy}
            onClick={onUnsyncSkills}
          >
            <Eraser className="h-4 w-4" />
            删除 Skills
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
