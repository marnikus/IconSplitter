// pngjs ships no type declarations; the real-grid fixture test is its only
// importer. `any` is fine there — the test reads `.data`, `.width`, `.height`.
declare module "pngjs" {
  const PNG: any;
  export { PNG };
}
