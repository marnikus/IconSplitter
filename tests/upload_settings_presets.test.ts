import { afterEach, expect, it, vi } from 'vitest';
import { createExportPreset, renameExportPreset, removeExportPreset, parseExportPresets, EXPORT_PRESET_LIMIT } from '../src/lib/upload/settingspresets';
import { DEFAULT_UPLOAD_SETTINGS } from '../src/lib/upload/settings';
import { loadExportPresets, saveExportPresets, EXPORT_PRESETS_KEY } from '../src/upload/settingspresetstore';

afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();localStorage.clear();});
const settings={...DEFAULT_UPLOAD_SETTINGS,includeSvg:false,includeJpeg:true,paddingPct:{left:2,right:3,top:4,bottom:5},artboard:{mode:'custom' as const,size:512,width:512,height:256}};

it('saves named independent normalized snapshots, including false flags and nested geometry',()=>{
  const added=createExportPreset([], '  Shop JPEG  ',settings);
  expect(added.error).toBeNull();expect(added.selected).toBe('Shop JPEG');
  expect(added.presets[0]).toEqual({name:'Shop JPEG',settings});
  expect(added.presets[0].settings.artboard).not.toBe(settings.artboard);
  expect(added.presets[0].settings.paddingPct).not.toBe(settings.paddingPct);
  const renamed=renameExportPreset(added.presets,'Shop JPEG','  Storefront  ');
  expect(renamed.error).toBeNull();expect(renamed.presets[0].name).toBe('Storefront');
  expect(renamed.presets[0].settings).toEqual(settings);expect(added.presets[0].name).toBe('Shop JPEG');
  expect(removeExportPreset(renamed.presets,'Storefront')).toMatchObject({presets:[],selected:'',error:null});
});

it('rejects invalid, duplicate and stale catalog edits without changing existing presets',()=>{
  const presets=createExportPreset([],'One',settings).presets;
  for(const name of ['', '   ', 'x'.repeat(61),'ONE']) {
    const change=createExportPreset(presets,name,settings);
    expect(change.error).toBeTruthy();expect(change.presets).toEqual(presets);
  }
  const two=createExportPreset(presets,'Two',DEFAULT_UPLOAD_SETTINGS).presets;
  expect(renameExportPreset(two,'One','two').error).toBeTruthy();
  expect(renameExportPreset(two,'One',' ').error).toBeTruthy();
  expect(renameExportPreset(two,'missing','Other').error).toBeTruthy();
  expect(removeExportPreset(two,'missing').error).toBeTruthy();
  expect(renameExportPreset(two,'One','one').presets[0].name).toBe('one');
  const full=Array.from({length:EXPORT_PRESET_LIMIT},(_,i)=>({name:`Preset ${i}`,settings}));
  expect(createExportPreset(full,'Another',settings).error).toBeTruthy();
});

it('validates persisted envelopes/entries, deduplicates names, clamps values and preserves legacy defaults',()=>{
  for(const raw of [null,{}, {v:2,presets:[]},{v:1,presets:'bad'}]) expect(parseExportPresets(raw)).toEqual([]);
  const parsed=parseExportPresets({v:1,presets:[null,{}, {name:'',settings:{}},{name:'x',settings:null},
    {name:' Legacy ',settings:{jpegQuality:9,includeEps:true,shadowEnabled:true}},
    {name:'LEGACY',settings:{includeJpeg:false,includeSvg:false}}, {name:3,settings:{}},{name:'x'.repeat(61),settings:{}}]});
  expect(parsed).toHaveLength(1);expect(parsed[0].name).toBe('LEGACY');
  expect(parsed[0].settings).toMatchObject({includeSvg:false,includeJpeg:false,shadowEnabled:false});
  expect(parseExportPresets({v:1,presets:[{name:'Old',settings:{jpegQuality:9,includeEps:true,shadowEnabled:true}}]})[0].settings)
    .toMatchObject({includeSvg:true,includeJpeg:true,includeEps:true,jpegQuality:1,shadowEnabled:false});
  expect(parseExportPresets({v:1,presets:Array.from({length:60},(_,i)=>({name:`p${i}`,settings:{}}))})).toHaveLength(EXPORT_PRESET_LIMIT);
});

it('persists across reads, rejects corruption, normalizes unknown fields and reports quota/read failures',()=>{
  expect(loadExportPresets()).toEqual([]);
  expect(parseExportPresets({v:1,presets:[{name:'Unknowns',settings:{unrecognized:'discard',includeJpeg:false}}]})[0].settings).not.toHaveProperty('unrecognized');
  localStorage.setItem(EXPORT_PRESETS_KEY,'{broken');expect(loadExportPresets()).toEqual([]);
  const presets=createExportPreset([],'Saved',settings).presets;
  expect(saveExportPresets(presets)).toBe(true);expect(loadExportPresets()).toEqual(presets);
  const storage=localStorage;
  vi.stubGlobal('localStorage',{getItem:(key:string)=>storage.getItem(key),setItem:()=>{throw new Error('quota');}});
  expect(saveExportPresets([])).toBe(false);expect(loadExportPresets()).toEqual(presets);
  vi.unstubAllGlobals();vi.stubGlobal('localStorage',{getItem:()=>{throw new Error('blocked');},setItem:()=>{throw new Error('blocked');}});
  expect(loadExportPresets()).toEqual([]);expect(saveExportPresets(presets)).toBe(false);
});
