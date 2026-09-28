# Factory Planner: public release

Goal: turn the single minified `index.html` into a maintainable static site that
can be posted to r/BigAmbitions, then push to GitHub and deploy on Vercel.

Out of scope for this release: multi-step recipes (making your own
tomatoes/lettuce), shareable plan links.

## Structure

```
index.html                     markup only
css/styles.css                 styles, unminified
js/data.js                     GENERATED from the xlsx — do not edit
js/app.js                      app logic, unminified, readable names
data/BigAmbitions_Items_and_Prices.xlsx
scripts/build_data.py          xlsx -> js/data.js
og.png                         1200x630 social preview
README.md                      what it is, how to update after a game patch
```

Plain static files, no framework, no build step at deploy time. Vercel serves
the repo root as-is.

## Data pipeline

`scripts/build_data.py` (Python 3 + openpyxl) reads only raw input columns:

- Items: name, import price, avg sell price, units per box, max weekly order,
  sold-by, importers.
- Recipes: output item, output/hour, machines.
- Recipe Ingredients: output item, ingredient, qty/hour.
- Furniture & Equipment: purchase price for each machine used by a recipe.

It writes `js/data.js` with `window.DATA = {R, I, M, meta}` in the same shape the
current app uses (`R: [name, out, machines[], [[ingredient, qty]]]`,
`I: {name: [imp, sell, box, cap, soldBy, importers[]]}`, `M: {machine: price}`),
plus `meta: {gameVersion, pulled}`.

Only items referenced by a recipe (as output or input) are included, matching
the current 121-item set.

Acceptance: the generated data is deep-equal to the data embedded in the
original `index.html`.

## Behaviour

The logic is un-minified, not rewritten. All calculations (line calc, rankings,
order sheet, alerts, localStorage keys `flp3-*`) stay identical so existing
visitors keep their saved settings.

Acceptance: for a fixed set of inputs, Planner KPIs, Rankings table, and Order
sheet render the same numbers before and after.

## Additions

1. **Searchable product picker**: a text combobox replacing the `<select>`.
   Type-to-filter, results grouped by family, arrow keys + Enter, Escape
   closes, works on touch. ARIA combobox/listbox pattern.
2. **Footer links**: "Report a wrong number / suggest a feature" goes to GitHub
   Issues, plus "Download the spreadsheet", "Source on GitHub" and a
   data version line generated from `meta`.
3. **Social preview**: `og.png` (1200x630), plus `og:image`, `og:url` and
   `twitter:card` meta tags with the absolute Vercel URL.
4. **Polish**: fix edge cases found while refactoring (0 hours/days, empty
   states) and keep light/dark themes and mobile layout working.

## Release

Work on branch `rework`. The user checks it locally, then it merges to `main`,
gets pushed to `origin` (public repo `laugostini20-byte/bigambitions-factoryplanner`)
and is deployed to Vercel through the connector. The user smoke-tests on
the live URL before posting.
