// PublishedArtifact.tsx — the committed JPEG of the active row (CP-5). The file
// is read from the pair's own export folder, shown through ONE object URL that
// is revoked when the row closes or the folder changes, and replaced by an
// honest "Not exported yet" when the file really is not there.

import { useEffect, useState } from "react";
import type { DirHandleLike } from "../lib/fs";
import type { UploadRowSource } from "./discovery";
import { readPublishedJpeg } from "./published";

export interface PublishedArtifactProps {
  rootRef: { current: DirHandleLike | null };
  /** Bumped by every pick and scan: no artifact may outlive its folder. */
  rootToken: number;
  source: UploadRowSource;
  /**
   * The committed package's identity (status + JPEG bytes + stage). It changes
   * whenever a run could have written or removed the file, which is exactly
   * when this component must look again.
   */
  packageStamp: string;
  testid: string;
}

export default function PublishedArtifact(props: PublishedArtifactProps) {
  const url = usePublishedUrl(props);
  if (url === undefined) return null; // not read yet
  if (url === null) return <MissingNote source={props.source} testid={props.testid} />;
  return <PublishedImage url={url} source={props.source} testid={props.testid} />;
}

/** The committed JPEG's object URL: `undefined` until read, `null` when absent. */
function usePublishedUrl({ rootRef, rootToken, source, packageStamp }: PublishedArtifactProps): string | null | undefined {
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    let created: string | null = null;
    setUrl(undefined);
    void (async () => {
      const blob = await readPublishedJpeg(rootRef.current, source);
      if (!live) return;
      if (blob !== null) {
        created = URL.createObjectURL(blob);
        setUrl(created);
        return;
      }
      setUrl(null);
    })();
    return () => {
      live = false;
      if (created !== null) URL.revokeObjectURL(created);
      setUrl(undefined);
    };
  }, [rootRef, rootToken, source, packageStamp]);
  return url;
}

/** The absent case: named as such, never a stand-in frame. */
function MissingNote({ source, testid }: { source: UploadRowSource; testid: string }) {
  return (
    <p className="svg-note" data-testid={`${testid}-missing`}>
      Not exported yet — {source.svgName.replace(/\.svg$/i, "")}.jpg is not in the pair&apos;s export folder
    </p>
  );
}

/** The committed file itself, framed with the name it really has on disk. */
function PublishedImage({ url, source, testid }: { url: string; source: UploadRowSource; testid: string }) {
  return (
    <figure className="up-published">
      <img data-testid={testid} src={url} alt={`The committed JPEG of ${source.svgName}`} />
      <figcaption>committed JPEG · {source.svgName.replace(/\.svg$/i, "")}.jpg</figcaption>
    </figure>
  );
}
