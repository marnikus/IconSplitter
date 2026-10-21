# Native vector EPS implementation plan — 2026-10-21

Follows `research.md`; implementation authorized after the research phase.

1. Witness failing production-writer tests for linear/radial vector gradients,
   the real shadow template, nonlinear color/alpha interpolation, unsafe overlap,
   and raster-injected final EPS. The two user-specified SVG fixtures are still
   absent: do not claim their tests pass.
2. Separate EPS paint, gradient resolution/coordinates, vector color functions,
   and backdrop analysis into small modules. Emit Level 3 shading dictionaries
   clipped to the original vector path. No image encoder or bitmap intermediary.
3. Support sRGB pad gradients with local references, valid finite coordinates,
   transforms, multiple strictly increasing stops and geometric object bounds.
   Normalize stop endpoints. Unsupported spreads, degenerate/focal geometry,
   gradient strokes and color modes fail explicitly rather than being guessed.
4. Flatten varying alpha only onto a known uniform opaque backdrop, tracking
   previous paint bounds conservatively. A covering opaque solid rectangle can
   establish a backdrop; any overlapping nonuniform previous mark blocks alpha
   flattening. Evaluate color × alpha before interpolation, with adaptive vector
   segments bounded to 1/8192 per channel (plus numeric serialization precision).
   Paint the selected flatten background explicitly when needed so EPS does not
   depend on the receiving page color.
5. Validate the emitted dictionary grammar and color functions, extend the
   operand-stack checker for vector clipping/shading, and reject unknown programs
   and every image operation/payload. Metadata is admitted only when its complete
   executable envelope matches the app's canonical metadata emitter exactly.
6. Use this strict gate for every converter, after metadata, saved-file readback,
   cached EPS eligibility and Download all. Unverifiable external EPS fails closed.
   Update writer identity and replace obsolete blanket shadow warnings.
7. Run focused/export regressions, independent interpreter experiments, types,
   lint, quality and full verification; document measured results, missing input
   fixtures, and any failed gates without claiming completion beyond evidence.

No external application, helper or production WASM dependency is introduced.
