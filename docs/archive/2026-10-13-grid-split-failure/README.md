# Grid image fails to split — 2x2 lightbulb icons

## Prompt
> this image is not able to be split to several icon. what is might be a problem. research algo and give solution as Doc.

Image: 2x2 grid of lightbulb line icons, thin black strokes on white / very light gray backgrounds, with faint gray lines dividing quadrants (1-2px, #e5e5e5).

## Algorithm overview (src/lib/detect.ts)

1. **analyze(img)**
   - Downscales to max 4000px, reads pixels.
   - Background = median color of border pixels (samples every ~w/600).
   - Computes per-pixel diff = max(|r-bgR|, |g-bgG|, |b-bgB|), builds histogram.
   - `maxDiff` = 99.97th percentile diff (robust full ink contrast, at least 30).
   - `threshold = clamp(18..110, maxDiff*0.42)`.
   - `mask[p]=1` if diff>threshold. Ink color averaged from pixels with diff>=maxDiff*0.85.

2. **detect(analysis, radiusFrac)**
   - Downsamples mask to grid `gw = ceil(w/f)`, `gh = ceil(h/f)`, `f = ceil(longest/400)` → grid ~400px longest.
   - `cells` = 1 if any mask pixel in cell, `counts` = ink pixels per cell.
   - `dilate(cells, r)` = binary dilation with square radius r (separable prefix sums).
   - `label(dilated, cells, counts)` = 8-connected labeling of dilated cells, collects ink per label, filters small labels `< maxInk*0.015`.
   - Auto radius: runs `r=1..rMax`, `rMax = max(3, floor(max(gw,gh)*0.2))`, series `count[r]`. Finds runs of equal count. Best run = longest run with count>=2, tie higher count. If len(best)<3, fallback to longest run overall (often count=1). `autoR = middle of best run`, `autoFrac = autoR*f/longest`.
   - Used radius = `radiusFrac ?? autoFrac`. Labels with that radius, then computes exact boxes from full-res mask using label map.

3. **Rendering / preview**
   - `useBatchPreview` caches analysis, runs detection per row, renders thumbs.

## Why 2x2 grid fails — root cause analysis

### 1. Faint grid lines become ink bridges
Image has 1-2px light gray dividers spanning full width/height. If threshold is low (e.g., 18-30), those lines have diff ~10-30 and become `mask=1`. Then all 4 quadrants are connected via cross, so even at `r=0` count=1. If threshold is high (~100), lines are not ink, but they still reduce gap.

In this image, alternating backgrounds: top-left white, top-right #f5f5f5, bottom-left white, bottom-right #f5f5f5. Border median includes both white and light gray → median ~ #fbfbfb. Light gray diff ~10-15, below threshold, so not ink. But grid lines are slightly darker than light gray background, maybe #e0e0e0 diff ~20-30, could be above low threshold if maxDiff is small.

When does maxDiff become small? If black strokes are thin and cover <0.03% of image, 99.97th percentile may fall on grid lines, not black. Then `maxDiff` ~20-30, `threshold` ~12-18, grid lines become ink. For line icons, ink area is ~1-2% but could still be <0.03% if image is large and strokes 1px. Then grid lines dominate.

**Evidence:** lightbulb icons are thin outlines, ~1-2% area. If image is 1024x1024, 1% = 10k pixels, 0.03% = 300 pixels, so black still >300, so maxDiff should be black. But if image is upscaled with anti-aliasing, black diff spreads, still high. So grid lines maybe not ink, but still problem #2.

### 2. Auto radius stability favors merged count
Grid gap between icons is small (20-40px). In downsampled grid (f~2-3), gap = 7-13 cells. `r=1..gap/2` gives count=4, `r>=gap/2` gives count=1 (diagonal merge via 8-connectivity). So series is e.g., [4,4,4,4,1,1,...1] with 4 run len=4, 1 run len=60. Best among count>=2 is len=4 (>=3) → auto picks 4, should work. But if gap is <6 cells (e.g., 15px original, f=3 → 5 cells), then 4 run len=2 (<3) → fallback to longest run = 1 → auto picks 1. User's image gap looks ~10-20px, so len(4) may be 2-3, borderline.

Thus for tight grids, auto radius incorrectly merges.

### 3. Background median with alternating backgrounds
Border contains both white and light gray. Median may be light gray, making white quadrants have diff ~10-15. If threshold is 18, white diff 10-15 below, fine. But if threshold drops to 12 due to small maxDiff, white quadrants become ink? No, white diff small. However, light gray background vs white background difference is small, so mask may include one background as ink, connecting icons via background.

### 4. Downsampling erases gap
`f = ceil(longest/400)`. For 1024px image, f=3, so 2px grid line + 20px gap becomes 7 cells gap, but dilation with r=3 already bridges. If original gap is 2px, after downsampling gap may be 0-1 cell, so even r=1 merges.

### 5. Small component filtering
If grid lines connect icons, one large component has all ink. No small filtering issue. If grid lines not ink, 4 components each have similar ink, valid.

### Most likely for this image
Combination of #1 and #2: faint dividers are just below threshold but close, and gap is small, so auto radius picks large r that merges 4 into 1. User sees 1 icon, slider at auto gives 1. Even moving slider to 0 may still give 1 if dividers are ink.

## Reproduction (synthetic)

Create canvas 1024x1024, 4 quadrants, each with a circle outline, separated by 2px #e5e5e5 line vertical at 512 and horizontal at 512. Run analyze+detect. Observe:
- With threshold 100, grid lines not ink, count at r=0 =4, at r=5=1, auto picks 4 if gap 20px.
- With threshold 15, grid lines ink, count at r=0=1.

We can add a vitest that draws such image and checks count.

## Solutions

### Short-term (no algo change, user workaround)
- In Batch UI, set merge slider to 0 (minimum) and click Apply — forces r=0, should give 4 if grid lines not ink. If still 1, image needs preprocessing: open in editor, erase grid lines or add 20px white padding between icons.
- Add 20-30px white border around each icon (crop into 4 separate files) then batch split.

### Mid-term (improve detection, keep API)

1. **Grid line removal pre-filter**
   - After building mask, detect long straight lines spanning >85% width or height with thickness 1-4px and low ink density (e.g., using projection histograms: sum mask rows/cols, find peaks that span full length).
   - If found, set those rows/cols in mask to 0 (remove). This breaks connections via dividers.
   - Implementation: compute row sums and col sums of mask, find lines where sum > 0.8*gw and width 1-3 cells, and remove.

2. **Improve background detection**
   - Instead of median border, use mode or k-means with 2 clusters (background vs ink) on border pixels. Or use most frequent color (histogram) to avoid light gray bias.
   - Or, compute background per quadrant or use adaptive threshold per tile (e.g., divide image into 4 quadrants, compute bg per quadrant).

3. **Fix auto radius selection**
   - Current: prefers longest stable run, which favors count=1. Change to prefer higher counts: score = len * (count^1.5) or len * count, or penalize large r.
   - Or, require stability for count>=2 to be at least 2, not 3, and never fallback to count=1 if there exists any run with count>=2 and len>=2.
   - Or, use elbow method: find largest drop in count, pick r just before drop.
   - Simple fix: best run among count>=2 with len>=2, if none, pick run with max count (not longest). This would pick 4 over 1.

4. **Reduce downsampling factor**
   - Use f = ceil(longest/800) instead of /400, doubling grid resolution, preserving small gaps. Cost: 4x more cells, still okay (800x800 grid = 640k cells, labeling okay). Or make f adaptive based on expected icon count.

5. **Add manual override UI**
   - Already have merge slider, but also add "Expected icons" slider or "Split by grid" button: if user sets expected 4, binary search radius to achieve 4.

### Long-term (robust icon splitter)

- **Two-stage detection**: first detect large connected components at high threshold (only black), then refine.
- **Use distance transform + watershed**: more robust to touching icons.
- **ML-based detector**: train small model to detect icon bounding boxes, or use SAM (segment anything) for zero-shot.
- **Add preprocessing options**: morphological opening (erode then dilate) to remove thin lines, or use edge detection (Canny) instead of color diff.
- **Debug overlay**: show mask, dilated cells, labels, so user can see why merge happens.

### Recommended immediate code change

1. **In analyze**: increase `need` for maxDiff from 0.03% to 0.1% or 0.5% to ensure black strokes dominate, not grid lines. Or compute maxDiff as 99.9th percentile instead of 99.97th.

2. **In detect**:
   - Change run selection:
     ```ts
     let best: Run | undefined;
     for (const r of runs) {
       if (r.count < 2) continue;
       if (!best || len(r) > len(best) || (len(r) === len(best) && r.count > best.count)) best = r;
     }
     if (!best) best = runs.reduce((p,c) => c.count > p.count ? c : p, runs[0]); // prefer max count, not longest
     if (best.count === 1) { // if still 1, try to find any run with count>1
       const withIcons = runs.filter(r=>r.count>1).sort((a,b)=>b.count-a.count)[0];
       if (withIcons) best = withIcons;
     }
     ```
   - Add grid line removal:
     ```ts
     function removeGridLines(cells, gw, gh) {
       const rowSums = new Array(gh).fill(0);
       const colSums = new Array(gw).fill(0);
       for (let y=0;y<gh;y++) for (let x=0;x<gw;x++) if (cells[y*gw+x]) { rowSums[y]++; colSums[x]++; }
       const threshRow = gw*0.85, threshCol = gh*0.85;
       for (let y=0;y<gh;y++) if (rowSums[y] > threshRow) {
         // check thickness 1-3
         for (let x=0;x<gw;x++) cells[y*gw+x]=0;
       }
       for (let x=0;x<gw;x++) if (colSums[x] > threshCol) {
         for (let y=0;y<gh;y++) cells[y*gw+x]=0;
       }
     }
     ```
     Call before dilation.

3. **Increase resolution**: change `f = Math.max(1, Math.ceil(longest / 800))`.

4. **UI**: when detection returns 1 but image is large and has high aspect, show hint "Try lowering Merge distance to 0 or removing grid lines".

### Test plan for fix

- Create test image: 2x2 grid with 2px #e5e5e5 dividers, 4 circles. Expect count=4 at auto.
- Create test image: same but dividers #000 black 2px (should be 1, because dividers are ink).
- Existing batch tests should still pass (9+5).
- Add new test `grid_split.test.ts` that generates canvas, runs analyze+detect, expects 4 boxes.

## Conclusion for this specific image

The 2x2 lightbulb grid fails because:
- Faint dividers + small gap cause auto radius to pick merged count=1 (stability len of 1 dominates).
- Possibly dividers are just above threshold and connect quadrants.
- Downsampling erases gap.

**Fix**: remove long spanning lines from mask, prefer higher counts in auto radius, increase grid resolution, and allow manual merge=0 to force 4-way split. With those changes, this image should split into 4 icons at merge ~0-0.02.

## References
- src/lib/detect.ts: analyze, dilate, label, auto radius
- src/batch/useBatchPreview.ts: caching, preview
- User image: 4 icons, 2x2, thin gray dividers, alternating light backgrounds
