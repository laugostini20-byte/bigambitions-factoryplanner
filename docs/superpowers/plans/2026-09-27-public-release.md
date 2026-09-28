# Factory Planner Public Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the minified single-file planner into readable static files with data generated from the xlsx, add a searchable product picker, footer links and a social preview, then ship to GitHub and Vercel.

**Architecture:** Plain static site served from the repo root. The data (`js/data.js`) comes from the xlsx through a Python script. Pure calculations live in `js/calc.js`, which runs in both the browser and Node. DOM/rendering lives in `js/app.js`. Classic `<script>` tags, not ES modules, so the page also works from `file://`.

**Tech Stack:** HTML/CSS/vanilla JS, Python 3 + openpyxl (data build), Node 24 `node:test` (calc tests), headless Chrome (golden capture, og image), Vercel static hosting.

**Spec:** `docs/superpowers/specs/2026-09-27-public-release-design.md`

## Global Constraints

- No runtime dependencies, no bundler, no `package.json` (Vercel must serve the repo as static files).
- Keep the localStorage keys `flp3-g`, `flp3-s`, `flp3-plan`, `flp3-rk` and the sessionStorage key `flp3-tab` unchanged.
- Numbers must match the original for the same inputs (golden test).
- Keep the light and dark themes, the mobile layout (16px gutter, no horizontal scroll) and the existing fonts.
- Repo URL: `https://github.com/laugostini20-byte/bigambitions-factoryplanner`.
- Chrome binary: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`.

## File map

| File | Responsibility |
|---|---|
| `index.html` | Markup, meta tags, script/style includes |
| `css/styles.css` | All styles (unminified from original `<style>`) |
| `js/data.js` | GENERATED: `DATA = {R, I, M, meta}` |
| `js/calc.js` | Pure maths: `mult`, `supplyPerWeek`, `lineCalc`, `rankRow` |
| `js/picker.js` | Searchable product combobox |
| `js/app.js` | State, rendering, events |
| `scripts/build_data.py` | xlsx → `js/data.js` |
| `tests/test_build_data.py` | Data parity with original |
| `tests/calc.test.js` | Golden parity for calculations |
| `tests/fixtures/original-data.json`, `tests/fixtures/golden.json` | Captured from original `index.html` |
| `data/BigAmbitions_Items_and_Prices.xlsx` | Source spreadsheet (moved) |
| `og.png` | 1200×630 social card |
| `README.md` | About + how to update after a game patch |

---

### Task 1: Capture fixtures from the original page

**Files:**
- Create: `tests/fixtures/original-data.json`, `tests/fixtures/golden.json`, `tests/capture.html` (temporary, deleted at end of task)

**Interfaces:**
- Produces: `golden.json` = array of `{line, g, out, units, matCost, labor, make, importCost, save, revenue, netHr, machines, payDays, maxStnHrsWk, unitsWk, costUnit, mats:[{n,total,cost,cap}], rank:{out,cu,imp,pct,net,chain,pay,sup,profit}}`, with `Infinity` stored as the string `"Infinity"`.

- [ ] **Step 1:** Build `tests/capture.html` = original `index.html` + this script appended before `</body>`:

```html
<script>
const fin = v => (v === Infinity ? "Infinity" : v);
const settings = [
  {skill:100,wage:25,pidx:1,sidx:1,buf:10},
  {skill:40,wage:60,pidx:1.3,sidx:0.8,buf:0},
];
const lines = [{hrs:16,days:7,ws:2},{hrs:0,days:3,ws:1},{hrs:24,days:14,ws:5}];
const out = [];
for (const g of settings) for (const l of lines) for (const r of R) {
  Object.assign(G, g); S.hrs = l.hrs;
  const line = {item:r.n, ...l};
  const c = lineCalc(line), k = rankRow(r);
  out.push({line, g, out:c.out, units:c.units, matCost:c.matCost, labor:c.labor, make:c.make,
    importCost:c.importCost, save:c.save, revenue:c.revenue, netHr:c.netHr, machines:c.machines,
    payDays:fin(c.payDays), maxStnHrsWk:fin(c.maxStnHrsWk), unitsWk:c.unitsWk, costUnit:c.costUnit,
    mats:c.mats.map(m=>({n:m.n,total:m.total,cost:m.cost,cap:fin(m.cap)})),
    rank:{out:k.out,cu:k.cu,imp:k.imp,pct:k.pct,net:k.net,chain:k.chain,pay:fin(k.pay),sup:fin(k.sup),profit:k.profit}});
}
document.body.innerHTML = "<pre id=golden></pre><pre id=data></pre>";
document.getElementById("golden").textContent = JSON.stringify(out);
document.getElementById("data").textContent = JSON.stringify(DATA);
</script>
```

- [ ] **Step 2:** Run headless Chrome with a fresh profile (so localStorage is empty) and extract the two `<pre>` blocks with Python into the fixture files:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --user-data-dir="$(mktemp -d)" --dump-dom "file://$PWD/tests/capture.html" > /tmp/dom.html
python3 - <<'PY'
import re, html, json
s = open('/tmp/dom.html').read()
for k in ('golden', 'data'):
    t = html.unescape(re.search(rf'<pre id="{k}">(.*?)</pre>', s, re.S).group(1))
    name = 'golden.json' if k == 'golden' else 'original-data.json'
    json.dump(json.loads(t), open(f'tests/fixtures/{name}', 'w'), indent=0)
PY
```
Expected: `golden.json` has 2×3×62 = 372 entries. `original-data.json` has keys `R, I, M` with 62 recipes, 121 items and 10 machines.

