export const CREATE_BATCH_DIALOG_SELECTOR: string;
export const PAGE_PRELUDE: string;
export const DRIVER_STEPS: string[];
export const readPageInfo: () => any;
export const fillLoginForm: (arg: { username: string; password: string }) => any;
export const focusLoginField: (arg: { which: "identifier" | "password" }) => any;
export const inspectSignIn: () => any;
export const choosePasswordOption: () => any;
export const submitLogin: () => any;
export const openCreateBatchDialog: () => any;
export const openSubmissionTypeMenu: (arg?: { label?: string }) => any;
export const chooseSubmissionTypeOption: (arg: { label: string }) => any;
export const fillBatchDetails: (arg: { batchName: string; briefCode?: string }) => any;
export const submitBatchCreation: () => any;
export const readUploadState: (arg: { names?: string[] }) => {
  namesSeen: string[]; missing: string[]; contributions: string[]; fileCount: number;
  /** Cards Getty rendered a picture for: the only ones whose drawer can be filled. */
  withThumbnail: string[]; withoutThumbnail: string[];
  processing: boolean; ready: boolean; [key: string]: unknown;
};
export const labelTextOf: (el: any) => string;
export const fillMetadataFields: (arg: { title?: string; description?: string; keywords?: string[]; dateCreated?: string; overwrite?: boolean }) => {
  filled: Record<string, boolean>; present: Record<string, boolean>;
  keywordsBefore: number; keywordsAfter: number;
  /** The drawer's own values after typing — a run can prove the date took. */
  values: { title: string | null; description: string | null; keywords: string | null; dateCreated: string | null };
};
export const openFileMetadata: (arg: { fileName: string }) => any;
/** True once the clicked card's drawer accepts input; disabled fields drop typed text. */
export const metadataEditorReady: () => {
  ready: boolean; present: boolean;
  /** Nothing but Getty's loading skeletons: the page must be reloaded, not waited out. */
  skeleton: boolean;
};
/** Clicks the drawer's captured `[data-cy="save-metadata"]` control (label "Save metadata"). */
export const saveMetadataEditor: () => { saved: boolean; label: string | null };
/**
 * Ticks every uploaded contribution: Getty's own select-all control when the grid
 * has one, else a Ctrl-click on each card. `method` says which gesture was used.
 */
export const selectAllContributions: () => { selected: number; method: string };
export const closeMetadataEditor: () => any;
export const dismissPageDialogs: () => any;
export const completionState: () => { present: boolean; enabled: boolean; label: string | null };
export const completeBatch: () => any;
export const confirmCompletion: () => any;
export const readCompletionState: () => any;
