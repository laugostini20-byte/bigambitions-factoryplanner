/* Factory maths. Pure functions over DATA, shared by the page and the Node tests.
 *
 * g = game settings {skill, wage, pidx, sidx, buf}
 * line = {item, hrs, days, ws}
 * "stn-hr" = one staffed workstation running for one in-game hour.
 */
(function (root) {
  "use strict";

  const DATA = root.DATA;

  const FAMS = ["Food", "Bottled Goods", "Garden", "Consumer Goods", "Clothing", "Jewelry", "Electronics"];

  const machines = DATA.M;

  const items = Object.fromEntries(
    Object.entries(DATA.I).map(([name, v]) => [
      name,
      { imp: v[0], sell: v[1], box: v[2], cap: v[3], sold: v[4], im: v[5] },
    ])
  );

  // A recipe's family is decided by the most specific machine in its chain.
  function family(recipe) {
    const chain = recipe.m.join("|");
    if (chain.includes("Hydroponic")) return "Garden";
    if (chain.includes("Sewing")) return "Clothing";
    if (chain.includes("Polishing")) return "Jewelry";
    if (chain.includes("Kiln")) return "Electronics";
    if (chain.includes("Bottling")) return "Bottled Goods";
    if (chain.includes("Laser")) return "Consumer Goods";
    return "Food";
  }

  const recipes = DATA.R.map(([n, out, m, ins]) => ({ n, out, m, ins }));
  recipes.forEach(r => {
    r.fam = family(r);
    r.chain = r.m.reduce((sum, name) => sum + (machines[name] || 0), 0);
  });

  const byName = Object.fromEntries(recipes.map(r => [r.n, r]));

  // Output multiplier: 50% at skill 0, 100% at skill 100.
  const mult = g => 0.5 + g.skill / 200;

  // What all importers of an item normally sell in a week combined.
  function supplyPerWeek(name) {
    const item = items[name];
    if (!item) return Infinity;
    const importerCount = Math.max(1, (item.im || []).length);
    if (item.cap == null) return Infinity; // no enforced limit
    return item.cap * importerCount;
  }

  function lineCalc(line, g) {
    const recipe = byName[line.item];
    const outPerHr = recipe.out * mult(g);
    const stnHrs = line.hrs * line.days * line.ws;
    const impPrice = (items[recipe.n]?.imp || 0) * g.pidx;
    const sellPrice = (items[recipe.n]?.sell || 0) * g.sidx;

    const mats = recipe.ins.map(([name, qty]) => {
      const item = items[name] || {};
      const price = (item.imp || 0) * g.pidx;
      return {
        n: name,
        q: qty,
        price,
        total: qty * stnHrs,
        cost: qty * price * stnHrs,
        box: item.box || 1,
        im: item.im || [],
        cap: supplyPerWeek(name),
      };
    });

    const matPerHr = mats.reduce((sum, m) => sum + m.q * m.price, 0);
    const units = outPerHr * stnHrs;
    const matCost = matPerHr * stnHrs;
    const labor = g.wage * stnHrs;
    const make = matCost + labor;
    const importCost = units * impPrice;
    const save = importCost - make;
    const revenue = units * sellPrice;
    const netHr = outPerHr * impPrice - matPerHr - g.wage;
    const machineCost = recipe.chain * line.ws;
    const payHrs = netHr > 0 ? recipe.chain / netHr : Infinity;
    const payDays = line.hrs > 0 ? payHrs / line.hrs : Infinity;

    // Station-hours per week the importers can supply before the tightest input runs over.
    const maxStnHrsWk = Math.min(...recipe.ins.map(([name, qty]) => supplyPerWeek(name) / qty));
    const plannedStnHrsWk = line.hrs * Math.min(line.days, 7) * line.ws;
    const binding = recipe.ins
      .map(([name, qty]) => ({ n: name, lim: supplyPerWeek(name) / qty }))
      .sort((a, b) => a.lim - b.lim)[0];
    const unitsWk = outPerHr * plannedStnHrsWk;
    const outCap = supplyPerWeek(recipe.n);

    return {
      r: recipe,
      out: outPerHr,
      stnHrs,
      imp: impPrice,
      sell: sellPrice,
      mats,
      matHr: matPerHr,
      units,
      matCost,
      labor,
      make,
      importCost,
      save,
      revenue,
      netHr,
      machines: machineCost,
      payHrs,
      payDays,
      maxStnHrsWk,
      plannedStnHrsWk,
      binding,
      unitsWk,
      outCap,
      costUnit: units ? make / units : 0,
    };
  }

  // One workstation for a week, used by the Rankings tab.
  function rankRow(recipe, g, hrs) {
    const c = lineCalc({ item: recipe.n, hrs: hrs || 16, days: 7, ws: 1 }, g);
    const costPerUnit = (c.matHr + g.wage) / c.out;
    return {
      r: recipe,
      fam: recipe.fam,
      out: c.out,
      cu: costPerUnit,
      imp: c.imp,
      pct: c.imp ? ((c.imp - costPerUnit) / c.imp) * 100 : 0,
      net: c.netHr,
      chain: recipe.chain,
      pay: c.payDays,
      sup: c.maxStnHrsWk,
      profit: c.out * c.sell - c.matHr - g.wage,
    };
  }

  const Calc = { FAMS, recipes, byName, items, machines, mult, supplyPerWeek, lineCalc, rankRow };
  if (typeof module !== "undefined") module.exports = Calc;
  else root.Calc = Calc;
})(typeof window !== "undefined" ? window : globalThis);