- [ ] **Step 3:** Delete `tests/capture.html` and commit the fixtures.

---

### Task 2: Data build script

**Files:**
- Create: `scripts/build_data.py`, `tests/test_build_data.py`, `js/data.js`
- Move: `BigAmbitions_Items_and_Prices.xlsx` → `data/BigAmbitions_Items_and_Prices.xlsx` (`git mv`)

**Interfaces:**
- Produces: `build(xlsx_path) -> dict` with keys `R, I, M, meta`, and CLI `python3 scripts/build_data.py`, which writes `js/data.js` as `/* GENERATED ... */\nvar DATA = {...};\nif (typeof module !== "undefined") module.exports = DATA;\n`.
- `meta = {"pulled": "<YYYY-MM-DD from Read Me 'Source' row>", "recipes": 62, "items": 121}`

Column mapping (0-based, header row skipped):
- Items: name `[0]`, importers `[3]` (split on `,`, strip, strip trailing `*`, **sorted**), imp `[4]`, sell `[5]` (None stays `null`), box `[8]`, cap `[10]`, soldBy `[13]` (None becomes `""`).
- Recipes: name `[0]`, out `[2]`, machines `[4]` split on `,` and stripped (order kept).
- Recipe Ingredients: output `[0]`, ingredient `[1]`, qty `[2]` (row order kept).
- Furniture & Equipment: name `[0]`, price `[3]`. `M` holds only machines used by some recipe, in first-seen recipe order.
- `I` holds only items that appear in some recipe as output or input.
- `R` keeps the Recipes sheet row order.

- [ ] **Step 1: Write failing test** `tests/test_build_data.py`:

```python
import json, pathlib, sys, unittest
ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import build_data

class BuildDataTest(unittest.TestCase):
    def setUp(self):
        self.data = build_data.build(ROOT / "data/BigAmbitions_Items_and_Prices.xlsx")
        self.orig = json.loads((ROOT / "tests/fixtures/original-data.json").read_text())

    def test_recipes_match_original(self):
        self.assertEqual(self.data["R"], self.orig["R"])

    def test_items_match_original(self):
        self.assertEqual(self.data["I"], self.orig["I"])

    def test_machines_match_original(self):
        self.assertEqual(self.data["M"], self.orig["M"])

    def test_meta(self):
        self.assertEqual(self.data["meta"]["pulled"], "2026-09-27")

if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2:** `python3 -m unittest tests/test_build_data.py`. Expected: FAIL (`ModuleNotFoundError: build_data`).
- [ ] **Step 3: Implement** `scripts/build_data.py`:

```python
#!/usr/bin/env python3
"""Build js/data.js from the Big Ambitions spreadsheet.

Usage: python3 scripts/build_data.py [path/to/xlsx]
"""
import json, pathlib, re, sys
import openpyxl

