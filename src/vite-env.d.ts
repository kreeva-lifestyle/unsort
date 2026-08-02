// Type Vite's `?raw` imports (used to inline JsBarcode into the label-print
// iframe in BrandTags.tsx). Minimal on purpose — declares only the `?raw`
// suffix rather than referencing all of vite/client, to avoid changing any
// other ambient typing in the project.
declare module '*?raw' {
  const src: string;
  export default src;
}
