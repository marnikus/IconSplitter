// ActivityBars.tsx — one bar per long wait that is not a job (lib/activity):
// what the page is busy with right now, from any tab. No buttons and no
// finished state: the bar closes itself the moment its work ends.
import { useSyncExternalStore } from "react";
import { activities, type Activity } from "../lib/activity";
import ProgressFrame from "./ProgressFrame";

export default function ActivityBars() {
  const list = useSyncExternalStore(activities.subscribe, activities.list);
  if (list.length === 0) return null;
  return <div className="activity-bars" data-testid="activity-bars">{list.map((a) => <ActivityBar key={a.id} a={a} />)}</div>;
}

function ActivityBar({ a }: { a: Activity }) {
  const known = a.done !== null && a.total !== null;
  const done = a.done ?? 0;
  const total = a.total ?? 0;
  return (
    <ProgressFrame prefix={`activity-${a.source}`} theme="svg" title={a.label} detail={SOURCES[a.source] ?? ""}
      done={done} total={total} remaining={Math.max(0, total - done)} percent={known ? Math.round((done / total) * 100) : null}
      status="running" leading={<span className="svg-progress-check activity-spinner" aria-hidden="true">◌</span>} actions={null} />
  );
}

const SOURCES: Record<string, string> = {
  sheets: "Single sheets", batch: "Batch folders", selection: "Selection V2",
  svg: "Generate SVG", upload: "SVG to upload", stock: "Upload",
};