ROOT = pathlib.Path(__file__).resolve().parents[1]
DEFAULT_XLSX = ROOT / "data" / "BigAmbitions_Items_and_Prices.xlsx"
OUT = ROOT / "js" / "data.js"


def rows(ws):
    return [r for r in ws.iter_rows(min_row=2, values_only=True) if r[0]]


def split(cell):
    return [p.strip() for p in str(cell or "").split(",") if p.strip()]


def build(xlsx_path):
    wb = openpyxl.load_workbook(xlsx_path)
    items = {r[0]: r for r in rows(wb["Items"])}
    ingredients = {}
    for r in rows(wb["Recipe Ingredients"]):
        ingredients.setdefault(r[0], []).append([r[1], r[2]])
    recipes = [[r[0], r[2], split(r[4]), ingredients[r[0]]] for r in rows(wb["Recipes"])]

    prices = {r[0]: r[3] for r in rows(wb["Furniture & Equipment"])}
    machines = {}
    for _, _, ms, _ in recipes:
        for m in ms:
            machines.setdefault(m, prices[m])

    used = []
    for name, _, _, ins in recipes:
        for n in [name] + [i[0] for i in ins]:
            if n not in used:
                used.append(n)
    item_data = {}
    for n in used:
        r = items[n]
        importers = sorted(i.rstrip("*").strip() for i in split(r[3]))
        item_data[n] = [r[4], r[5], r[8], r[10], r[13] or "", importers]

    source = next(r[1] for r in wb["Read Me"].iter_rows(values_only=True) if r[0] == "Source")
    pulled = re.search(r"\d{4}-\d{2}-\d{2}", source).group(0)
    meta = {"pulled": pulled, "recipes": len(recipes), "items": len(item_data)}
    return {"R": recipes, "I": item_data, "M": machines, "meta": meta}


def main():
    xlsx = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_XLSX
    data = build(xlsx)
    OUT.write_text(
        "/* GENERATED by scripts/build_data.py from the xlsx. Do not edit by hand. */\n"
        f"var DATA = {json.dumps(data, separators=(',', ':'))};\n"
        'if (typeof module !== "undefined") module.exports = DATA;\n'
    )
    print(f"Wrote {OUT.relative_to(ROOT)}: {data['meta']}")


if __name__ == "__main__":
    main()
```

Note: `I` key order doesn't matter for `assertEqual`, so `test_items_match_original` passes whatever order `used` produces.

- [ ] **Step 4:** `python3 -m unittest tests/test_build_data.py`. Expected: 4 tests OK. If the importer order differs for any item, check how the original sorts importers and change the sort to match.
- [ ] **Step 5:** `python3 scripts/build_data.py`. Expected: `Wrote js/data.js: {...'recipes': 62, 'items': 121}`.
- [ ] **Step 6:** Commit.

---

### Task 3: Extract pure calculations into `js/calc.js`

**Files:**
- Create: `js/calc.js`, `tests/calc.test.js`

**Interfaces:**
- Consumes: global `DATA` (from `js/data.js`; in Node via `require("../js/data.js")`).
- Produces (global `Calc` in the browser, `module.exports` in Node):
  - `Calc.recipes`: array of `{n, out, m, ins, fam, chain}`
  - `Calc.byName`: `{[name]: recipe}`
  - `Calc.items`: `{[name]: {imp, sell, box, cap, sold, im: string[]}}`. The original wraps each importer as `[name]`, and only `im[0]`/`join` are used, so plain strings are fine as long as app.js is updated to match.
  - `Calc.machines`: `DATA.M`
  - `Calc.FAMS`: the 7 family names in the original order
  - `Calc.mult(g) -> number`
  - `Calc.supplyPerWeek(name) -> number`
  - `Calc.lineCalc(line, g) -> result` (same fields as the original `lineCalc`, with `r` = the recipe)
  - `Calc.rankRow(recipe, g, hrs) -> {r, fam, out, cu, imp, pct, net, chain, pay, sup, profit}`

- [ ] **Step 1: Write failing test** `tests/calc.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert");
globalThis.DATA = require("../js/data.js");
const Calc = require("../js/calc.js");
const golden = require("./fixtures/golden.json");

