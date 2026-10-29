// GettyContributorPortal.tsx — official ESP handoff and honest automation options.

const ESP_SIGN_IN = "https://esp.gettyimages.com/sign-in?returnUrl=/";
const DEEPMETA_SIGN_IN = "https://deepmeta.creativ.zone/en-GB/signin";
const GETTY_API_DOCS = "https://developer.gettyimages.com/docs/";

export default function GettyContributorPortal() {
  return (
    <aside className="svg-provider" data-testid="stock-getty-handoff" aria-label="Getty Images upload options">
      <PortalHeading />
      <AutomationOptions />
      <VectorRequirements />
    </aside>
  );
}

function PortalHeading() {
  return (
    <div className="svg-provider-top">
      <strong>Getty Images · ESP submission (not FTP/SFTP)</strong>
      <a className="svg-link" data-testid="stock-getty-esp" href={ESP_SIGN_IN} target="_blank" rel="noreferrer">
        Open Getty Images ESP ↗
      </a>
    </div>
  );
}

function AutomationOptions() {
  return (
    <>
      <span className="svg-recursive">
        No automated Getty upload is configured in IconSplitter, so the current official route is a manual upload in ESP.
        Getty's public API docs do not document contributor submissions. Ask your account representative for an approved integration.
      </span>
      <span className="svg-recursive">
        DeepMeta documents Illustration batches, EPS/JPG pairing, uploads and scheduled Auto Submit. It is separate software
        and still requires your account, setup and file selection.
      </span>
      <div className="svg-provider-top">
        <ExternalLink testid="stock-getty-deepmeta" href={DEEPMETA_SIGN_IN}>DeepMeta (third-party) ↗</ExternalLink>
        <ExternalLink testid="stock-getty-api-docs" href={GETTY_API_DOCS}>Getty API access information ↗</ExternalLink>
      </div>
    </>
  );
}

function ExternalLink({ testid, href, children }: { testid: string; href: string; children: string }) {
  return <a className="svg-link" data-testid={testid} href={href} target="_blank" rel="noreferrer">{children}</a>;
}

function VectorRequirements() {
  return (
    <span className="svg-recursive">
      Getty illustration rules: CS6-compatible EPS + same-stem RGB JPEG (minimum 1900 × 2800 px; 4075 × 4075
      recommended). Getty does not accept generative-AI-created content; verify current requirements before submission.
    </span>
  );
}
