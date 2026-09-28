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