const fin = v => (v === Infinity ? "Infinity" : v);
const close = (a, b, path) => {
  if (typeof b === "number" && typeof a === "number")
    assert.ok(Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b)), `${path}: ${a} != ${b}`);
  else assert.strictEqual(a, b, path);
};

test("lineCalc and rankRow match the original for every recipe and setting", () => {
  assert.strictEqual(golden.length, 372);
  for (const gcase of golden) {
    const id = `${gcase.line.item} ${JSON.stringify(gcase.g)} ${JSON.stringify(gcase.line)}`;
    const c = Calc.lineCalc(gcase.line, gcase.g);
    for (const k of ["out","units","matCost","labor","make","importCost","save","revenue","netHr",
                     "machines","payDays","maxStnHrsWk","unitsWk","costUnit"])
      close(fin(c[k]), gcase[k], `${id} ${k}`);
    gcase.mats.forEach((m, i) => {
      close(c.mats[i].n, m.n, `${id} mats[${i}].n`);
      for (const k of ["total","cost","cap"]) close(fin(c.mats[i][k]), m[k], `${id} mats[${i}].${k}`);
    });
    const r = Calc.rankRow(Calc.byName[gcase.line.item], gcase.g, gcase.line.hrs);
    for (const k of Object.keys(gcase.rank)) close(fin(r[k]), gcase.rank[k], `${id} rank.${k}`);
  }
});

test("families cover every recipe", () => {
  for (const r of Calc.recipes) assert.ok(Calc.FAMS.includes(r.fam), r.n);
});
```

Note the original `rankRow` uses `S.hrs || 16`, so `rankRow(recipe, g, hrs)` must do `hrs || 16` too. That's why the `hrs: 0` golden cases matter.

- [ ] **Step 2:** `node --test tests/`. Expected: FAIL (`Cannot find module '../js/calc.js'`).
- [ ] **Step 3: Implement** `js/calc.js` by un-minifying the original `family`, `supplyPerWeek`, `lineCalc`, `rankRow`, `mult` and the `R`/`I`/`byName`/`M` setup. Wrap it in:

```js
(function (root) {
  "use strict";
  // ...functions, with G replaced by an explicit `g` parameter...
  const Calc = { FAMS, recipes, byName, items, machines, mult, supplyPerWeek, lineCalc, rankRow };
  if (typeof module !== "undefined") module.exports = Calc;
  else root.Calc = Calc;
})(typeof window !== "undefined" ? window : globalThis);
```

Rename minified locals to meaningful names (e.g. in `lineCalc`: `a→outPerHr`, `o→stnHrs`, `i→impPrice`, `d→sellPrice`, `c→mats`, `b→matPerHr`, `p→units`, `y→matCost`, `f→labor`, `k→make`, `g→importCost`, `s→save`, `C→revenue`, `n→netHr`, `l→machines`, `r→payHrs`, `B→payDays`, `h→maxStnHrsWk`, `v→plannedStnHrsWk`, `A→binding`, `L→unitsWk`, `F→outCap`). Keep every expression and its order of operations exactly as in the original, so the floating-point results are identical.

- [ ] **Step 4:** `node --test tests/`. Expected: 2 tests pass.
- [ ] **Step 5:** Commit.

---

### Task 4: Readable `index.html`, `css/styles.css`, `js/app.js`

**Files:**
- Create: `css/styles.css`, `js/app.js`
- Modify: `index.html` (replace entirely)

**Interfaces:**
- Consumes: `DATA` and `Calc` globals. Script order in `index.html`: `js/data.js`, `js/calc.js`, `js/picker.js` (Task 5; add the tag in Task 5), `js/app.js`, all with `defer`.
- Produces: the same DOM ids as the original (`item`, `hrs`, `hrsR`, `kOut`, … `po`, `poHint`) so the rendering code carries over unchanged.

- [ ] **Step 1:** Move the original `<style>` contents to `css/styles.css`, one rule per line block with 2-space indent, and fix the `\` line-continuation artefacts (for example, `"IBM Pl\ex Mono"` must read `"IBM Plex Mono"`). Replace the `<style>` in `index.html` with `<link rel="stylesheet" href="css/styles.css">`.
- [ ] **Step 2:** Move the remaining original script (everything after the data/calc setup) to `js/app.js`, inside an IIFE with `"use strict"`. Use `Calc.*` for the calc functions and pass `G` and `S.hrs` explicitly: `Calc.lineCalc(S, G)`, `Calc.rankRow(r, G, S.hrs)`. Un-minify and rename locals in every render function, keeping the logic and output HTML the same. `I[x].im` is now `string[]`, so `(w.im||[]).map(P=>P[0])` becomes `w.im || []`.
- [ ] **Step 3: Verify parity in the browser.** Serve with `python3 -m http.server 8765` in the background. Open `http://localhost:8765/` and the original (`git show 74ea462:index.html > orig.html` in the repo root, never committed; delete after) in two tabs. With the defaults (Pizza, 16h, 7d, 2 ws), compare the KPI texts `#kOut #kSave #kMat #kPay`, the `#mat` and `#rank` table text and the `#po` text via `document.querySelector(...).innerText`. Expected: identical.
- [ ] **Step 4:** `node --test tests/ && python3 -m unittest discover tests`. Expected: all pass. Commit.

