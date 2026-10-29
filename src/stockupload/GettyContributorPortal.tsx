// GettyContributorPortal.tsx — official Getty contributor handoff (ESP, not FTP).

const ESP_SIGN_IN = "https://esp.gettyimages.com/sign-in?returnUrl=/";

export default function GettyContributorPortal() {
  return (
    <aside className="svg-provider" data-testid="stock-getty-handoff" aria-label="Getty Images manual submission">
      <div className="svg-provider-top">
        <strong>Getty Images · manual upload in ESP (not FTP/SFTP)</strong>
        <a className="svg-link" data-testid="stock-getty-esp" href={ESP_SIGN_IN} target="_blank" rel="noreferrer">
          Open Getty Images ESP ↗
        </a>
      </div>
      <span className="svg-recursive">
        In ESP, choose the exported files from your workspace. Getty's illustration guide requires a CS6-compatible EPS
        paired with a same-stem, high-quality RGB raster (minimum 1900 × 2800 px; 4075 × 4075 recommended). Verify
        current requirements before submitting; Getty says it does not accept AI-generated submissions.
      </span>
    </aside>
  );
}
