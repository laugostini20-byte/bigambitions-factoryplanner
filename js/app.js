/* Page state, rendering and events. The maths lives in calc.js. */
(function () {
  "use strict";

  const { FAMS, recipes, byName, items, machines } = Calc;

  // ---------- formatting helpers ----------

  const $ = id => document.getElementById(id);
  const fmt = n => Math.round(n).toLocaleString("en-US");

  function money(n, decimals) {
    const sign = n < 0 ? "−" : "";
    n = Math.abs(n);
    if (decimals === undefined) decimals = n < 10 ? 2 : 0;
    return sign + "$" + n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }

  // Compact money: $1.23M, $45.6K, $812
  function short(n) {
    const sign = n < 0 ? "−" : "";
    n = Math.abs(n);
    if (n >= 1e6) return sign + "$" + (n / 1e6).toFixed(n >= 1e7 ? 1 : 2) + "M";
    if (n >= 1e4) return sign + "$" + (n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + "K";
    return sign + "$" + Math.round(n).toLocaleString("en-US");
  }

  const shortN = n => (n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e5 ? Math.round(n / 1e3) + "K" : fmt(n));

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  const days = d => (d < 10 ? d.toFixed(1) : fmt(d));

  // ---------- persisted state ----------

  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {}
    },
  };

  // G = game settings, S = the line being planned, RK = rankings view, plan = order sheet lines
  const G = Object.assign({ skill: 100, wage: 25, pidx: 1, sidx: 1, buf: 10 }, store.get("flp3-g", {}));
  const S = Object.assign({ item: "Pizza", hrs: 16, days: 7, ws: 2 }, store.get("flp3-s", {}));
  if (!byName[S.item]) S.item = "Pizza";

  let plan = store.get("flp3-plan", null);
  if (!Array.isArray(plan)) {
    plan = [
      { item: "Pizza", hrs: 16, days: 7, ws: 2 },
      { item: "Salad", hrs: 16, days: 7, ws: 1 },
      { item: "Clothing (Modern Cheap Female)", hrs: 16, days: 7, ws: 1 },
    ];
  }
  plan = plan.filter(line => byName[line.item]);

  const RK = Object.assign({ fam: "All", key: "net", dir: -1 }, store.get("flp3-rk", {}));

  const limits = {
    hrs: [0, 24],
    days: [0, 365],
    ws: [1, 100],
    skill: [0, 100],
    wage: [0, 500],
    pidx: [0.1, 5],
    sidx: [0.1, 5],
    buf: [0, 200],
  };
  const clamp = (n, min, max) => Math.min(max, Math.max(min, isFinite(n) ? n : min));

  const lineCalc = line => Calc.lineCalc(line, G);
  const mult = () => Calc.mult(G);

  // ---------- inputs ----------

  const picker = createPicker($("itemPicker"), {
    groups: FAMS.map(fam => ({
      label: fam,
      options: recipes
        .filter(r => r.fam === fam)
        .map(r => r.n)
        .sort((a, b) => a.localeCompare(b)),
    })),
    value: S.item,
    onChange: name => {
      S.item = name;
      renderAll(true);
    },
  });

  const lineKeys = ["hrs", "days", "ws"];
  const gKeys = ["skill", "wage", "pidx", "sidx", "buf"];

  function syncInputs() {
    picker.setValue(S.item);
    lineKeys.forEach(k => {
      $(k).value = S[k];
      const range = $(k + "R");
      range.value = Math.min(+range.max, S[k]);
    });
    gKeys.forEach(k => ($(k).value = k === "pidx" || k === "sidx" ? (+G[k]).toFixed(2) : G[k]));
    document.querySelectorAll(".chips[data-for]").forEach(group => {
      const k = group.dataset.for;
      group.querySelectorAll(".chip").forEach(chip => chip.setAttribute("aria-pressed", String(+chip.dataset.v == +S[k])));
    });
  }

  // Typing re-renders without rewriting the field (so the caret doesn't jump); blur/change syncs it.
  lineKeys.forEach(k => {
    $(k).addEventListener("input", e => {
      S[k] = clamp(parseFloat(e.target.value), ...limits[k]);
      renderAll(false);
    });
    $(k).addEventListener("change", () => renderAll(true));
    $(k + "R").addEventListener("input", e => {
      S[k] = +e.target.value;
      renderAll(true);
    });
  });

  gKeys.forEach(k => {
    $(k).addEventListener("input", e => {
      G[k] = clamp(parseFloat(e.target.value), ...limits[k]);
      renderAll(false);
    });
    $(k).addEventListener("change", () => renderAll(true));
  });

  document.querySelectorAll(".step").forEach(btn =>
    btn.addEventListener("click", () => {
      const k = btn.dataset.k;
      const target = lineKeys.includes(k) ? S : G;
      target[k] = Math.round(clamp((+target[k] || 0) + +btn.dataset.d, ...limits[k]) * 100) / 100;
      renderAll(true);
    })
  );

  document.querySelectorAll(".chips[data-for]").forEach(group =>
    group.addEventListener("click", e => {
      const chip = e.target.closest(".chip");
      if (!chip) return;
      S[group.dataset.for] = +chip.dataset.v;
      renderAll(true);
    })
  );

  if (window.matchMedia("(min-width:641px)").matches) $("settings").open = true;

  // ---------- tabs ----------

  const tabs = ["plan", "rank", "order"];

  function showTab(name) {
    tabs.forEach(t => {
      $("t-" + t).setAttribute("aria-selected", String(t === name));
      $("p-" + t).hidden = t !== name;
    });
    try {
      sessionStorage.setItem("flp3-tab", name);
    } catch {}
  }

  tabs.forEach(t => $("t-" + t).addEventListener("click", () => showTab(t)));

  document.querySelector(".tabs").addEventListener("keydown", e => {
    if (!["ArrowLeft", "ArrowRight"].includes(e.key)) return;
    const current = tabs.findIndex(t => $("t-" + t).getAttribute("aria-selected") === "true");
    const next = tabs[(current + (e.key === "ArrowRight" ? 1 : 2)) % 3];
    showTab(next);
    $("t-" + next).focus();
  });

  {
    let initial = "plan";
    try {
      initial = sessionStorage.getItem("flp3-tab") || "plan";
    } catch {}
    const hash = (location.hash || "").slice(1);
    if (tabs.includes(hash)) initial = hash;
    showTab(initial);
  }

  // alerts = [[level, html], ...] where level is "good" | "warn" | "bad"
  const alertHTML = alerts =>
    alerts.map(([level, html]) => `<div class="alert ${level}"><span class="dot"></span><div>${html}</div></div>`).join("");

  // ---------- planner tab ----------

  function renderPlanner() {
    const c = lineCalc(S);
    const recipe = c.r;
    const buffer = 1 + G.buf / 100;
    const item = items[recipe.n] || {};

    $("meta").innerHTML =
      `<span class="pill">${recipe.fam}</span><span class="pill amber">${recipe.out}/hr at skill 100</span>` +
      `<span class="pill">Import ${money(c.imp)}</span>` +
      (item.sell ? `<span class="pill">Sells ~${money(c.sell)}</span>` : "");
    $("soldby").textContent = item.sold ? `Sold by: ${item.sold}` : "";

    $("kOut").textContent = shortN(c.units);
    $("kOutF").textContent = `${fmt(c.out * S.ws)}/hr \xB7 ${fmt(c.stnHrs)} stn-hrs`;
    $("kSave").textContent = short(c.save);
    $("kSave").className = "num " + (c.save >= 0 ? "good" : "bad");
    $("kSaveF").textContent = `${money(c.netHr, 0)}/stn-hr net of wage`;
    $("kMat").textContent = short(c.matCost * buffer);
    $("kMatF").textContent = `${c.mats.length} input${c.mats.length > 1 ? "s" : ""} \xB7 +${G.buf}% buffer`;
    $("kPay").textContent = isFinite(c.payDays) ? (c.payDays < 1 ? "<1 day" : days(c.payDays) + " days") : "Never";
    $("kPay").className = "num " + (isFinite(c.payDays) ? "" : "bad");
    $("kPayF").textContent = `${short(c.machines)} of machines`;

    $("formula").innerHTML =
      `<b>${recipe.out}</b>/hr \xD7 <b>${Math.round(mult() * 100)}%</b> skill \xD7 <b>${S.hrs}</b> h/day \xD7 ` +
      `<b>${S.days}</b> days \xD7 <b>${S.ws}</b> station${S.ws != 1 ? "s" : ""} = <b>${fmt(c.units)}</b> ${esc(recipe.n)}`;

    const alerts = [];
    if (c.netHr <= 0) {
      alerts.push([
        "bad",
        `<b>Loses money vs importing.</b> Each workstation-hour costs ${money(c.matHr + G.wage)} but only replaces ${money(c.out * c.imp)} of imports. Lower the wage or raise worker skill.`,
      ]);
    }
    if (c.plannedStnHrsWk > c.maxStnHrsWk + 1e-9) {
      const pctOfSupply = (c.maxStnHrsWk / c.plannedStnHrsWk) * 100;
      alerts.push([
        "warn",
        `<b>Big order for ${esc(c.binding.n)}.</b> This line needs ${Math.round((100 / pctOfSupply) * 100)}% of what the importers normally sell each week. You can still order it, but the extra comes out of their stock, which can cause shortages or raise the price. Watch the price after your first big order.`,
      ]);
    }
    if (c.unitsWk > c.outCap && isFinite(c.outCap)) {
      alerts.push([
        "good",
        `<b>Bigger than a normal import order.</b> This line makes ${fmt(c.unitsWk)} ${esc(recipe.n)} a week, more than the ${fmt(c.outCap)} importers normally sell before their stock runs down.`,
      ]);
    }
    if (G.skill < 100) {
      alerts.push([
        "warn",
        `<b>Skill ${G.skill} costs you output.</b> You pay for full materials but get ${Math.round(mult() * 100)}% of the units. At skill 100 this line would save ${short(c.save + recipe.out * (1 - mult()) * c.stnHrs * c.imp)}.`,
      ]);
    }
    $("alerts").innerHTML = alertHTML(alerts);

    const sign = n => (n >= 0 ? "pos" : "neg");
    $("ledMake").innerHTML = `<h3>Cost to make</h3>
    <div><span>Raw materials</span><span>${money(c.matCost, 0)}</span></div>
    <div><span>Worker wages <span class="sm">(${fmt(c.stnHrs)} h \xD7 ${money(G.wage, 0)})</span></span><span>${money(c.labor, 0)}</span></div>
    <div><span>Total make cost</span><span>${money(c.make, 0)}</span></div>
    <div><span>Materials per unit</span><span>${money(c.units ? c.matCost / c.units : 0, 2)}</span></div>
    <div><span>Wages per unit <span class="sm">(${money(G.wage, 0)}/hr \xF7 ${fmt(c.out)} units/hr)</span></span><span>${money(c.units ? c.labor / c.units : 0, 2)}</span></div>
    <div><span><b>Cost per unit</b></span><span><b>${money(c.costUnit, 2)}</b></span></div>
    <div><span>Same units from importer <span class="sm">(${money(c.imp)} ea)</span></span><span>${money(c.importCost, 0)}</span></div>
    <div class="tot"><span>Saved by making</span><span class="${sign(c.save)}">${money(c.save, 0)}</span></div>`;

    const profitMade = c.revenue - c.make;
    const profitImported = c.revenue - c.importCost;
    const profitPerStnHr = profitMade / Math.max(c.stnHrs, 1);
    $("ledSell").innerHTML = `<h3>If your stores sell it all</h3>
    ${
      c.sell
        ? `<div><span>Revenue <span class="sm">(${money(c.sell)} ea)</span></span><span>${money(c.revenue, 0)}</span></div>
    <div><span>Gross profit if imported</span><span class="${sign(profitImported)}">${money(profitImported, 0)}</span></div>
    <div><span>Gross profit if made</span><span class="${sign(profitMade)}">${money(profitMade, 0)}</span></div>
    <div><span>Margin if made</span><span>${c.revenue ? Math.round((profitMade / c.revenue) * 100) : 0}%</span></div>
    <div class="tot"><span>Profit per workstation-hour</span><span class="${sign(profitPerStnHr)}">${money(profitPerStnHr, 0)}</span></div>`
        : `<div><span>Not sold to customers</span><span>—</span></div><p class="hint">${esc(recipe.n)} is a supply or input item, so only the saving counts.</p>`
    }`;

    renderMaterials(c, buffer);
    renderMachines(c);
  }

  function renderMaterials(c, buffer) {
    const maxTotal = Math.max(...c.mats.map(m => m.total), 1);
    $("matHint").textContent = `Order qty includes ${G.buf}% buffer`;

    let orderSum = 0;
    let costSum = 0;
    let boxSum = 0;
    const rows = c.mats.map(m => {
      const orderQty = m.total * buffer;
      const boxes = Math.ceil(orderQty / m.box);
      const cost = orderQty * m.price;
      orderSum += orderQty;
      costSum += cost;
      boxSum += boxes;
      const shareOfSupply = (m.q * c.plannedStnHrsWk) / m.cap;
      return (
        `<tr><td>${esc(m.n)}<span class="fam">${esc(m.im.join(", "))}</span>` +
        `<div class="bar"><i style="width:${((m.total / maxTotal) * 100).toFixed(1)}%"></i></div></td>` +
        `<td data-label="Per stn-hr">${fmt(m.q)}</td>` +
        `<td data-label="Unit price">${money(m.price)}</td>` +
        `<td data-label="Consumed">${fmt(m.total)}</td>` +
        `<td class="hl" data-label="Order qty">${fmt(orderQty)}</td>` +
        `<td data-label="Boxes">${fmt(boxes)} <span class="fam" style="display:inline">\xD7 ${m.box}</span></td>` +
        `<td data-label="Cost">${money(cost, 0)}</td>` +
        `<td data-label="vs normal weekly order" class="${shareOfSupply > 1 ? "w" : ""}">${isFinite(m.cap) ? Math.round(shareOfSupply * 100) + "% of " + shortN(m.cap) : "n/a"}</td></tr>`
      );
    });

    const shelves = Math.ceil(boxSum / 60);
    $("mat").innerHTML =
      "<thead><tr><th>Input</th><th>Per stn-hr</th><th>Unit price</th><th>Consumed</th><th>Order qty</th><th>Boxes</th><th>Cost</th><th>vs normal weekly order</th></tr></thead><tbody>" +
      rows.join("") +
      `<tr class="total"><td>Total</td><td></td><td></td><td></td><td class="hl" data-label="Order qty">${fmt(orderSum)}</td>` +
      `<td data-label="Boxes">${fmt(boxSum)}</td><td data-label="Cost">${money(costSum, 0)}</td>` +
      `<td data-label="Pallet shelves">${shelves} shelf${shelves != 1 ? "s" : ""}</td></tr></tbody>`;
  }

  function renderMachines(c) {
    const recipe = c.r;
    $("mach").innerHTML =
      "<thead><tr><th>Machine</th><th>Each</th><th>Qty</th><th>Cost</th></tr></thead><tbody>" +
      recipe.m
        .map(
          name =>
            `<tr><td>${esc(name)}</td><td data-label="Each">${money(machines[name], 0)}</td><td data-label="Qty">${S.ws}</td><td data-label="Cost">${money(machines[name] * S.ws, 0)}</td></tr>`
        )
        .join("") +
      `<tr class="total"><td>Total</td><td data-label="Chain">${money(recipe.chain, 0)}</td><td></td><td data-label="Cost">${money(c.machines, 0)}</td></tr></tbody>`;
  }

  // ---------- rankings tab ----------

  // [key, header, default sort direction]
  const COLS = [
    ["n", "Product", 1],
    ["out", "Out / hr", -1],
    ["cu", "Make $/unit", 1],
    ["imp", "Import $", -1],
    ["pct", "Saving %", -1],
    ["net", "Net saved / stn-hr", -1],
    ["profit", "Profit / stn-hr if sold", -1],
    ["chain", "Machine chain", 1],
    ["pay", "Payback", 1],
    ["sup", "Hrs/wk before big order", -1],
  ];

  $("famChips").innerHTML = ["All", ...FAMS].map(f => `<button class="chip" data-f="${f}">${f}</button>`).join("");
  $("famChips").addEventListener("click", e => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    RK.fam = chip.dataset.f;
    renderRank();
  });

  $("rankSort").innerHTML = COLS.map(([key, label]) => `<option value="${key}">${label}</option>`).join("");
  $("rankSort").addEventListener("change", e => {
    const col = COLS.find(c => c[0] === e.target.value);
    RK.key = col[0];
    RK.dir = col[2];
    renderRank();
  });

  function renderRank() {
    store.set("flp3-rk", RK);
    document.querySelectorAll("#famChips .chip").forEach(chip => chip.setAttribute("aria-pressed", String(chip.dataset.f === RK.fam)));
    $("rankSort").value = RK.key;

    const rows = recipes.filter(r => RK.fam === "All" || r.fam === RK.fam).map(r => Calc.rankRow(r, G, S.hrs));
    const sortVal = v => (v === Infinity ? 1e15 : v);
    rows.sort((a, b) =>
      RK.key === "n" ? a.r.n.localeCompare(b.r.n) * RK.dir : (sortVal(a[RK.key]) - sortVal(b[RK.key])) * RK.dir
    );
    const maxNet = Math.max(...rows.map(r => r.net), 1);

    $("rankHint").textContent = `Per workstation at skill ${G.skill}, wage ${money(G.wage, 0)}/hr, import index ${(+G.pidx).toFixed(2)}. Payback assumes ${S.hrs} h/day. Tap a row to open it in the planner.`;

    const head = COLS.map(
      ([key, label]) =>
        `<th class="sort" data-k="${key}" ${RK.key === key ? `aria-sort="${RK.dir < 0 ? "descending" : "ascending"}"` : ""}>${label}</th>`
    ).join("");

    const body = rows
      .map(row => {
        const pay = isFinite(row.pay) ? days(row.pay) + " d" : "never";
        const sup = row.sup >= 168 * 50 ? "no limit" : fmt(row.sup);
        const sells = items[row.r.n]?.sell;
        return (
          `<tr tabindex="0" data-n="${esc(row.r.n)}"><td>${esc(row.r.n)}<span class="fam">${row.fam}</span></td>` +
          `<td data-label="Out / hr">${fmt(row.out)}</td>` +
          `<td data-label="Make $/unit">${money(row.cu, 2)}</td>` +
          `<td data-label="Import $">${money(row.imp, 2)}</td>` +
          `<td data-label="Saving %" class="${row.pct < 0 ? "r" : ""}">${Math.round(row.pct)}%</td>` +
          `<td data-label="Net saved / stn-hr" class="${row.net < 0 ? "r" : "g"}"><span class="rankbar">${money(row.net, 0)}<span class="bar"><i style="width:${Math.max(0, (row.net / maxNet) * 100).toFixed(1)}%"></i></span></span></td>` +
          `<td data-label="Profit / stn-hr if sold">${sells ? money(row.profit, 0) : "—"}</td>` +
          `<td data-label="Machine chain">${short(row.chain)}</td>` +
          `<td data-label="Payback" class="${isFinite(row.pay) ? "" : "r"}">${pay}</td>` +
          `<td data-label="Hrs/wk before big order" class="${row.sup < S.hrs * 7 ? "w" : ""}">${sup}</td></tr>`
        );
      })
      .join("");

    $("rank").innerHTML = `<thead><tr>${head}</tr></thead><tbody>${body}</tbody>`;
  }

  $("rank").addEventListener("click", e => {
    const th = e.target.closest("th.sort");
    if (th) {
      const col = COLS.find(c => c[0] === th.dataset.k);
      if (RK.key === col[0]) RK.dir *= -1;
      else {
        RK.key = col[0];
        RK.dir = col[2];
      }
      renderRank();
      return;
    }
    const tr = e.target.closest("tr[data-n]");
    if (!tr) return;
    S.item = tr.dataset.n;
    renderAll(true);
    showTab("plan");
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  $("rank").addEventListener("keydown", e => {
    if (e.key !== "Enter") return;
    const tr = e.target.closest("tr[data-n]");
    if (tr) tr.click();
  });

  // ---------- order sheet tab ----------

  function renderOrder() {
    store.set("flp3-plan", plan);
    $("ordCount").textContent = plan.length;
    const buffer = 1 + G.buf / 100;

    if (!plan.length) {
      ["oUnits", "oMat", "oSave", "oMach"].forEach(id => ($(id).textContent = "0"));
      ["oUnitsF", "oMatF", "oSaveF", "oMachF"].forEach(id => ($(id).textContent = ""));
      $("lines").innerHTML =
        '<tbody><tr><td class="empty" style="font-family:var(--body)">No lines yet. Set up a product in the Planner and press Add to order sheet.</td></tr></tbody>';
      $("po").innerHTML = "";
      $("oAlerts").innerHTML = "";
      return;
    }

    const calcs = plan.map(lineCalc);
    let units = 0;
    let matOrder = 0;
    let saved = 0;
    let machineCost = 0;
    let wages = 0;
    let stations = 0;
    const inputs = {}; // ingredient name -> combined totals across lines

    calcs.forEach((c, i) => {
      units += c.units;
      matOrder += c.matCost * buffer;
      saved += c.save;
      machineCost += c.machines;
      wages += c.labor;
      stations += plan[i].ws;
      c.mats.forEach(m => {
        const agg = inputs[m.n] || (inputs[m.n] = { n: m.n, total: 0, wk: 0, price: m.price, box: m.box, im: m.im, cap: m.cap });
        agg.total += m.total;
        agg.wk += m.q * c.plannedStnHrsWk;
      });
    });

    $("oUnits").textContent = shortN(units);
    $("oUnitsF").textContent = `${plan.length} line${plan.length != 1 ? "s" : ""} \xB7 ${stations} stations`;
    $("oMat").textContent = short(matOrder);
    $("oMatF").textContent = `incl. ${G.buf}% buffer`;
    $("oSave").textContent = short(saved);
    $("oSave").className = "num " + (saved >= 0 ? "good" : "bad");
    $("oSaveF").textContent = `after ${short(wages)} wages`;
    $("oMach").textContent = short(machineCost);
    const runsToPayBack = saved > 0 ? machineCost / saved : Infinity;
    $("oMachF").textContent = isFinite(runsToPayBack)
      ? `paid back after ~${days(runsToPayBack)} runs of this sheet`
      : "doesn't pay back";

    $("lines").innerHTML =
      "<thead><tr><th>Product</th><th>Run</th><th>Units</th><th>Make cost</th><th>Saved</th><th>Payback</th><th></th></tr></thead><tbody>" +
      calcs
        .map((c, i) => {
          const line = plan[i];
          return (
            `<tr><td>${esc(line.item)}<span class="fam">${c.r.fam}</span></td>` +
            `<td data-label="Run">${line.hrs}h \xD7 ${line.days}d \xD7 ${line.ws}</td>` +
            `<td data-label="Units">${fmt(c.units)}</td>` +
            `<td data-label="Make cost">${money(c.make, 0)}</td>` +
            `<td data-label="Saved" class="${c.save < 0 ? "r" : "g"}">${money(c.save, 0)}</td>` +
            `<td data-label="Payback">${isFinite(c.payDays) ? days(c.payDays) + " d" : "never"}</td>` +
            `<td class="act"><button class="x" data-i="${i}" aria-label="Remove ${esc(line.item)}">\xD7</button></td></tr>`
          );
        })
        .join("") +
      `<tr class="total"><td>All lines</td><td></td><td data-label="Units">${fmt(units)}</td>` +
      `<td data-label="Make cost">${money(calcs.reduce((sum, c) => sum + c.make, 0), 0)}</td>` +
      `<td data-label="Saved" class="${saved < 0 ? "r" : "g"}">${money(saved, 0)}</td><td></td><td></td></tr></tbody>`;

    const byImporter = {};
    Object.values(inputs).forEach(input => {
      const importer = input.im[0] || "No importer";
      (byImporter[importer] = byImporter[importer] || []).push(input);
    });

    const alerts = [];
    const overSupply = Object.values(inputs).filter(input => input.wk > input.cap + 1e-9);
    if (overSupply.length) {
      alerts.push([
        "warn",
        `<b>Above importers' normal weekly amounts:</b> ${overSupply.map(input => `${esc(input.n)} (${fmt(input.wk)} a week vs ${fmt(input.cap)} normal)`).join("; ")}. You can still order these. The extra draws down importer stock, which can cause shortages or raise prices.`,
      ]);
    }
    const losing = calcs.filter(c => c.netHr <= 0);
    if (losing.length) {
      alerts.push(["warn", `<b>Cheaper to import:</b> ${losing.map(c => esc(c.r.n)).join(", ")} at your current wage and skill.`]);
    }
    $("oAlerts").innerHTML = alertHTML(alerts);

    let boxTotal = 0;
    $("po").innerHTML = Object.entries(byImporter)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([importer, list]) => {
        list.sort((a, b) => b.total * b.price - a.total * a.price);
        let importerCost = 0;
        const rows = list
          .map(input => {
            const orderQty = input.total * buffer;
            const boxes = Math.ceil(orderQty / input.box);
            const cost = orderQty * input.price;
            importerCost += cost;
            boxTotal += boxes;
            const share = input.wk / input.cap;
            return (
              `<tr><td>${esc(input.n)}${input.im.length > 1 ? `<span class="fam">also: ${esc(input.im.slice(1).join(", "))}</span>` : ""}` +
              `<div class="bar ${share > 1 ? "over" : ""}"><i style="width:${Math.min(100, share * 100).toFixed(1)}%"></i></div></td>` +
              `<td data-label="Order qty" class="hl">${fmt(orderQty)}</td>` +
              `<td data-label="Boxes">${fmt(boxes)}</td>` +
              `<td data-label="Unit price">${money(input.price)}</td>` +
              `<td data-label="Cost">${money(cost, 0)}</td>` +
              `<td data-label="vs normal weekly order" class="${share > 1 ? "w" : ""}">${Math.round(share * 100)}%</td></tr>`
            );
          })
          .join("");
        return (
          `<div class="imp-group"><div class="head"><h3>${esc(importer)}</h3><span class="pill amber">${money(importerCost, 0)}</span></div>` +
          `<div class="tablewrap"><table class="cards"><thead><tr><th>Input</th><th>Order qty</th><th>Boxes</th><th>Unit price</th><th>Cost</th><th>vs normal weekly order</th></tr></thead><tbody>${rows}</tbody></table></div></div>`
        );
      })
      .join("");
    $("poHint").textContent = `${fmt(boxTotal)} boxes \xB7 ~${Math.ceil(boxTotal / 60)} pallet shelves`;
  }

  $("lines").addEventListener("click", e => {
    const btn = e.target.closest(".x");
    if (!btn) return;
    plan.splice(+btn.dataset.i, 1);
    renderOrder();
  });

  $("add").addEventListener("click", () => {
    plan.push({ item: S.item, hrs: S.hrs, days: S.days, ws: S.ws });
    renderOrder();
    const btn = $("add");
    btn.textContent = `Added (${plan.length} lines)`;
    setTimeout(() => (btn.textContent = "Add to order sheet"), 1400);
  });

  $("clear").addEventListener("click", () => {
    plan = [];
    renderOrder();
  });

  // ---------- render ----------

  function renderAll(syncFields) {
    if (syncFields) syncInputs();
    store.set("flp3-g", G);
    store.set("flp3-s", S);
    $("setSum").innerHTML =
      `<span class="pill">Skill ${G.skill}</span><span class="pill">Wage ${money(G.wage, 0)}/hr</span>` +
      `<span class="pill">Import \xD7${(+G.pidx).toFixed(2)}</span><span class="pill">Sell \xD7${(+G.sidx).toFixed(2)}</span>` +
      `<span class="pill">Buffer ${G.buf}%</span>`;
    renderPlanner();
    renderRank();
    renderOrder();
  }

  const meta = DATA.meta;
  $("tagLine").textContent = `1.0 game data \xB7 ${meta.recipes} recipes`;
  $("dataLine").textContent = `Data pulled from the Big Ambitions 1.0 game files (items, importers, recipes, equipment) on ${meta.pulled}.`;

  renderAll(true);
})();