---

### Task 5: Searchable product picker

**Files:**
- Create: `js/picker.js`
- Modify: `index.html` (replace `<select id="item">`), `css/styles.css` (picker styles), `js/app.js` (use the picker API)

**Interfaces:**
- Produces: `window.createPicker(rootEl, {groups, value, onChange}) -> {setValue(name)}`, where `groups = [{label, options: string[]}]`.
- Markup the picker renders into `rootEl`:
  `<input id="item" role="combobox" aria-expanded aria-controls="itemList" aria-autocomplete="list" autocomplete="off">` + `<ul id="itemList" role="listbox" hidden>` with `<li role="presentation" class="grp">Food</li>` group headers and `<li role="option" id="opt-N" aria-selected>` options.

Behaviour:
- Focusing or clicking the input opens the full list and selects the input text.
- Typing filters with a case-insensitive substring match on the name and on the family label ("clothing" shows all clothing), and hides empty groups.
- ↓/↑ move `aria-activedescendant` (wrapping) and scroll the active option into view. Enter picks the active option, Escape restores the current value and closes, and so does blur (after a 150ms delay so clicks register).
- Clicking an option picks it (`mousedown` + `preventDefault` so the input doesn't blur first).
- No matches shows `<li class="none">No products match</li>`.
- Picking calls `onChange(name)` and sets the input value to the name.
- `setValue(name)` updates the input without calling `onChange` (used by `syncInputs` and the rankings row click).

- [ ] **Step 1:** Implement `js/picker.js` as an IIFE that defines `window.createPicker`, per the above.
- [ ] **Step 2:** Styles: the list is absolutely positioned under the input, `max-height: min(60vh, 420px)`, `overflow:auto`, uses `var(--panel)`/`var(--line)`, the active option gets `var(--accent-soft)`, and group headers use `var(--display)` and `var(--muted)`. Touch targets are at least 40px tall.
- [ ] **Step 3:** In `app.js`, replace the `<optgroup>` build with `createPicker(document.getElementById("itemPicker"), {groups: Calc.FAMS.map(f => ({label: f, options: Calc.recipes.filter(r => r.fam === f).map(r => r.n).sort((a, b) => a.localeCompare(b))})), value: S.item, onChange: n => { S.item = n; renderAll(true); }})`. In `syncInputs`, call `picker.setValue(S.item)` instead of `$("item").value = ...`.
- [ ] **Step 4: Verify in the browser** (desktop, then `resize_window` to 390×844):
  - "tom" shows Bag of Tomatoes.
  - "clothing" shows the Clothing group.
  - ↓↓ Enter switches the product and the KPIs update.
  - Escape reverts.
  - Clicking a rankings row updates the input.
  - There's no horizontal scroll at 390px.
  - It works in dark mode.
- [ ] **Step 5:** Commit.

---

### Task 6: Footer, meta tags, social image, README

**Files:**
- Modify: `index.html`, `js/app.js` (data line from `DATA.meta`)
- Create: `og.png`, `scripts/og.html`, `README.md`, `.gitignore`

- [ ] **Step 1: Footer.** Add a links row above the existing footer paragraphs:

```html
<p class="links">
  <a href="https://github.com/laugostini20-byte/bigambitions-factoryplanner/issues/new" target="_blank" rel="noopener">Report a wrong number / suggest a feature</a> ·
  <a href="data/BigAmbitions_Items_and_Prices.xlsx" download>Download the spreadsheet</a> ·
  <a href="https://github.com/laugostini20-byte/bigambitions-factoryplanner" target="_blank" rel="noopener">Source on GitHub</a>
</p>
```

Replace the hard-coded "Data pulled … on 2026-09-27" date and the header tag "62 recipes" with values filled from `DATA.meta` in `app.js` (`#dataLine`, `#tagLine`).
- [ ] **Step 2: Social image.** Write `scripts/og.html`: a 1200×630 page using the site's dark palette (`#12181B` background, `#E6A23C` accent, Barlow Condensed), with the title "Factory Line Planner", the subtitle "Big Ambitions · make vs import · all 62 recipes", and the favicon mark enlarged. Render it:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --hide-scrollbars --window-size=1200,630 --screenshot="$PWD/og.png" "file://$PWD/scripts/og.html"
```

Check that `og.png` is 1200×630 (`sips -g pixelWidth -g pixelHeight og.png`) and view it.
- [ ] **Step 3: Meta tags.** Add `<meta property="og:image" content="/og.png">`, `<meta name="twitter:card" content="summary_large_image">` and `<link rel="canonical">`. Task 7 swaps these for absolute URLs once the Vercel domain is known.
- [ ] **Step 4: README.md.** Cover:
  - what the tool is, with the live URL placeholder filled in Task 7;
  - how to run it locally (`python3 -m http.server`);
  - how to update after a game patch (replace the xlsx → `python3 scripts/build_data.py` → `node --test tests/ && python3 -m unittest discover tests` → commit);
  - that the golden test pins the original maths, so change `tests/fixtures/golden.json` deliberately if the formulas change;
  - credits and a "not affiliated with Hovgaard Games" line.
- [ ] **Step 5:** `.gitignore`: `.DS_Store`, `__pycache__/`, `.vercel`.
- [ ] **Step 6:** Browser check: footer links resolve and the xlsx downloads over `http.server`. Commit.

---

### Task 7: Release

- [ ] **Step 1:** Run the full tests and a final browser pass: all three tabs, desktop and 390px, light and dark, the console free of errors (`read_console_messages`).
- [ ] **Step 2:** Show the user the local site and get their OK.
- [ ] **Step 3:** Merge `rework` into `main` (fast-forward) and `git push -u origin main`.
- [ ] **Step 4:** Deploy with the Vercel connector: find the team (`list_teams`), import the GitHub repo as a project with no framework, root `/` and no build command, and deploy. Get the production URL.
- [ ] **Step 5:** Make the `og:image`/`og:url`/`canonical` absolute with the production URL, add the URL to the README, commit, push (auto-deploys) and check the live page and `/og.png`.
- [ ] **Step 6:** Hand the URL to the user for a phone test before they post.
