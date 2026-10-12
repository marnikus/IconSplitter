import { readFileSync } from "fs";
import { PNG } from "pngjs";

function median(arr) {
  const s = [...arr].sort((a,b)=>a-b);
  return s[Math.floor(s.length/2)] ?? 255;
}

function analyzeFromPixels(data, w, h, nw, nh) {
  // data is Uint8Array or Buffer RGBA
  const rs=[], gs=[], bs=[];
  const push = (x,y) => {
    const i = (y*w+x)*4;
    const a = data[i+3]/255;
    rs.push(data[i]*a + 255*(1-a));
    gs.push(data[i+1]*a + 255*(1-a));
    bs.push(data[i+2]*a + 255*(1-a));
  };
  const sx = Math.max(1, Math.floor(w/600));
  const sy = Math.max(1, Math.floor(h/600));
  for (let x=0;x<w;x+=sx){ push(x,0); push(x,h-1); }
  for (let y=0;y<h;y+=sy){ push(0,y); push(w-1,y); }
  const bg = [median(rs), median(gs), median(bs)];
  const diff = new Uint8Array(w*h);
  const hist = new Uint32Array(256);
  for (let p=0,i=0;p<w*h;p++,i+=4){
    const a = data[i+3]/255;
    const r = data[i]*a + 255*(1-a);
    const g = data[i+1]*a + 255*(1-a);
    const b = data[i+2]*a + 255*(1-a);
    const d = Math.max(Math.abs(r-bg[0]), Math.abs(g-bg[1]), Math.abs(b-bg[2]));
    const v = d>255?255:d|0;
    diff[p]=v;
    hist[v]++;
  }
  let acc=0, maxDiff=0;
  const need = w*h*0.001;
  for (let v=255;v>=0;v--){ acc+=hist[v]; if(acc>=need){ maxDiff=v; break; } }
  maxDiff=Math.max(maxDiff,30);
  const thr = Math.min(110, Math.max(18, maxDiff*0.42));
  const mask = new Uint8Array(w*h);
  for (let p=0;p<w*h;p++) if(diff[p]>thr) mask[p]=1;
  return { w,h, scale: nw/w, mask, bg, inkDiff: maxDiff, threshold: thr };
}

