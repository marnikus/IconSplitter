import { useState } from "react";
import { armCompletionSound, completionSoundEnabled, completionSoundLabel, playCompletionSound, setCompletionSound } from "./completionSound";

export default function CompletionSoundControl() {
  const [enabled, setEnabled] = useState(completionSoundEnabled);
  const [note, setNote] = useState("");
  return <div className="svg-provider-foot" data-testid="process-sound">
    <label><input type="checkbox" checked={enabled} data-testid="process-sound-enabled" onChange={(e) => {
      setEnabled(e.target.checked); setCompletionSound(e.target.checked);
      if (e.target.checked) armCompletionSound();
    }} /> Completion sound</label>
    <span>{completionSoundLabel}</span>
    <button type="button" className="svg-btn" disabled={!enabled} data-testid="process-sound-test" onClick={() => {
      armCompletionSound();
      void playCompletionSound().then((played) => setNote(played ? "Sound played" : "Audio unavailable or blocked by this browser"));
    }}>Test sound</button>
    {note && <span role="status">{note}</span>}
  </div>;
}
