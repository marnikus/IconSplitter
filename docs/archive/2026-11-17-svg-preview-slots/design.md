# SVG preview slot alignment and image acceptance

Style rows add a Base · Stroke preview to the existing AI source and SVG previews, but the control row still has two cells. Consequently every control shifts one slot left. A 96px minimum bar width also causes drift when zoomed out. Each preview needs a corresponding, independently sized control cell with the same gap; image dimensions must be measured separately.

The style image choice must continue through verified pair-file acceptance to the exact image used by SVG generation. Generation reads the metadata cache, whereas switching from Base could build a style row only from discovery metadata without populating that cache. Scans and style switches must supply the same records to both consumers. Pair-file rebasing must retain the style identity and rebase image-history files as well as SVG files. Row rebuilds must preserve the base preview. Missing style originals must not be offered as image choices.

Regression coverage should exercise slot geometry and ownership, accepted image selection through a style switch, rebase from a different root, and preservation of comparison state on rebuild. Selection remains an explicit verified write; no new provider request or approval behavior is introduced.
