import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readBytesAt, readTextAt } from '../src/lib/fs';
import { DEFAULT_UPLOAD_SETTINGS, normalizeSettings, parseOverrides, settingsFingerprint, SETTINGS_FIELDS } from '../src/lib/upload/settings';
import { runExport } from '../src/upload/runexport';
import { planDownload } from '../src/lib/upload/download';
import { readEmbeddedMetadata } from '../src/lib/upload/embed';
import { verifyEpsDocument } from '../src/lib/upload/eps';
import { verifyEpsMetadata } from '../src/lib/upload/epsmetadata';
import { verifyJpeg } from '../src/lib/upload/jpeg';
import { stockExportArgs, STOCK_TEST_META, STOCK_TEST_SVGS } from './helpers/stockexport';

it('defaults SVG/JPEG on, validates explicit false and retains the historical default fingerprint', () => {
  expect(DEFAULT_UPLOAD_SETTINGS).toMatchObject({includeSvg:true,includeJpeg:true,includeEps:false});
  expect(normalizeSettings({includeSvg:'no',includeJpeg:0})).toMatchObject({includeSvg:true,includeJpeg:true});
  expect(normalizeSettings({includeSvg:false,includeJpeg:false})).toMatchObject({includeSvg:false,includeJpeg:false});
  expect(parseOverrides({includeSvg:false,includeJpeg:true})).toEqual({includeSvg:false,includeJpeg:true});
  expect(parseOverrides({includeSvg:0,includeJpeg:'yes'})).toEqual({});
  expect(SETTINGS_FIELDS).toEqual(expect.arrayContaining(['includeSvg','includeJpeg']));
  expect(settingsFingerprint(DEFAULT_UPLOAD_SETTINGS)).toBe('36232c04');
  expect(settingsFingerprint({...DEFAULT_UPLOAD_SETTINGS,includeSvg:false})).not.toBe('36232c04');
  expect(settingsFingerprint({...DEFAULT_UPLOAD_SETTINGS,includeJpeg:false})).not.toBe('36232c04');
});

const combinations = [1,2,3,4,5,6,7].map(mask=>({includeSvg:!!(mask&1),includeJpeg:!!(mask&2),includeEps:!!(mask&4)}));
describe.each(combinations)('requested output set $includeSvg/$includeJpeg/$includeEps', formats => {
  it('commits only enabled files with metadata, skips disabled raster, and has a true no-op repeat', async () => {
    const {args,root,renders}=stockExportArgs(STOCK_TEST_SVGS[0]);
    args.settings={...args.settings,...formats};args.defaults=args.settings;
    const result=await runExport(args);
    expect(result.status,result.error?.detail).toBe('processed');
    const expected={svg:formats.includeSvg,jpg:formats.includeJpeg,eps:formats.includeEps};
    for(const ext of ['svg','jpg','eps'] as const) {
      expect(result.record?.outputs[ext]!==null,ext).toBe(expected[ext]);
      expect(await readBytesAt(root,`export/temporary.${ext}`)!==null,ext).toBe(expected[ext]);
    }
    expect(renders.count).toBe(formats.includeJpeg?1:0);
    if(formats.includeSvg) expect(readEmbeddedMetadata((await readTextAt(root,'export/temporary.svg'))!)).toMatchObject(STOCK_TEST_META);
    if(formats.includeJpeg) expect(verifyJpeg((await readBytesAt(root,'export/temporary.jpg'))!,{width:100,height:100,metadata:STOCK_TEST_META}).ok).toBe(true);
    if(formats.includeEps) {
      const eps=(await readTextAt(root,'export/temporary.eps'))!;
      expect(verifyEpsDocument(eps).ok).toBe(true);expect(verifyEpsMetadata(eps,STOCK_TEST_META)).toBe(true);
    }
    const download=planDownload([{id:'temporary',base:'temporary',record:result.record}]);
    expect(download.items.map(f=>f.to).sort()).toEqual(Object.entries(expected).filter(([,on])=>on).map(([ext])=>`temporary.${ext}`).sort());
    const repeated=await runExport({...args,record:result.record});
    expect(repeated.status).toBe('processed');expect(repeated.stages).toEqual([]);
    expect(renders.count).toBe(formats.includeJpeg?1:0);
  });
});

