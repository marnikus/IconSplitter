import { expect, it } from 'vitest';
import { planStages, type PlanInput } from '../src/lib/upload/export';
import { runExport } from '../src/upload/runexport';
import { stockExportArgs, STOCK_TEST_SVGS } from './helpers/stockexport';

it('plans record-only detachments, metadata-only edits and missing-file repairs for every enabled subset', async()=>{
  const {args}=stockExportArgs(STOCK_TEST_SVGS[0]);
  const committed=await runExport(args);expect(committed.status).toBe('processed');
  const record=committed.record!;
  const input:PlanInput={sourceHash:record.source.fingerprint,settingsFp:record.settings.fingerprint,
    metadataFp:record.metadata!.fingerprint,hasMetadata:true,optimize:false,includeEps:true,epsConverter:'builtin',
    outputs:{svg:true,jpg:true,eps:true},metadataOutputs:{svg:true,jpg:true,eps:true}};
  for(let mask=1;mask<8;mask++) {
    const selected={includeSvg:!!(mask&1),includeJpeg:!!(mask&2),includeEps:!!(mask&4)};
    const rebuild={svg:selected.includeSvg,jpg:selected.includeJpeg,eps:selected.includeEps};
    const detached=planStages(record,{...input,...selected});
    expect(detached.rebuild).toEqual({svg:false,jpg:false,eps:false});
    expect(detached.stages).toEqual(mask===7?[]:['validate','commit']);
    const edited=planStages(record,{...input,...selected,metadataFp:'changed'});
    expect(edited.rebuild).toEqual(rebuild);expect(edited.stages).not.toContain('render');
    const repaired=planStages(record,{...input,...selected,outputs:{svg:false,jpg:false,eps:false}});
    expect(repaired.rebuild).toEqual(rebuild);expect(repaired.stages.includes('render')).toBe(selected.includeJpeg);
  }
  expect(planStages(record,{...input,includeSvg:false,includeJpeg:false,includeEps:false})).toEqual({stages:[],rebuild:{svg:false,jpg:false,eps:false}});
  record.tools.svgo.enabled=true;
  expect(planStages(record,{...input,includeSvg:false,includeJpeg:false}).stages).not.toContain('optimize');
});
