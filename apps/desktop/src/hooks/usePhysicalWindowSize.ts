import { useEffect } from "react";
import { getCurrentWindow, PhysicalSize } from "@tauri-apps/api/window";

const PHYSICAL_WIDTH = 380;
const PHYSICAL_HEIGHT = 484;

// 临时调试：设为 true 时启用物理像素锁定；false 时跳过，方便用户手动拖动调尺寸。
const ENABLE_LOCK = false;

/**
 * 把窗口物理像素锁定为 368×498，不随屏幕 DPI 变化。
 * tauri.conf.json 的 width/height 是逻辑像素（CSS），在不同 DPI 屏物理大小不一致，
 * 这里在启动时按物理像素强制设定一次，并把 min/max 也锁到相同物理尺寸。
 */
export function usePhysicalWindowSize() {
  useEffect(() => {
    if (!ENABLE_LOCK) return;
    const lock = async () => {
      try {
        const appWindow = getCurrentWindow();
        const target = new PhysicalSize(PHYSICAL_WIDTH, PHYSICAL_HEIGHT);
        await appWindow.setResizable(true);
        await appWindow.setSize(target);
        await appWindow.setMinSize(target);
        await appWindow.setMaxSize(target);
        await appWindow.setResizable(false);
      } catch (err) {
        console.error("[usePhysicalWindowSize] failed:", err);
      }
    };
    void lock();
  }, []);
}
