/** Overlay styles, scoped by the Shadow DOM. Same tokens as the dashboard. */
export const OVERLAY_CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.card {
  position: fixed; right: 16px; bottom: 16px; z-index: 2147483646;
  width: 288px; max-height: calc(100vh - 32px); overflow-y: auto;
  background: #fff; color: #1f1f1f;
  border: 1px solid #ececec; border-radius: 20px;
  box-shadow: 0 10px 30px rgba(0,0,0,.14);
  padding: 14px 16px 16px;
  font: 13px/1.4 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
}
header { display: flex; align-items: baseline; gap: 6px; margin-bottom: 8px; }
.brand { font-weight: 800; color: #e5262e; letter-spacing: -.01em; }
.tag { font-size: 10px; color: #6b6b6b; text-transform: uppercase; letter-spacing: .04em; }
.close { margin-left: auto; border: 0; background: none; font-size: 18px; line-height: 1; color: #6b6b6b; cursor: pointer; padding: 0 2px; }
p { margin: 0; }
.item { font-weight: 700; font-size: 14px; }
.muted { color: #6b6b6b; }
.fine { font-size: 11px; color: #6b6b6b; margin-top: 6px; }
.warn { color: #9a6200; background: #fdf3e1; border-radius: 10px; padding: 6px 8px; margin: 8px 0; }
.small { font-size: 11px; }
.price-row { display: flex; align-items: baseline; gap: 8px; margin: 8px 0; }
.price { font-size: 26px; font-weight: 800; letter-spacing: -.02em; }
s { font-size: 12px; }
button.metric, button.label {
  display: block; border: 0; background: none; padding: 1px 0; margin: 2px 0; font: inherit; color: inherit;
  cursor: help; text-align: left;
  text-decoration: underline dotted rgba(0,0,0,.35); text-underline-offset: 3px;
}
button.price.metric { font-size: 26px; font-weight: 800; }
button.label { display: inline-block; margin-top: 8px; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; text-decoration: none; }
.label-low { background: #e8f5ee; color: #1a7f4b; }
.label-near { background: #f4f4f4; }
.label-high { background: #fdecec; color: #e5262e; }
.label-insufficient { background: #fdf3e1; color: #9a6200; }
button.primary {
  display: block; width: 100%; margin-top: 12px; padding: 10px; border: 0; border-radius: 999px;
  background: #e5262e; color: #fff; font: 700 13px/1 inherit; font-family: inherit; cursor: pointer;
}
button.primary[disabled] { background: #f0b4b6; cursor: not-allowed; }
details { margin-top: 8px; font-size: 12px; }
summary { cursor: pointer; color: #6b6b6b; }
table { width: 100%; border-collapse: collapse; margin-top: 6px; }
th { text-align: left; font-weight: 500; color: #6b6b6b; padding: 2px 0; }
td { padding: 2px 0 2px 6px; }
td.conf { text-align: right; color: #6b6b6b; font-variant-numeric: tabular-nums; }
.explain { margin-top: 8px; padding: 10px; border-radius: 12px; background: #f7f7f7; }
.ex-name { font-weight: 700; }
.ex-desc { color: #6b6b6b; margin: 2px 0 6px; }
code { display: block; font: 11px/1.4 ui-monospace, Menlo, Consolas, monospace; background: #fff; border-radius: 8px; padding: 6px; white-space: pre-wrap; }
dl { display: grid; grid-template-columns: auto 1fr; gap: 2px 8px; margin: 6px 0 0; }
dt { font: 11px ui-monospace, Menlo, Consolas, monospace; color: #6b6b6b; }
dd { margin: 0; text-align: right; font-variant-numeric: tabular-nums; }
.warnings { margin: 8px 0 0; padding-left: 16px; font-size: 11px; color: #9a6200; }
`;
