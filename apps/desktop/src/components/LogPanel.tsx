import { useEffect, useRef } from "react";
import { Copy, Eraser, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import type { LogEvent } from "../types";

type LogPanelProps = {
  logs: LogEvent[];
  logText: string;
  onCopy: () => void;
  onClear: () => void;
};

function levelColor(level: string) {
  if (level === "error") return "text-red-400";
  if (level === "warn") return "text-yellow-400";
  return "text-gray-300";
}

export function LogPanel({ logs, logText, onCopy, onClear }: LogPanelProps) {
  const logEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const handleCopy = () => {
    onCopy();
    toast.success("日志已复制");
  };

  return (
    <Card className="h-48 flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 py-2.5 px-4 border-b border-border shrink-0">
        <CardTitle className="flex items-center gap-2 text-base font-medium">
          <Terminal className="h-4 w-4" />
          执行日志
        </CardTitle>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={handleCopy} title="复制日志">
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" onClick={onClear} title="清空日志">
            <Eraser className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex-1 p-0 overflow-hidden">
        <ScrollArea className="h-full">
          <div
            className="font-mono leading-relaxed text-xs p-4 min-h-full"
            style={{ background: "hsl(220 15% 8%)" }}
          >
            {logs.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-gray-500">
                暂无日志
              </div>
            ) : (
              logs.map((log, i) => (
                <div key={i} className={`${levelColor(log.level)} py-0.5`}>
                  {log.message}
                </div>
              ))
            )}
            <div ref={logEndRef} />
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
