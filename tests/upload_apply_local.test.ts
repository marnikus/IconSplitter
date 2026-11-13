import { expect, it, vi } from 'vitest';
import { DEFAULT_UPLOAD_SETTINGS, SETTINGS_FIELDS, parseOverrides } from '../src/lib/upload/settings';
import { parseUploadSettingsState } from '../src/upload/settingsstore';
import { toUploadSettingsPatch } from '../src/upload/uploadundo';

import { localSettingsSnapshot } from '../src/lib/upload/settingslocal';
import { commitLocalBatch } from '../src/upload/selectedsettings';
import type { UploadCtx } from '../src/upload/actions';
import { rowSettings } from '../src/lib/upload/decorations';
import { prepareExportSvg } from '../src/lib/upload/prepare';
import { AS_IS_SETTINGS } from '../src/lib/upload/asis';

it('retains an explicit content-fit pin on persistence AND history validation', () => {
  const artboard = {mode:'content',size:512,width:512,height:512} as const;
  expect(parseOverrides({artboard})).toEqual({artboard});
  const overrides = {one:{...DEFAULT_UPLOAD_SETTINGS,artboard,paddingPct:null}};
  expect(parseUploadSettingsState({v:2,defaults:DEFAULT_UPLOAD_SETTINGS,overrides}).overrides).toEqual(overrides);
  expect(toUploadSettingsPatch({overrides})).toEqual({overrides});
});



it('copies every general field, freezes current decorations and detaches nested values', () => {
  const defaults = {...DEFAULT_UPLOAD_SETTINGS,paddingPct:{left:4,right:8,top:12,bottom:16},
    artboard:{mode:'custom' as const,size:512,width:730,height:400},includeEps:false,jpegMatchArtboard:false};
  const current = {...defaults,strokePx:42,shadowEnabled:true,shadowGapPct:19,badgeEnabled:true,sizeGuideEnabled:true};
  const frozen = localSettingsSnapshot(defaults,current);
  expect(Object.keys(frozen).sort()).toEqual([...SETTINGS_FIELDS].sort());
  expect(frozen).toMatchObject({strokePx:0,shadowEnabled:true,shadowGapPct:19,badgeEnabled:true,
    sizeGuideEnabled:true,includeEps:false,jpegMatchArtboard:false});
  expect(frozen.artboard).toEqual(defaults.artboard);expect(frozen.artboard).not.toBe(defaults.artboard);
  expect(frozen.paddingPct).toEqual(defaults.paddingPct);expect(frozen.paddingPct).not.toBe(defaults.paddingPct);
  defaults.artboard.width=999;defaults.paddingPct.left=40;
  expect(frozen.artboard?.width).toBe(730);expect(frozen.paddingPct).toMatchObject({left:4});
});

it('only writes unique checked loaded ids and records exactly their original overrides', () => {
  const dispatch=vi.fn(),push=vi.fn();
  const c = {m:{defaults:DEFAULT_UPLOAD_SETTINGS,overrides:{a:{strokePx:33}},applied:{}},
    rows:['a','b'].map(id=>({source:{id}})),checked:['a','stale'],dispatch,hist:{push},say:vi.fn()} as unknown as UploadCtx;
  expect(commitLocalBatch(c,['a','a','b','stale','unknown'])).toBe(1);
  expect(dispatch).toHaveBeenCalledTimes(1);expect(push).toHaveBeenCalledTimes(1);
  expect(push.mock.calls[0][0]).toMatchObject({type:'uploadSettings',ids:['a'],before:{overrides:{a:{strokePx:33}}}});
  expect(Object.keys(dispatch.mock.calls[0][0].overrides)).toEqual(['a']);
  expect(dispatch.mock.calls[0][0].applied).toEqual({});
});

it('does nothing for empty, stale, unchecked or already fully pinned batches', () => {
  const defaults=DEFAULT_UPLOAD_SETTINGS,dispatch=vi.fn(),push=vi.fn();
  const c = {m:{defaults,overrides:{a:localSettingsSnapshot(defaults,defaults)},applied:{}},
    rows:[{source:{id:'a'}}],checked:['a','stale'],dispatch,hist:{push},say:vi.fn()} as unknown as UploadCtx;
  for(const ids of [[],['stale'],['unchecked'],['a','a']]) expect(commitLocalBatch(c,ids)).toBe(0);
  expect(dispatch).not.toHaveBeenCalled();expect(push).not.toHaveBeenCalled();
});


it('drives real prepared SVG geometry from frozen batch settings, not later globals', () => {
  const source='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20v20H2z"/></svg>';
  const first={...DEFAULT_UPLOAD_SETTINGS,artboard:{mode:'preset' as const,size:512,width:512,height:512}};
  const second={...first,artboard:{...first.artboard,size:1024}};
  const latest={...first,artboard:{...first.artboard,size:2048}};
  const overrides={a:localSettingsSnapshot(first,first),b:localSettingsSnapshot(second,second)};
  for (const [id,size] of [['a',512],['b',1024],['inherited',2048]] as const) {
    const result=prepareExportSvg(source,rowSettings(latest,id,overrides,{}));
    expect(result.ok).toBe(true);if(!result.ok)throw new Error(result.detail);
    expect(result.fit.viewBox).toBe(`0 0 ${size} ${size}`);
  }
  const asIs={...DEFAULT_UPLOAD_SETTINGS,...AS_IS_SETTINGS};
  const frozen=localSettingsSnapshot(asIs,asIs);
  expect(prepareExportSvg(source,rowSettings(latest,'as-is',{'as-is':frozen},{})))
    .toMatchObject({ok:true,asIs:true,svg:source});
});
