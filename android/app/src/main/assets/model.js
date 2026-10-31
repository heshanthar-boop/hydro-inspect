const OperatorModel = /* @__PURE__ */ (() => {
  const channels = [
    { key: "cebImport", name: "CEB import", unit: "kWh", factor: 1, color: "#087f86" },
    { key: "cebExport", name: "CEB export", unit: "kWh", factor: 1, color: "#c94c69" },
    { key: "gen1", name: "No.1 generator", unit: "MWh", factor: 1e3, color: "#3479df" },
    { key: "gen2", name: "No.2 generator", unit: "MWh", factor: 1e3, color: "#c78416" },
    { key: "transformer", name: "Transformer", unit: "MWh", factor: 1e3, color: "#8251c8" },
    { key: "lt", name: "LT meter", unit: "kWh", factor: 1, color: "#607889" }
  ];
  const stamp = (r) => {
    var _a, _b;
    return r.capturedAtMillis || (((_a = r.capturedAt) == null ? void 0 : _a.seconds) || ((_b = r.readingAt) == null ? void 0 : _b.seconds)) * 1e3 || Date.parse(r.date + "T" + (r.time || "00:00") + "+05:30");
  };
  const date = (ms) => new Date(ms + 198e5).toISOString().slice(0, 10);
  const time = (ms) => new Date(ms + 198e5).toISOString().slice(0, 19).replace("T", " ");
  const number = (value) => value === "" || value === null || value === void 0 || !Number.isFinite(Number(value)) ? null : Number(value);
  const format = (value) => {
    if (number(value) === null) return "—";
    if (typeof value === "string" && /^[0-9]+(\.[0-9]+)?$/.test(value)) {
      const parts = value.split(".");
      return parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (parts.length > 1 ? "." + parts[1] : "");
    }
    return Number(value).toLocaleString("en-GB", { maximumFractionDigits: 6 });
  };
  function records(state) {
    const map = new Map((state.remote || []).map((r) => [r.id, { ...r, localState: "synced" }]));
    for (const r of state.local || []) if (!map.has(r.id) || r.localState !== "synced") map.set(r.id, r);
    return [...map.values()].filter((r) => !r._deleted && !r.draft && r.plant === "Kumburutheniwela Mini Hydro Power").sort((a, b) => stamp(b) - stamp(a));
  }
  function energy(current, previous, changes = []) {
    var _a, _b;
    const result = {};
    for (const c of channels) {
      const currentValue = number((_a = current.readings) == null ? void 0 : _a[c.key]), previousValue = number((_b = previous.readings) == null ? void 0 : _b[c.key]);
      const meter = { gen1: "gen1Panel", gen2: "gen2Panel", transformer: "transformerPanel", lt: "cebLVPanel" }[c.key];
      const replaced = meter && changes.some((m) => m.channel === meter && date(stamp(previous)) <= m.date && date(stamp(current)) > m.date);
      result[c.key] = replaced || currentValue === null || previousValue === null || currentValue < previousValue ? null : Math.round((currentValue - previousValue) * c.factor * 1e8) / 1e8;
    }
    result.deviation = result.cebImport === null || result.transformer === null ? null : Math.round((result.cebImport - result.transformer) * 1e8) / 1e8;
    return result;
  }
  function intervals(rows, changes = []) {
    return rows.slice(0, -1).map((r, i) => ({ id: r.id, start: stamp(rows[i + 1]), end: stamp(r), values: energy(r, rows[i + 1], changes) })).reverse();
  }
  function aggregate(items, period) {
    if (period === "reading") return items.map((i) => ({ ...i, key: time(i.end), count: 1, counts: Object.entries(i.values).reduce((o, [k, v]) => {
      o[k] = v === null ? 0 : 1;
      return o;
    }, {}) }));
    const groups = /* @__PURE__ */ new Map();
    for (const i of items) {
      let key = date(i.end);
      if (period === "week") {
        const d = /* @__PURE__ */ new Date(key + "T00:00Z");
        d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7);
        key = d.toISOString().slice(0, 10);
      }
      if (period === "month") key = key.slice(0, 7);
      if (period === "year") key = key.slice(0, 4);
      if (!groups.has(key)) groups.set(key, { key, start: i.start, end: i.end, values: {}, counts: {}, count: 0 });
      const g = groups.get(key);
      g.start = Math.min(g.start, i.start);
      g.end = Math.max(g.end, i.end);
      g.count++;
      for (const [k, v] of Object.entries(i.values)) if (v !== null) {
        g.values[k] = (g.values[k] || 0) + v;
        g.counts[k] = (g.counts[k] || 0) + 1;
      }
    }
    return [...groups.values()].sort((a, b) => a.key.localeCompare(b.key));
  }
  return { channels, stamp, date, time, number, format, records, energy, intervals, aggregate };
})();
if (typeof module !== "undefined") module.exports = OperatorModel;
