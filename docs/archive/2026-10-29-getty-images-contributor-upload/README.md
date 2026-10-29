# Getty Images contributor upload research and design

Date: 2026-10-29

## Decision

Do **not** add Getty Images as an FTPS/SFTP preset. Getty's contributor portal links creators to its ESP submission service; the official contributor help pages reviewed do not publish a stock-contributor FTP/SFTP host or credentials flow. An invented endpoint or a generic `Getty FTP` preset would invite sending work to the wrong service.

Add a clearly labeled Getty ESP handoff in the existing Stock Upload tab instead. It opens Getty's official sign-in page in a new tab and tells the contributor to upload the already-exported files from the selected workspace using ESP. The app must not collect Getty login credentials, inspect the portal, automate its authenticated UI, or claim that opening the portal is an upload/acceptance confirmation. The existing explicit-confirmed FTP uploader remains unchanged for services that officially support it.

## Official-source findings

- The [Contributor Community home](https://contributors.gettyimages.com/home) links its **Upload** entry to [ESP](https://esp.gettyimages.com/) and its **Already a contributor?** sign-in action to [ESP sign-in](https://esp.gettyimages.com/sign-in?returnUrl=/). This is the appropriate contributor-facing submission path.
- Getty's [Preparing Your Content](https://contributors.gettyimages.com/article_public.aspx?article_id=9146) guide says vector illustrations must be CS6-compatible EPS, have closed shapes / no stray objects / expanded effects, and be paired with a high-quality raster illustration. It gives raster illustration dimensions of at least 1900 × 2800 px (4075 × 4075 recommended), RGB, and the paired EPS/raster must share the same filename stem.
- That same guide says Getty does not accept submissions created using AI generative models. Contributors must check their agreement and current submission requirements for their content category; the article also highlights supporting documents/releases where applicable.
- The [Your Online Account](https://contributors.gettyimages.com/article/9783) help page describes accepted/published portfolio content and states accepted content cannot generally be replaced by contributors. This supports a cautious, manually reviewed submit flow rather than pretending a transfer alone is a complete submission.
- Do not confuse this contributor workflow with old, purpose-specific FTP instructions for news/sports feeds or Getty Media Manager's SFTP ingest (which is a separately provisioned, library-level enterprise feature).

## UI contract

- Keep Getty out of the configurable FTP/SFTP preset dropdown, target checkboxes, upload planner and transfer history.
- Add a separate `Getty Images · ESP` link and a concise note in Upload controls. Use the official ESP sign-in URL, new browsing context, and `rel="noreferrer"`.
- Be explicit that files must be chosen/uploaded inside ESP and that contributors should follow Getty's current content requirements. Mention the EPS + matching raster pair and AI-generated-content restriction from the official guide.
- No provider request or credential use is introduced in this handoff.

## Test and doc updates

Add a UI regression asserting the ESP link target and separate/manual-upload messaging; existing FTPS/SFTP target list stays exactly Shutterstock + Adobe Stock unless the user has added a custom preset. Update the current Stock Upload behavior and selector contract plus README launch/help summary.
