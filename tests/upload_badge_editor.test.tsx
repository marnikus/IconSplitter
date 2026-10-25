import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import UploadSettingsDialog, { type UploadSettingsDialogProps } from "../src/upload/UploadSettingsDialog";
import { DEFAULT_UPLOAD_SETTINGS } from "../src/lib/upload/settings";
import { DEFAULT_BADGE_TEMPLATE, validateBadgeTemplate } from "../src/lib/upload/badgetemplate";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const CUSTOM = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 30"><rect width="60" height="30" fill="red"/></svg>';
let host: HTMLDivElement, ui: Root, props: UploadSettingsDialogProps;
const el = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement;
const click = async (id: string) => {
  const element = el(id);
  const folded = element.closest("details:not([open])");
  if (folded) await act(async () => { (folded.querySelector("summary") as HTMLElement).click(); });
  await act(async () => element.click());
};
const code = () => el('upload-badge-template-code') as HTMLTextAreaElement;
async function type(value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(code(), value);
    code().dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function mount(patch: Partial<UploadSettingsDialogProps> = {}) {
  props = { scope: null, id: null, defaults: DEFAULT_UPLOAD_SETTINGS, overrides: {}, applied: {},
    selectedShadow: { state: 'none', width: null, gap: null }, selectedCount: 0,
    onSelectedShadowToggle: vi.fn(), onSelectedShadowDimensions: vi.fn(),
    selectedBadge: { state: 'none' }, onSelectedBadgeToggle: vi.fn(),
    selectedSizeGuide: { state: 'none' }, onSelectedSizeGuideToggle: vi.fn(),
    onDefaults: vi.fn(), onOverride: vi.fn(), onResetOverride: vi.fn(), onClose: vi.fn(), ...patch };
  await act(async () => ui.render(<UploadSettingsDialog {...props} />));
}
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); ui = createRoot(host); });
afterEach(async () => { await act(async () => ui.unmount()); host.remove(); });

it('opens with the current source and isolated preview, lets the draft preview change, then applies only the template', async () => {
  await mount();
  await click('upload-badge-template-edit');
  expect(code().value).toBe(DEFAULT_BADGE_TEMPLATE);
  expect(document.activeElement).toBe(code());
  await type(CUSTOM);
  const image = el('upload-badge-template-preview') as HTMLImageElement;
  expect(image.tagName).toBe('IMG');
  expect(decodeURIComponent(image.getAttribute('src')!)).toContain('fill="red"');
  expect(props.onDefaults).not.toHaveBeenCalled();
  expect(el('upload-badge-template-apply').hasAttribute('disabled')).toBe(false);
  await click('upload-badge-template-apply');
  const valid = validateBadgeTemplate(CUSTOM);
  if (!valid.ok) throw new Error(valid.detail);
  expect(props.onDefaults).toHaveBeenCalledExactlyOnceWith({ badgeTemplateSvg: valid.svg });
  expect(props.onSelectedBadgeToggle).not.toHaveBeenCalled();
  expect(props.onOverride).not.toHaveBeenCalled();
  expect(el('upload-badge-template-dialog')).toBeNull();
  expect(document.getElementById('upload-dialog-title')).not.toBeNull();
});

it('keeps invalid or unsafe code out of the preview and disables Apply without changing stored settings', async () => {
  await mount();
  await click('upload-badge-template-edit');
  for (const invalid of ['', '<svg', CUSTOM.replace('</svg>', '<script>alert(1)</script></svg>'), CUSTOM.replace('fill="red"', 'onload="alert(1)"')]) {
    await type(invalid);
    expect(el('upload-badge-template-error').textContent!.length).toBeGreaterThan(5);
    expect(el('upload-badge-template-apply').hasAttribute('disabled')).toBe(true);
    expect(el('upload-badge-template-preview')).toBeNull();
    expect(document.querySelector('script')).toBeNull();
  }
  expect(props.onDefaults).not.toHaveBeenCalled();
  await click('upload-badge-template-cancel');
  expect(el('upload-badge-template-dialog')).toBeNull();
});

it('Cancel, Escape and backdrop discard drafts without closing the parent, then reopen the current effective template', async () => {
  await mount({ id: 'one', scope: 'one.svg', overrides: { badgeTemplateSvg: CUSTOM, paddingPct: 12 } });
  for (const action of ['cancel', 'escape', 'backdrop']) {
    await click('upload-badge-template-edit');
    expect(code().value).toBe(CUSTOM);
    await type('<svg broken');
    if (action === 'escape') await act(async () => code().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    else await click(`upload-badge-template-${action}`);
    expect(el('upload-badge-template-dialog')).toBeNull();
    expect(props.onClose).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(el('upload-badge-template-edit'));
  }
  expect(props.onOverride).not.toHaveBeenCalled();
});

it('restores the bundled draft explicitly and applies an empty template pin only to this icon', async () => {
  await mount({ id: 'one', scope: 'one.svg', overrides: { badgeTemplateSvg: CUSTOM, paddingPct: 12 } });
  await click('upload-badge-template-edit'); // editable while badge itself is off
  await click('upload-badge-template-default');
  expect(code().value).toBe(DEFAULT_BADGE_TEMPLATE);
  expect(props.onOverride).not.toHaveBeenCalled();
  await click('upload-badge-template-apply');
  expect(props.onOverride).toHaveBeenCalledExactlyOnceWith('one', { badgeTemplateSvg: '', paddingPct: 12 });
  expect(props.onDefaults).not.toHaveBeenCalled();
  expect(props.onSelectedBadgeToggle).not.toHaveBeenCalled();
});

it('traps Tab focus within the editor while its parent settings dialog is inert', async () => {
  await mount();
  el('upload-badge-template-edit').focus();
  await click('upload-badge-template-edit');
  const parent = host.querySelector('[role="dialog"]') as HTMLElement;
  expect(parent.inert).toBe(true);
  el('upload-badge-template-apply').focus();
  await act(async () => el('upload-badge-template-apply').dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })));
  expect(document.activeElement).toBe(code());
  await act(async () => code().dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })));
  expect(document.activeElement).toBe(el('upload-badge-template-apply'));
  await click('upload-badge-template-cancel');
  expect(parent.inert).toBe(false);
});
