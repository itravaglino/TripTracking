import { loadViewer } from "./account";
import { dueViewerIds, scanViewer } from "./scan";

let started = false;

export function startScheduler(): void {
  if (started) return;
  started = true;
  const timer = setInterval(() => {
    void runDue();
  }, 60_000);
  timer.unref?.();
}

async function runDue(): Promise<void> {
  try {
    const ids = await dueViewerIds();
    for (const id of ids) {
      const viewer = await loadViewer(id);
      if (viewer) await scanViewer(viewer, false);
    }
  } catch (error) {
    console.error("trips scheduler failed", error instanceof Error ? error.name : "error");
  }
}