it('rejects all-off without creating any folder or replacing a previous package', async () => {
  const {args,root,renders}=stockExportArgs(STOCK_TEST_SVGS[0]);
  args.settings={...args.settings,includeSvg:false,includeJpeg:false,includeEps:false};
  const failed=await runExport(args);
  expect(failed.status).toBe('failed');expect(failed.error?.detail).toMatch(/format/i);
  expect(root.children.has('export')).toBe(false);expect(renders.count).toBe(0);
});

it('detaches old disabled files without deleting their bytes and re-enables them correctly', async () => {
  const {args,root,renders}=stockExportArgs(STOCK_TEST_SVGS[0]);
  const all=await runExport(args);expect(all.status).toBe('processed');
  const svgBefore=await readTextAt(root,'export/temporary.svg'),jpgBefore=await readBytesAt(root,'export/temporary.jpg');
  args.settings={...args.settings,includeSvg:false,includeJpeg:false};
  const onlyEps=await runExport({...args,record:all.record});
  expect(onlyEps.status).toBe('processed');expect(onlyEps.record?.outputs).toMatchObject({svg:null,jpg:null});
  expect(await readTextAt(root,'export/temporary.svg')).toBe(svgBefore);
  expect(await readBytesAt(root,'export/temporary.jpg')).toEqual(jpgBefore);expect(renders.count).toBe(1);
  expect(planDownload([{id:'one',base:'one',record:onlyEps.record}]).items.map(i=>i.to)).toEqual(['temporary.eps']);
  const previousJson=await readTextAt(root,'export/export.json');
  const disabled=await runExport({...args,record:onlyEps.record,settings:{...args.settings,includeEps:false}});
  expect(disabled.status).toBe('failed');expect(await readTextAt(root,'export/export.json')).toBe(previousJson);
  args.settings={...args.settings,includeSvg:true,includeJpeg:true};
  const enabled=await runExport({...args,record:onlyEps.record});
  expect(enabled.status).toBe('processed');expect(enabled.record?.outputs.svg).not.toBeNull();expect(enabled.record?.outputs.jpg).not.toBeNull();
  expect(renders.count).toBe(2);
});

it('reports EPS-only converter failure as failed and never commits a falsely complete empty package', async () => {
  const {args,root,renders}=stockExportArgs('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g opacity="0.4"><rect x="10" y="10" width="70" height="70"/><circle cx="40" cy="40" r="25"/></g></svg>');
  args.settings={...args.settings,includeSvg:false,includeJpeg:false};
  const result=await runExport(args);
  expect(result.status).toBe('failed');expect(result.error?.klass).toBe('eps');
  expect(root.children.has('export')).toBe(false);expect(renders.count).toBe(0);
});

it('exports the actual supplied SVG as EPS-only without a JPEG renderer or an SVG output file', async () => {
  const svg=readFileSync('tests/assets/SVG to JPEG or EPS export tests/icon-handshake-heart_7_03_v2.svg','utf8');
  const {args,root,renders}=stockExportArgs(svg);
  args.settings={...args.settings,includeSvg:false,includeJpeg:false};
  const result=await runExport(args);expect(result.status,result.error?.detail).toBe('processed');
  expect(verifyEpsDocument((await readTextAt(root,'export/temporary.eps'))!).ok).toBe(true);
  expect(await readBytesAt(root,'export/temporary.svg')).toBeNull();expect(renders.count).toBe(0);
});

it.each(combinations.filter(f=>Number(f.includeSvg)+Number(f.includeJpeg)+Number(f.includeEps)===1))('updates metadata with only the selected format: %o', async formats=>{
  const {args,root,renders}=stockExportArgs(STOCK_TEST_SVGS[0]);
  args.settings={...args.settings,...formats};
  const first=await runExport(args);expect(first.status).toBe('processed');
  const metadata={...STOCK_TEST_META,title:'New accepted title'};
  const second=await runExport({...args,record:first.record,metadata});
  expect(second.status,second.error?.detail).toBe('processed');expect(second.stages).not.toContain('render');
  expect(renders.count).toBe(formats.includeJpeg?1:0);
  if(formats.includeSvg) expect(readEmbeddedMetadata((await readTextAt(root,'export/temporary.svg'))!)).toMatchObject(metadata);
  if(formats.includeJpeg) expect(verifyJpeg((await readBytesAt(root,'export/temporary.jpg'))!,{width:100,height:100,metadata}).ok).toBe(true);
  if(formats.includeEps) expect(verifyEpsMetadata((await readTextAt(root,'export/temporary.eps'))!,metadata)).toBe(true);
  expect(await readTextAt(root,args.row.svgPath)).toBe(STOCK_TEST_SVGS[0]);
});