// import detect logic (copy from src/lib/detect.ts but simplified)
function dilateH(src, tmp, gw, gh, r){
  const pre = new Int32Array(gw+1);
  for(let y=0;y<gh;y++){
    const row=y*gw;
    pre[0]=0;
    for(let x=0;x<gw;x++) pre[x+1]=pre[x]+src[row+x];
    for(let x=0;x<gw;x++){ const a=Math.max(0,x-r), b=Math.min(gw,x+r+1); tmp[row+x]=pre[b]-pre[a]>0?1:0; }
  }
}
function dilateV(tmp,out,gw,gh,r){
  const pre=new Int32Array(gh+1);
  for(let x=0;x<gw;x++){
    pre[0]=0;
    for(let y=0;y<gh;y++) pre[y+1]=pre[y]+tmp[y*gw+x];
    for(let y=0;y<gh;y++){ const a=Math.max(0,y-r), b=Math.min(gh,y+r+1); out[y*gw+x]=pre[b]-pre[a]>0?1:0; }
  }
}
function dilate(src,gw,gh,r){
  if(r<=0) return src.slice();
  const tmp=new Uint8Array(gw*gh), out=new Uint8Array(gw*gh);
  dilateH(src,tmp,gw,gh,r);
  dilateV(tmp,out,gw,gh,r);
  return out;
}
function floodFill(s,id,ctx){
  const {dil,cells,counts,labels,gw,gh,stack}=ctx;
  let ink=0;
  labels[s]=id; stack.push(s);
  while(stack.length){
    const p=stack.pop();
    if(cells[p]) ink+=counts[p];
    const px=p%gw, py=(p/gw)|0;
    for(let dy=-1;dy<=1;dy++){ const ny=py+dy; if(ny<0||ny>=gh) continue;
      for(let dx=-1;dx<=1;dx++){ const nx=px+dx; if(nx<0||nx>=gw) continue;
        const q=ny*gw+nx;
        if(ctx.dil[q] && ctx.labels[q]===-1){ ctx.labels[q]=id; ctx.stack.push(q); }
      }
    }
  }
  return ink;
}
function label(dil,cells,counts,gw,gh){
  const labels=new Int32Array(gw*gh).fill(-1);
  const inks=[], stack=[];
  const ctx={dil,cells,counts,labels,gw,gh,stack};
  let n=0;
  for(let s=0;s<gw*gh;s++){ if(!dil[s]||labels[s]!==-1) continue; inks.push(floodFill(s,n,ctx)); n++; }
  const maxInk=Math.max(0,...inks);
  const valid=inks.map(v=>v>=maxInk*0.015 && v>0);
  return {labels,valid,count:valid.filter(Boolean).length};
}
function downsample(mask,w,h,f){
  const gw=Math.ceil(w/f), gh=Math.ceil(h/f);
  const cells=new Uint8Array(gw*gh), counts=new Uint32Array(gw*gh);
  for(let y=0;y<h;y++){ const row=y*w, cy=((y/f)|0)*gw; for(let x=0;x<w;x++) if(mask[row+x]){ const c=cy+((x/f)|0); cells[c]=1; counts[c]++; } }
  return {cells,counts,gw,gh};
}
function removeHLines(cells,gw,gh,rowSums){
  const out=cells.slice(); const thr=gw*0.8; let y=0;
  while(y<gh){ if(rowSums[y]<=thr){ y++; continue; } let y2=y; while(y2+1<gh && rowSums[y2+1]>thr) y2++; if(y2-y+1<=3) for(let yy=y;yy<=y2;yy++) for(let x=0;x<gw;x++) out[yy*gw+x]=0; y=y2+1; }
  return out;
}
function removeVLines(cells,gw,gh,colSums){
  const out=cells.slice(); const thr=gh*0.8; let x=0;
  while(x<gw){ if(colSums[x]<=thr){ x++; continue; } let x2=x; while(x2+1<gw && colSums[x2+1]>thr) x2++; if(x2-x+1<=3) for(let xx=x;xx<=x2;xx++) for(let yy=0;yy<gh;yy++) out[yy*gw+xx]=0; x=x2+1; }
  return out;
}
function removeGridLines(cells,gw,gh){
  const rowSums=new Array(gh).fill(0), colSums=new Array(gw).fill(0);
  for(let y=0;y<gh;y++) for(let x=0;x<gw;x++) if(cells[y*gw+x]){ rowSums[y]++; colSums[x]++; }
  let tmp=removeHLines(cells,gw,gh,rowSums);
  tmp=removeVLines(tmp,gw,gh,colSums);
  return tmp;
}
function buildSeries(cells,counts,gw,gh,rMax){
  const series=[];
  for(let r=1;r<=rMax;r++) series.push(label(dilate(cells,gw,gh,r),cells,counts,gw,gh).count);
  const runs=[];
  for(let i=0;i<series.length;i++){ const last=runs[runs.length-1]; if(last && last.count===series[i]) last.end=i; else runs.push({start:i,end:i,count:series[i]}); }
  return runs;
}
function bestRun(runs){
  const cand=runs.filter(r=>r.count>=2);
  if(cand.length===0) return runs.reduce((p,c)=>c.end-c.start>p.end-p.start?c:p,runs[0]);
  let best=cand[0];
  for(const r of cand){ if(r.count>best.count) best=r; else if(r.count===best.count && r.end-r.start>best.end-best.start) best=r; }
  return best;
}
function extractBoxes(a,lab,f,gw){
  const {w,h,mask,scale}=a;
  const n=lab.valid.length;
  const minX=new Array(n).fill(Infinity), minY=new Array(n).fill(Infinity), maxX=new Array(n).fill(-Infinity), maxY=new Array(n).fill(-Infinity), ink=new Array(n).fill(0);
  for(let y=0;y<h;y++){ const row=y*w, cy=((y/f)|0)*gw; for(let x=0;x<w;x++){ if(!mask[row+x]) continue; const l=lab.labels[cy+((x/f)|0)]; if(l<0||!lab.valid[l]) continue; if(x<minX[l]) minX[l]=x; if(x>maxX[l]) maxX[l]=x; if(y<minY[l]) minY[l]=y; if(y>maxY[l]) maxY[l]=y; ink[l]++; } }
  const boxes=[];
  for(let i=0;i<n;i++){ if(!lab.valid[i]||!isFinite(minX[i])) continue; const x0=Math.max(0,(minX[i]-1)*scale), y0=Math.max(0,(minY[i]-1)*scale); boxes.push({x:x0,y:y0,w:(maxX[i]+2)*scale-x0,h:(maxY[i]+2)*scale-y0,ink:ink[i]}); }
  return boxes;
}
function isInside(inner, outer){ return inner.x>=outer.x && inner.y>=outer.y && inner.x+inner.w<=outer.x+outer.w && inner.y+inner.h<=outer.y+outer.h; }
function filterContained(boxes){
  if(boxes.length<=1) return boxes;
  const sorted=[...boxes].sort((a,b)=>b.w*b.h-a.w*a.h);
  const keep=[];
  for(const b of sorted){ const container=keep.find(o=>isInside(b,o) && b.ink < o.ink*0.5); if(!container) keep.push(b); }
  return keep;
}
function orderBoxes(boxes){
  boxes.sort((p,q)=>p.y+p.h/2-(q.y+q.h/2));
  const rows=[];
  for(const b of boxes){ const cy=b.y+b.h/2; const row=rows.find(rw=>Math.abs(rw[0].y+rw[0].h/2-cy)<Math.min(rw[0].h,b.h)*0.5); if(row) row.push(b); else rows.push([b]); }
  return rows.flatMap(rw=>rw.sort((p,q)=>p.x-q.x));
}
function detect(a,radiusFrac){
  const {w,h}=a;
  const longest=Math.max(w,h);
  const f=Math.max(1,Math.ceil(longest/800));
  const {cells:raw,counts,gw,gh}=downsample(a.mask,w,h,f);
  const cells=removeGridLines(raw,gw,gh);
  const rMax=Math.max(3,Math.floor(Math.max(gw,gh)*0.2));
  const runs=buildSeries(cells,counts,gw,gh,rMax);
  const best=bestRun(runs);
  const autoR=Math.round((best.start+best.end)/2)+1;
  const autoFrac=(autoR*f)/longest;
  const usedFrac=radiusFrac??autoFrac;
  const r=radiusFrac==null?autoR:Math.max(0,Math.round((radiusFrac*longest)/f));
  const lab=label(dilate(cells,gw,gh,r),cells,counts,gw,gh);
  const rawBoxes=extractBoxes(a,lab,f,gw);
  const filtered=filterContained(rawBoxes);
  return {boxes:orderBoxes(filtered), usedFrac, autoFrac};
}

const path = process.argv[2] || "tests/assets/grid-lightbulb.png";
const buf = readFileSync(path);
const png = PNG.sync.read(buf);
console.log(`Loaded ${path}: ${png.width}x${png.height}, data len ${png.data.length}`);
const a = analyzeFromPixels(png.data, png.width, png.height, png.width, png.height);
console.log(`Analysis: bg=${a.bg}, maxDiff=${a.inkDiff}, thr=${a.threshold}, mask ink pixels=${a.mask.reduce((s,v)=>s+v,0)}`);
const resAuto = detect(a, null);
console.log(`Auto: boxes=${resAuto.boxes.length}, autoFrac=${resAuto.autoFrac}, usedFrac=${resAuto.usedFrac}`);
console.log(resAuto.boxes.map(b=>`(${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.w)}x${Math.round(b.h)} ink=${b.ink})`).join("\n"));
const res0 = detect(a, 0);
console.log(`R=0: boxes=${res0.boxes.length}`);
console.log(res0.boxes.map(b=>`(${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.w)}x${Math.round(b.h)})`).join("\n"));

if (resAuto.boxes.length < 4) {
  console.log("FAIL: should be at least 4");
  process.exit(1);
} else {
  console.log("PASS: at least 4 icons detected");
}
