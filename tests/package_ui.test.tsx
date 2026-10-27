import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import PackageList, { PackageListHead, PackageListFooter } from "../src/ui/PackageList";
import PackageRow from "../src/ui/PackageRow";
import ProviderCardShell from "../src/ui/ProviderCardShell";
import SvgModal, { ModalHeader } from "../src/ui/SvgModal";
import { ToggleField } from "../src/ui/fields";
import { copyMetadataField } from "../src/upload/metacopy";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement, ui: Root;
beforeEach(() => { host = document.createElement("div"); document.body.appendChild(host); ui = createRoot(host); });
afterEach(() => { act(() => ui.unmount()); host.remove(); vi.unstubAllGlobals(); });
const mount = async (element: ReactNode) => { await act(async () => ui.render(element)); };
const click = async (element: Element) => { await act(async () => element.dispatchEvent(new MouseEvent("click", { bubbles: true }))); };
it("owns the original package table grammar, seven columns, empty state and footer", async () => {
  await mount(<PackageList testid="list" label="Packages" empty emptyText="No packages"
    header={<PackageListHead title="PACKAGES" count={0} scope="one per folder" />} footer={<PackageListFooter summary="0 shown" hint="Q/E" />}>
    {null}
  </PackageList>);
  expect(host.querySelector('.svg-panel > .svg-head > .svg-title h1')?.textContent).toBe("PACKAGES");
  expect(host.querySelector('.pair-table > .up-columns')?.children).toHaveLength(7);
  expect(host.querySelector('.svg-rows[role=listbox] .svg-empty')?.textContent).toBe("No packages");
  expect(host.querySelector('.svg-list-footer .svg-hints')?.textContent).toBe("Q/E");
});
it("shares modifiers, keyboard activation and disabled/native-control isolation", async () => {
  const select = vi.fn(), toggle = vi.fn();
  const row = (disabled = false) => <PackageRow testid="row" name="Export" onSelect={select} onToggle={toggle} disabled={disabled} detail={<span>Editor</span>}><span>Artwork</span><button>Location</button></PackageRow>;
  await mount(row());
  const node = host.querySelector('[role=listitem]')!;
  await act(async () => node.dispatchEvent(new MouseEvent("click", { ctrlKey: true, bubbles: true })));
  expect(select).toHaveBeenLastCalledWith("toggle");
  await act(async () => node.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true })));
  expect(select).toHaveBeenLastCalledWith("replace");
  select.mockClear(); await click(node.querySelector('button')!); await click(node.querySelector('input')!);
  expect(select).not.toHaveBeenCalled(); expect(toggle).toHaveBeenCalledOnce();
  await mount(row(true)); await click(node);
  await act(async () => node.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })));
  expect(select).not.toHaveBeenCalled(); expect(host.querySelector('.up-detail')?.textContent).toBe("Editor");
});
it("uses the existing controlled minimize/restore card for both providers and accounts", async () => {
  const onOpen = vi.fn();
  const card = (open: boolean) => <ProviderCardShell open={open} onOpen={onOpen} title={<strong>Provider</strong>}><input aria-label="Local field" /></ProviderCardShell>;
  await mount(card(false)); expect(host.querySelector('input')).toBeNull();
  await click(host.querySelector('button')!); expect(onOpen).toHaveBeenCalledWith(true);
  await mount(card(true)); expect(host.querySelector('input')).not.toBeNull();
  expect(host.querySelector('.svg-provider-top button')?.getAttribute('aria-expanded')).toBe("true");
  await click(host.querySelector('button')!); expect(onOpen).toHaveBeenCalledWith(false);
});
it("uses one modal wrapper and header, preserving inner-click and backdrop behavior", async () => {
  const cancel = vi.fn();
  await mount(<SvgModal titleId="title" onDismiss={cancel} header={<ModalHeader titleId="title" title="Confirm" onDismiss={cancel} />}><p>Disclosure</p></SvgModal>);
  expect(host.querySelector('.svg-modal[aria-labelledby=title] h2')?.textContent).toBe("Confirm");
  await click(host.querySelector('.svg-modal-body p')!); expect(cancel).not.toHaveBeenCalled();
  await click(host.querySelector('.svg-modal-head button')!); expect(cancel).toHaveBeenCalledOnce();
  await click(host.querySelector('.svg-backdrop')!); expect(cancel).toHaveBeenCalledTimes(2);
});
it("renders the identical export-settings toggle field, hint and inherited marker", async () => {
  const onChange = vi.fn();
  await mount(<ToggleField label="EPS" checked={false} onChange={onChange} marker={<em>inherited</em>} hint="Vector only" />);
  expect(host.querySelector('.svg-field.up-set-field .svg-label')?.textContent).toBe("EPSinherited");
  expect(host.querySelector('.up-hint')?.textContent).toBe("Vector only");
  await click(host.querySelector('input')!); expect(onChange).toHaveBeenCalledWith(true);
});
it("shares metadata copy formatting and handles denied or absent browser clipboard APIs", async () => {
  const writeText = vi.fn(async () => undefined), say = vi.fn();
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  const meta = { title: "Title", description: "Description", tags: ["icon", "vector"] };
  for (const field of ["title", "description", "tags"] as const) await copyMetadataField(meta, field, say);
  expect(writeText.mock.calls).toEqual([["Title"], ["Description"], ["icon, vector"]]);
  expect(say.mock.calls).toEqual([["Title copied"], ["Description copied"], ["Tags copied"]]);
  writeText.mockRejectedValueOnce(new Error("Denied")); await copyMetadataField(meta, "title", say);
  expect(say).toHaveBeenLastCalledWith("The clipboard is blocked — select the text and copy it by hand", true);
  vi.stubGlobal("navigator", {}); await copyMetadataField(meta, "title", say);
  expect(say).toHaveBeenLastCalledWith("The clipboard is blocked — select the text and copy it by hand", true);
});
