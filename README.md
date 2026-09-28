# Big Ambitions Factory Line Planner

A free, fan-made calculator for the factory side of [Big Ambitions](https://store.steampowered.com/app/1331550/Big_Ambitions/): is it cheaper to make it or import it?

**Live:** _coming soon_

Pick any of the 62 factory recipes and see:

- output for your worker skill, hours, days and workstation count
- raw material quantities, boxes and cost, with an order buffer
- make cost vs import cost, profit if your stores sell it all
- machine chain cost and payback time
- a warning when an order will outrun what importers normally stock each week
- a ranking of every recipe, and an order sheet that combines several lines into one purchase order grouped by importer

Prices, recipes and machine costs come straight from the 1.0 game files. The full extract is in
[`data/BigAmbitions_Items_and_Prices.xlsx`](data/BigAmbitions_Items_and_Prices.xlsx).

## Found a wrong number?

[Open an issue](https://github.com/laugostini20-byte/bigambitions-factoryplanner/issues/new) with the product, your settings and what you see in game.

## Running locally

It's a static site with no build step:

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

## Updating after a game patch

1. Replace `data/BigAmbitions_Items_and_Prices.xlsx` with a fresh extract. Keep the same sheet and column layout.
2. Regenerate the data file:
   ```sh
   pip install openpyxl   # first time only
   python3 scripts/build_data.py
   ```
3. Run the tests:
   ```sh
   node --test tests/*.test.js
   python3 -m unittest discover tests
   ```
   `tests/test_build_data.py` and `tests/calc.test.js` compare against fixtures captured from the original 1.0 page (`tests/fixtures/`). After a patch that really changes prices or recipes, these will fail by design. Check the differences are the ones you expect, then refresh the fixtures.
4. Commit and push. Vercel redeploys automatically.

## Project layout

| Path | What it is |
|---|---|
| `index.html` | Page markup |
| `css/styles.css` | Styles (light and dark themes) |
| `js/data.js` | **Generated** by `scripts/build_data.py`. Don't edit by hand |
| `js/calc.js` | The factory maths (pure functions, tested in Node) |
| `js/picker.js` | Searchable product picker |
| `js/app.js` | State, rendering and events |
| `scripts/og.html` | Source for the `og.png` social preview (render command inside) |

## How the numbers work

Each staffed workstation runs its recipe once per in-game hour. Output = recipe amount × (skill ÷ 2 + 50)%, and materials are always the full recipe amount. Savings = what the same units would cost from an importer, minus materials and the worker's wage. Machine payback assumes one full machine chain per workstation and ignores rent, conveyors and shelving.

---

Fan-made and free. Not affiliated with Hovgaard Games.
