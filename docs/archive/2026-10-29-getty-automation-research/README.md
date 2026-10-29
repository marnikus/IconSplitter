# Getty contributor upload automation research

Date: 2026-10-29 · Follow-up to [Getty contributor upload research](../2026-10-29-getty-images-contributor-upload/README.md).

## Bottom line

Do not add Getty as an FTP/SFTP stock preset and do not implement an unattended uploader against guessed/private ESP routes. The contributor workflow is ESP, not a public FTP target. In the official Getty developer documentation reviewed, the public API is the Getty Images API v3, access is tied to licensing/API arrangements and an account representative, and the docs do not document a contributor submission-batch / upload / submit API. This is insufficient evidence for a safe supported integration.

A community ESP client does exist, but its [repository](https://github.com/dysolution/espsdk) and [CLI](https://github.com/dysolution/gettyup) are from 2016, not Getty-maintained public submission API documentation. Do not derive production endpoints, OAuth scopes, S3 upload steps, or contributor permissions from this stale, unofficial code. There is no reliable current sandbox acceptance evidence for an IconSplitter client.

## Current practical choices

1. **Official ESP web tool**: sign in, choose the Illustration content type for illustration submissions, create/choose a batch, upload the matching files, verify Getty's metadata/controlled vocabulary and batch status, and submit. Getty's current help says Getty contributors' entire batch must be submitted before review; an upload by itself is not a submitted/reviewable batch.
2. **Third-party DeepMeta 4**: its vendor docs describe batch creation, illustration batches, EPS/JPG pairing, file upload, metadata editing/sync and a scheduled Auto Submit feature. This is the closest current documented route to reducing manual ESP work. It remains separate third-party software: the contributor must trust/configure it, choose the account/category/batch/files and ensure the batch is ready. Scheduled submit is a user-configured future action, not an IconSplitter direct upload integration.
3. **In-app full automation**: block until Getty confirms in writing a currently supported contributor ESP API, scopes/credentials, upload protocol and sandbox plus production terms for this use. Getty developer docs require account-representative access for API credentials; a confidential OAuth client secret cannot be shipped in this static browser app. Any approved integration would need a local/server-side companion with a registered OAuth redirect, local-only credential handling, upload preview and explicit user authorization before upload/submission.

## Correct category and content constraints

- Getty classifies vector/raster illustrations as Illustration files. DeepMeta's current import guide says raster illustrations go into an Illustration batch, and a vector illustration requires an exact same-filename EPS/JPG pair for recognition/linking.
- Getty's official [Preparing Your Content](https://contributors.gettyimages.com/article_public.aspx?article_id=9146) guide requires CS6-compatible EPS, paired same-stem high-quality RGB JPEG, minimum 1900 × 2800 px (4075 × 4075 recommended), and closed shapes/no stray objects/expanded effects.
- Getty's [May 2025 modification policy](https://contributors.gettyimages.com/help/article/10847) says it does not accept generative-AI-created content (and distinguishes permitted traditional modification / limited retouching rules). Do not automatically submit IconSplitter's AI-generated SVG outputs to Getty; contributors must confirm provenance and current rules.
- Getty's [Inspection Times](https://contributors.gettyimages.com/help/article/4951) says all files in a Getty batch must be submitted before it can be reviewed. It recommends new batches for new content rather than appending after submission.

## Implementation in IconSplitter

Keep the existing manual ESP link. Add links to the DeepMeta vendor workflow and official Getty API documentation, with an explicit statement that the current app cannot perform unattended ESP uploads and why. Do not send files, credentials, API keys or content to either provider from this info card. Existing Shutterstock/Adobe FTPS/SFTP runner remains unaffected. Test only the disclosure and link destinations; no external provider calls in tests.

## Source notes

- Official contributor home: <https://contributors.gettyimages.com/home> (Upload routes to ESP).
- Official public Getty API technical docs: <https://developer.gettyimages.com/docs/> and authorization: <https://developer.gettyimages.com/docs/authorization/>.
- Official Getty illustration prep: <https://contributors.gettyimages.com/article_public.aspx?article_id=9146>.
- Official Getty AI modification policy: <https://contributors.gettyimages.com/help/article/10847>.
- Official Getty inspection/batch requirement: <https://contributors.gettyimages.com/help/article/4951>.
- DeepMeta vendor upload workflow: <https://deepmeta.creativ.zone/en-GB/blog/post/deepmeta-uploads>.
- DeepMeta vendor illustration import: <https://www.deepmeta.com/3/userguide/import-files>.
- DeepMeta vendor scheduled submission: <https://deepmeta.creativ.zone/en-GB/blog/post/deepmeta-auto-submit>.
