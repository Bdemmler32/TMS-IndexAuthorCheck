/* TMS Index Author Check v0.01 */
var APP_VERSION = "0.01";
// CORE-START
var IC = (function () {
  var PARTICLES = /^(van|von|der|den|de|del|della|di|da|dos|das|du|la|le|ter|ten|zu|af|al|el|bin|ibn|st)$/;
  var SUFFIX = /^(jr|sr|ii|iii|iv|v)\.?$/i;

  function decodeBuffer(buf) {
    var b = new Uint8Array(buf);
    if (b[0] === 0xFF && b[1] === 0xFE) return new TextDecoder("utf-16le").decode(b.subarray(2));
    if (b[0] === 0xFE && b[1] === 0xFF) return new TextDecoder("utf-16be").decode(b.subarray(2));
    var z = 0, lim = Math.min(b.length, 4000);
    for (var i = 1; i < lim; i += 2) if (b[i] === 0) z++;
    if (z > lim / 8) return new TextDecoder("utf-16le").decode(b);
    try { return new TextDecoder("utf-8", { fatal: true }).decode(b).replace(/^﻿/, ""); }
    catch (e) {
      var head = String.fromCharCode.apply(null, b.subarray(0, 16));
      return new TextDecoder(/ASCII-MAC/.test(head) ? "macintosh" : "windows-1252").decode(b);
    }
  }

  function unesc(s) { return s.replace(/\\(.)/g, "$1"); }
  function stripTags(s) {
    var prev;
    do { prev = s; s = s.replace(/<(?:\\.|[^<>\\])*>/g, ""); } while (s !== prev);
    return unesc(s).replace(/\s+/g, " ").trim();
  }
  function noMarks(s) { return s.normalize("NFD").replace(/[̀-ͯ]/g, ""); }
  function foldS(s) {
    return noMarks(s.toLowerCase()).replace(/ß/g, "ss").replace(/æ/g, "ae").replace(/œ/g, "oe").replace(/ø/g, "o").replace(/ł/g, "l").replace(/đ|ð/g, "d")
      .replace(/[^a-z\s]/g, "").replace(/\s+/g, " ").trim();
  }
  function foldL(s) { return foldS(s).replace(/ /g, ""); }

  function scanMarkers(line) {
    var out = [], i = 0;
    while ((i = line.indexOf("<Idx:=", i)) >= 0) {
      var depth = 0, j = i;
      for (; j < line.length; j++) {
        var c = line.charAt(j);
        if (c === "\\") { j++; continue; }
        if (c === "<") depth++;
        else if (c === ">") { depth--; if (depth === 0) break; }
      }
      var inner = line.slice(i, j + 1);
      var m = /<IdxEnDispStr:((?:\\.|[^>\\])*)>/.exec(inner);
      if (m) out.push({ start: i, end: j + 1, disp: unesc(m[1]).replace(/\s+/g, " ").trim() });
      i = j + 1;
    }
    return out;
  }

  function printedNames(after) {
    var s = after.replace(/<cp:Superscript>([\s\S]*?)<cp:>/g, function (m, x) { return "\u0001" + stripTags(x) + "\u0002"; });
    s = stripTags(s);
    var parts = s.split(";"), out = [];
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i].trim();
      if (!p) continue;
      if (p.charAt(0) === "\u0001") break;                 // affiliations start with a superscript
      p = p.replace(/\u0001[^\u0002]*\u0002/g, "").trim();
      var c = p.indexOf(",");
      if (c > 0 && !SUFFIX.test(p.slice(c + 1).trim())) p = p.slice(0, c).trim();  // "Name, Affiliation"
      if (p && p.length < 80) out.push(p);
    }
    return out;
  }

  function splitDisp(d) {
    var c = d.indexOf(",");
    return { last: (c < 0 ? d : d.slice(0, c)).trim(), first: (c < 0 ? "" : d.slice(c + 1)).trim() };
  }

  // first-name part of a printed name, given the tag's folded last name
  function firstPart(printed, lastFolded) {
    var f = " " + foldS(printed) + " ", k = f.indexOf(" " + lastFolded + " ");
    return (k >= 0 ? f.slice(0, k) : f).replace(/\s+/g, "");
  }

  function parse(text) {
    text = text.replace(/\r\n?/g, "\n").replace(/<0x([0-9A-Fa-f]{4,6})>/g, function (m, h) { return String.fromCodePoint(parseInt(h, 16)); });
    var lines = text.split("\n");
    var entries = {}, order = [], untagged = [], context = "", markers = 0, paras = 0;

    for (var li = 0; li < lines.length; li++) {
      var line = lines[li];
      var styleM, style = "", re = /<pstyle:((?:\\.|[^>\\])*)>/g;
      while ((styleM = re.exec(line))) style = unesc(styleM[1]);
      var mk = scanMarkers(line);
      if (!mk.length) {
        if (/title/i.test(style)) { var t = stripTags(line); if (t) context = t; }
        continue;
      }
      paras++;
      var before = stripTags(line.slice(0, mk[0].start)).replace(/[:\s]+$/, "");
      if (before.length > 110) before = before.slice(0, 107) + "…";
      var names = printedNames(line.slice(mk[mk.length - 1].end));
      var folded = names.map(function (n) { return " " + foldS(n) + " "; });
      var lastsHere = [];

      for (var k = 0; k < mk.length; k++) {
        markers++;
        var d = mk[k].disp;
        if (!d) continue;
        var sp = splitDisp(d);
        var fl = foldS(sp.last), fi = foldL(sp.first).charAt(0);
        lastsHere.push(fl);
        var printed = null, alt = null;
        if (fl) for (var n = 0; n < names.length; n++) {
          if (folded[n].indexOf(" " + fl + " ") < 0) continue;
          if (!fi || folded[n].charAt(1) === fi) { printed = names[n]; break; }
          if (!alt) alt = names[n];
        }
        if (!printed) printed = alt;
        if (!entries.hasOwnProperty(d)) { entries[d] = { disp: d, last: sp.last, first: sp.first, occ: [] }; order.push(d); }
        entries[d].occ.push({ line: li + 1, printed: printed, context: context, where: before, names: names.length });
      }
      for (var n2 = 0; n2 < names.length; n2++) {
        var hit = false;
        for (var q = 0; q < lastsHere.length; q++) if (lastsHere[q] && folded[n2].indexOf(" " + lastsHere[q] + " ") >= 0) { hit = true; break; }
        if (!hit) untagged.push({ name: names[n2], line: li + 1, context: context, where: before });
      }
    }
    var list = order.map(function (k) { return entries[k]; });
    list.sort(function (a, b) { return a.disp.localeCompare(b.disp, undefined, { sensitivity: "base" }); });
    list.forEach(function (e) {
      var fl = foldS(e.last), m = {};
      e.occ.forEach(function (o) { if (o.printed) { var f = firstPart(o.printed, fl); if (f) (m[f] = m[f] || []).push(o.printed); } });
      e.firsts = m;                                       // folded first name -> printed names
    });
    return { entries: list, untagged: untagged, markers: markers, paragraphs: paras };
  }

  function lev(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    var prev = [], cur, i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur = [i]; var rowMin = i;
      for (j = 1; j <= b.length; j++) {
        var v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1));
        cur[j] = v; if (v < rowMin) rowMin = v;
      }
      if (rowMin > max) return max + 1;
      prev = cur;
    }
    return prev[b.length];
  }
  // Two folded first names that could be the same person: Matt/Matthew, Mrityunjay/Mritunjay, J/Jieun
  function sameFirst(a, b) {
    if (a === b) return true;
    if (!a || !b) return false;
    if (a.length === 1 || b.length === 1) return a.charAt(0) === b.charAt(0);
    var ml = Math.min(a.length, b.length);
    if (ml >= 3 && (a.indexOf(b) === 0 || b.indexOf(a) === 0)) return true;
    if (ml >= 5) { var mx = ml >= 8 ? 2 : 1; return lev(a, b, mx) <= mx; }
    return false;
  }
  function tokens(s) { return foldS(s).split(" ").filter(function (t) { return t && !SUFFIX.test(t); }); }
  function initialsCompatible(f1, f2) {
    var a = tokens(f1), b = tokens(f2);
    if (!a.length || !b.length) return false;
    if (a.length === 1 && a[0].length <= 3 && f1.replace(/[^A-Za-z]/g, "") === f1.replace(/[^A-Za-z]/g, "").toUpperCase()) a = a[0].split("");
    if (b.length === 1 && b[0].length <= 3 && f2.replace(/[^A-Za-z]/g, "") === f2.replace(/[^A-Za-z]/g, "").toUpperCase()) b = b[0].split("");
    var m = Math.min(a.length, b.length);
    for (var i = 0; i < m; i++) {
      if (a[i] === b[i]) continue;
      if ((a[i].length === 1 || b[i].length === 1) && a[i].charAt(0) === b[i].charAt(0)) continue;
      return false;
    }
    return true;
  }
  function firstLetter(s) { var m = s.match(/\p{L}/u); return m ? m[0] : ""; }
  function isLower(ch) { return ch !== ch.toUpperCase() && ch === ch.toLowerCase(); }

  function UF(n) {
    var p = []; for (var i = 0; i < n; i++) p[i] = i;
    function f(x) { while (p[x] !== x) { p[x] = p[p[x]]; x = p[x]; } return x; }
    return {
      union: function (a, b) { a = f(a); b = f(b); if (a !== b) p[b] = a; },
      groups: function (only) {
        var m = {}, out = [];
        (only || Array.apply(null, { length: n }).map(function (_, i) { return i; })).forEach(function (i) { var r = f(i); (m[r] = m[r] || []).push(i); });
        for (var k in m) if (m[k].length > 1) out.push(m[k]);
        return out;
      }
    };
  }

  // cluster first names of one tag into people
  function people(firsts) {
    var keys = Object.keys(firsts), uf = UF(keys.length), i, j;
    for (i = 0; i < keys.length; i++) for (j = i + 1; j < keys.length; j++) if (sameFirst(keys[i], keys[j])) uf.union(i, j);
    var all = uf.groups(), seen = {};
    all.forEach(function (g) { g.forEach(function (x) { seen[x] = true; }); });
    for (i = 0; i < keys.length; i++) if (!seen[i]) all.push([i]);
    return all.map(function (g) {
      var names = {}, count = 0;
      g.forEach(function (x) { firsts[keys[x]].forEach(function (p) { names[p] = (names[p] || 0) + 1; count++; }); });
      return { keys: g.map(function (x) { return keys[x]; }), names: names, count: count };
    });
  }

  function analyse(data, opt) {
    var E = data.entries, n = E.length, i, j;
    var r = { lower: [], particles: [], caps: [], A: [], B: [], C: [], D: [], E: [], F: [], unmatched: [], untagged: data.untagged };
    var keyOf = E.map(function (e) { return foldL(e.disp); });
    var lastOf = E.map(function (e) { return foldL(e.last); });
    var iniOf = E.map(function (e) { return foldL(e.first).charAt(0); });
    var firstKeys = E.map(function (e) { return Object.keys(e.firsts); });

    // With the setting on, two tags only group together if their printed first names could be the same person
    function compatible(x, y) {
      if (!opt.skipDiffFirst) return true;
      var a = firstKeys[x], b = firstKeys[y];
      if (!a.length || !b.length) return true;                 // nothing to compare: keep flagged
      for (var p = 0; p < a.length; p++) for (var q = 0; q < b.length; q++) if (sameFirst(a[p], b[q])) return true;
      return false;
    }

    for (i = 0; i < n; i++) {
      var e = E[i];
      var lc = firstLetter(e.last), fc = firstLetter(e.first);
      var lowLast = lc && isLower(lc), lowFirst = fc && isLower(fc);
      if (lowLast || lowFirst) {
        var why = lowLast && lowFirst ? "last + first" : lowLast ? "last name" : "first initial";
        var w0 = foldS(e.last).split(" ");
        var particle = lowLast && !lowFirst && w0.length > 1 && PARTICLES.test(w0[0]);
        (particle ? r.particles : r.lower).push({ items: [i], why: particle ? "" : why });
      }
      var letters = (e.last.match(/\p{L}/gu) || []).join("");
      if (letters.length >= 2 && letters === letters.toUpperCase() && letters !== letters.toLowerCase()) r.caps.push({ items: [i] });
      var un = e.occ.filter(function (o) { return !o.printed && o.names > 0; });
      if (un.length) r.unmatched.push({ items: [i], note: un.length === e.occ.length ? "never matched" : un.length + " of " + e.occ.length + " not matched" });

      // E / F: what the printed first names under one tag look like
      var ppl = people(e.firsts);
      if (ppl.length > 1) r.F.push({ items: [i], people: ppl });
      var variants = ppl.filter(function (p) { return p.keys.length > 1; });
      if (variants.length) r.E.push({ items: [i], variants: variants });
    }

    // A: same after folding case, accents, punctuation, spacing
    var byKey = {};
    for (i = 0; i < n; i++) (byKey[keyOf[i]] = byKey[keyOf[i]] || []).push(i);
    var ufA = UF(n);
    for (var k in byKey) {
      var g = byKey[k];
      for (i = 0; i < g.length; i++) for (j = i + 1; j < g.length; j++) if (compatible(g[i], g[j])) ufA.union(g[i], g[j]);
    }
    r.A = ufA.groups().map(function (g) { return { items: g }; });

    // B, C: pairwise within first-letter buckets
    var ufB = UF(n), ufC = UF(n), buckets = {};
    for (i = 0; i < n; i++) { var bk = lastOf[i].charAt(0) || "#"; (buckets[bk] = buckets[bk] || []).push(i); }
    var minLen = opt.shortNames ? 3 : 6;
    for (var b in buckets) {
      var L = buckets[b];
      for (i = 0; i < L.length; i++) for (j = i + 1; j < L.length; j++) {
        var x = L[i], y = L[j];
        if (keyOf[x] === keyOf[y]) continue;
        if (lastOf[x] === lastOf[y]) {
          if (initialsCompatible(E[x].first, E[y].first)) { if (compatible(x, y)) ufC.union(x, y); }
          else if (iniOf[x] === iniOf[y] && foldL(E[x].first).length > 1 && foldL(E[y].first).length > 1 &&
                   lev(foldL(E[x].first), foldL(E[y].first), 2) <= 2 && compatible(x, y)) ufB.union(x, y);
          continue;
        }
        if (iniOf[x] !== iniOf[y]) continue;
        var la = lastOf[x], lb = lastOf[y], len = Math.max(la.length, lb.length);
        if (len < minLen) continue;
        var max = len >= 8 ? 2 : 1;
        if (lev(la, lb, max) <= max && compatible(x, y)) ufB.union(x, y);
      }
    }
    r.B = ufB.groups().map(function (g) { return { items: g }; });
    r.C = ufC.groups().map(function (g) { return { items: g }; });

    // D: same printed author, different tags
    var byPrinted = {};
    for (i = 0; i < n; i++) E[i].occ.forEach(function (o) {
      if (!o.printed) return;
      var pk = foldS(o.printed);
      var s = byPrinted[pk] || (byPrinted[pk] = { name: o.printed, idx: {} });
      s.idx[i] = true;
    });
    for (var pk2 in byPrinted) {
      var ids = Object.keys(byPrinted[pk2].idx).map(Number);
      if (ids.length < 2) continue;
      var keys = {}; ids.forEach(function (t) { keys[keyOf[t]] = true; });
      if (Object.keys(keys).length < 2) continue;         // already shown in A
      r.D.push({ items: ids, printed: byPrinted[pk2].name });
    }

    function sortByFirst(arr) {
      arr.forEach(function (g) { g.items.sort(function (p, q) { return E[p].disp.localeCompare(E[q].disp); }); });
      arr.sort(function (p, q) { return E[p.items[0]].disp.localeCompare(E[q.items[0]].disp, undefined, { sensitivity: "base" }); });
    }
    ["lower", "particles", "caps", "A", "B", "C", "D", "E", "F", "unmatched"].forEach(function (k) { sortByFirst(r[k]); });
    r.F.sort(function (p, q) { return q.people.length - p.people.length || E[p.items[0]].disp.localeCompare(E[q.items[0]].disp); });
    return r;
  }

  return { decodeBuffer: decodeBuffer, parse: parse, analyse: analyse, foldS: foldS };
})();
// CORE-END


(function () {
  var GROUPS = [
    { id: "cap", title: "Capitalization", dot: "red", checks: [
      { key: "lower", kind: "red", title: "Lowercase last name or first initial", desc: "Sorts and reads wrongly in the index." },
      { key: "caps", kind: "red", title: "Last name in all caps", desc: "Won't merge with the same author typed normally." },
      { key: "particles", kind: "blue", title: "Lowercase particle (van, de, dos…)", desc: "Often correct. Listed so you can confirm it's consistent." }
    ]},
    { id: "same", title: "Probably the same author", dot: "amber",
      setting: { key: "skipDiffFirst", title: "Skip clearly different first names ◆" },
      checks: [
      { key: "D", kind: "amber", title: "Same printed name, different tags", desc: "One person tagged two ways, so the index splits them." },
      { key: "A", kind: "amber", mark: true, title: "Differs only in case, accents or punctuation", desc: "Separate index entries that read the same." },
      { key: "B", kind: "amber", mark: true, title: "Spelling differs by 1–2 letters", desc: "Possible typo in the tag.",
        subs: [{ key: "shortNames", title: "Include short last names (5 letters or fewer)" }] },
      { key: "C", kind: "amber", mark: true, title: "Initial vs. fuller first name", desc: "Same last name; one first name could abbreviate the other." },
      { key: "E", kind: "blue", title: "One tag, first name spelled differently", desc: "Same person printed two ways in the text, like Charlie and Charles." }
    ]},
    { id: "tags", title: "Tags vs. text", dot: "blue", checks: [
      { key: "F", kind: "blue", title: "One tag, different people", desc: "Initials-only tags that merge different people into one index entry." },
      { key: "unmatched", kind: "blue", title: "Tag not found in the author list", desc: "No printed name after the marker has this last name." },
      { key: "untagged", kind: "blue", title: "Printed author with no tag", desc: "This name won't appear in the index." }
    ]}
  ];
  var DEFAULTS = { skipDiffFirst: true, shortNames: false };
  var LIMIT = 150;
  var state = { data: null, res: null, fileName: "", on: {}, opt: {}, ran: null, filter: "", showAll: {}, active: null };
  GROUPS.forEach(function (g) { g.checks.forEach(function (c) { state.on[c.key] = true; (c.subs || []).forEach(function (s) { state.opt[s.key] = DEFAULTS[s.key]; }); }); if (g.setting) state.opt[g.setting.key] = DEFAULTS[g.setting.key]; });

  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function fmt(n) { return n.toLocaleString(); }
  function allChecks() { var a = []; GROUPS.forEach(function (g) { g.checks.forEach(function (c) { a.push(c); }); }); return a; }
  function onCount() { return allChecks().filter(function (c) { return state.on[c.key]; }).length; }
  function snapshot() { return JSON.stringify({ on: state.on, opt: state.opt }); }
  function isDirty() { return !!state.ran && state.ran !== snapshot(); }
  function unit(key) { return /^(lower|caps|particles|unmatched|untagged|E|F)$/.test(key) ? ["name", "names"] : ["group", "groups"]; }

  // ---------- step 2: checks list (doubles as the results nav)
  function sw(id, checked, disabled, small) {
    return '<span class="switch' + (small ? " sm" : "") + '"><input type="checkbox" role="switch" id="' + id + '"' + (checked ? " checked" : "") + (disabled ? " disabled" : "") +
      '><span class="switch-track"></span></span>';
  }
  function renderNav() {
    if (!state.res) { $("step3").hidden = true; return; }
    var h = "", ranOnState = JSON.parse(state.ran).on;
    GROUPS.forEach(function (g) {
      var ran = g.checks.filter(function (c) { return ranOnState[c.key]; });
      if (!ran.length) return;
      h += '<div class="list-group"><span class="dot ' + g.dot + '"></span>' + esc(g.title) + "</div>";
      ran.forEach(function (c) {
        var n = state.res[c.key].length;
        h += '<button type="button" class="nav-item' + (state.active === c.key ? " is-active" : "") + '" data-go="' + c.key + '"><span>' + esc(c.title) +
          (c.mark ? '<span class="mark">◆</span>' : "") + '</span><span class="count ' + (n ? c.kind : "zero") + '">' + (n ? fmt(n) : "✓") + "</span></button>";
      });
    });
    $("nav").innerHTML = h;
    $("nav").classList.toggle("stale", isDirty());
    $("step3").hidden = false;
  }
  function setCollapsed(c) {
    state.collapsed = c;
    $("step2Body").hidden = c;
    $("step2").classList.toggle("is-collapsed", c);
    $("step2Toggle").setAttribute("aria-expanded", String(!c));
    var n = onCount(), total = allChecks().length;
    $("step2Summary").textContent = c ? (n === total ? "All " + total + " on" : n + " of " + total + " on") + (isDirty() ? " · changed" : "") : "";
  }
  $("step2Toggle").addEventListener("click", function () { setCollapsed(!state.collapsed); });
  $("nav").addEventListener("click", function (e) {
    var b = e.target.closest("[data-go]"); if (b) goTo(b.getAttribute("data-go"));
  });

  function renderList() {
    var h = "";
    GROUPS.forEach(function (g) {
      h += '<div class="list-group"><span class="dot ' + g.dot + '"></span>' + esc(g.title) + "</div>";
      if (g.setting) {
        var anyMarked = g.checks.some(function (c) { return c.mark && state.on[c.key]; });
        h += '<div class="item setting' + (anyMarked ? "" : " is-off") + '"><label for="opt-' + g.setting.key + '">' + sw("opt-" + g.setting.key, state.opt[g.setting.key], !anyMarked, true) +
          '<span class="item-title">' + esc(g.setting.title) + "</span></label></div>";
      }
      g.checks.forEach(function (c) {
        h += '<div class="item' + (state.on[c.key] ? "" : " is-off") + '"><label for="chk-' + c.key + '" title="' + esc(c.desc) + '">' + sw("chk-" + c.key, state.on[c.key]) +
          '<span class="item-title">' + esc(c.title) + (c.mark ? '<span class="mark" aria-label="uses first-name setting">◆</span>' : "") + "</span></label></div>";
        (c.subs || []).forEach(function (s) {
          var dis = !state.on[c.key];
          h += '<div class="item sub' + (dis ? " is-off" : "") + '"><label for="opt-' + s.key + '">' + sw("opt-" + s.key, state.opt[s.key], dis, true) +
            '<span class="item-title">' + esc(s.title) + "</span></label></div>";
        });
      });
    });
    $("list").innerHTML = h;
    updateRunState();
  }
  $("list").addEventListener("change", function (e) {
    var id = e.target.id || "";
    if (id.indexOf("chk-") === 0) state.on[id.slice(4)] = e.target.checked;
    else if (id.indexOf("opt-") === 0) state.opt[id.slice(4)] = e.target.checked;
    renderList();
  });
  $("allChecks").addEventListener("change", function (e) {
    allChecks().forEach(function (c) { state.on[c.key] = e.target.checked; });
    renderList();
  });

  function updateRunState() {
    var n = onCount(), total = allChecks().length, run = $("run");
    var all = $("allChecks");
    all.checked = n > 0;
    $("allSwitch").classList.toggle("mixed", n > 0 && n < total);
    $("allLabel").textContent = n === total ? "All checks" : n === 0 ? "No checks" : n + " of " + total + " checks";
    run.disabled = !state.data || !n;
    run.textContent = state.res ? "Run again" : "Run checks";
    $("runHint").textContent = !state.data ? "Choose a file first." : !n ? "Switch on at least one check." :
      isDirty() ? "Settings changed. Run again to update the results." : state.res ? "Results are up to date." : "Ready to run.";
    $("stale").hidden = !isDirty();
    $("nav").classList.toggle("stale", isDirty());
  }

  // ---------- step 1: file
  function setFileStatus(html) { $("fileStatus").innerHTML = html; }
  function loadText(text, name) {
    var data = IC.parse(text);
    if (!data.markers) {
      setFileStatus('<p class="err">No index markers found in “' + esc(name) + '”. Export the story with File › Export › Adobe InDesign Tagged Text and load that .txt file.</p>');
      return;
    }
    state.data = data; state.fileName = name; state.res = null; state.ran = null; state.active = null;
    $("dropTitle").textContent = name;
    $("dropSub").textContent = "Drop or choose another file to replace it";
    $("step1").classList.add("is-done");
    setFileStatus('<span class="badge b-green">✓ ' + fmt(data.markers) + ' markers</span><span class="badge b-neutral">' + fmt(data.entries.length) + " tags</span>");
    $("resultsWrap").hidden = true; $("emptyState").hidden = false;
    renderNav(); setCollapsed(false);
    $("emptyTitle").textContent = "Ready to run";
    $("emptyText").textContent = "“" + name + "” is loaded. Pick your checks on the left, then click Run checks.";
    renderList();
  }
  function readFile(f) {
    if (!f) return;
    setFileStatus('<span class="badge b-neutral">Reading ' + esc(f.name) + "…</span>");
    var rd = new FileReader();
    rd.onload = function () {
      try { loadText(IC.decodeBuffer(rd.result), f.name); }
      catch (e) { setFileStatus('<p class="err">Couldn’t read that file: ' + esc(e.message) + "</p>"); }
    };
    rd.readAsArrayBuffer(f);
  }
  $("file").addEventListener("change", function (e) { readFile(e.target.files[0]); e.target.value = ""; });
  var drop = $("drop");
  ["dragenter", "dragover"].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add("over"); }); });
  ["dragleave", "drop"].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.remove("over"); }); });
  drop.addEventListener("drop", function (e) { if (e.dataTransfer.files.length) readFile(e.dataTransfer.files[0]); });

  // ---------- run
  function run() {
    if (!state.data || !onCount()) return;
    var btn = $("run"); btn.disabled = true; btn.textContent = "Running…";
    setTimeout(function () {                            // let the button repaint before the work
      state.res = IC.analyse(state.data, state.opt);
      state.ran = snapshot(); state.showAll = {}; state.active = null;
      $("emptyState").hidden = true; $("resultsWrap").hidden = false;
      var ranOnState = JSON.parse(state.ran).on;
      var nRan = allChecks().filter(function (c) { return ranOnState[c.key]; }).length;
      $("resMeta").innerHTML = esc(state.fileName) + " · <b>" + fmt(state.data.markers) + "</b> markers · <b>" + fmt(state.data.entries.length) + "</b> tags · <b>" + nRan + "</b> checks";
      renderResults(true);
      renderList();
      renderNav();
      setCollapsed(true);
      $("panel").scrollTop = 0;
      if (window.matchMedia("(max-width: 860px)").matches) $("panel").scrollIntoView({ block: "start" });
    }, 30);
  }
  $("run").addEventListener("click", run);
  $("rerunStale").addEventListener("click", run);

  // ---------- results
  function ranOn(key) { return state.ran && JSON.parse(state.ran).on[key]; }
  function goTo(key) {
    state.active = key;
    Array.prototype.forEach.call(document.querySelectorAll(".nav-item"), function (x) { x.classList.toggle("is-active", x.getAttribute("data-go") === key); });
    var sec = $("sec-" + key); if (!sec) return;
    sec.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    sec.classList.add("flash"); setTimeout(function () { sec.classList.remove("flash"); }, 900);
  }
  function matchesFilter(g, key) {
    if (!state.filter) return true;
    var f = IC.foldS(state.filter);
    if (key === "untagged") return IC.foldS(g.name).indexOf(f) >= 0;
    return g.items.some(function (i) {
      var e = state.data.entries[i];
      if (IC.foldS(e.disp).indexOf(f) >= 0) return true;
      return e.occ.some(function (o) { return o.printed && IC.foldS(o.printed).indexOf(f) >= 0; });
    });
  }
  function printedSummary(e) {
    var s = {}; e.occ.forEach(function (o) { if (o.printed) s[o.printed] = (s[o.printed] || 0) + 1; });
    return Object.keys(s);
  }
  function entryRow(i, opts) {
    opts = opts || {};
    var e = state.data.entries[i];
    var hl = opts.highlight || null;
    var occList = hl ? e.occ.filter(function (o) { return o.printed && hl[o.printed]; }) : e.occ;
    var occ = occList.slice(0, 40).map(function (o) {
      var nm = o.printed ? (hl ? "<mark>" + esc(o.printed) + "</mark>" : "<b>" + esc(o.printed) + "</b>") : "<b>(no matching name)</b>";
      return "<div>" + nm + " · " + esc(o.context || "—") + (o.where ? " · " + esc(o.where) : "") + "</div>";
    }).join("") + (occList.length > 40 ? "<div>…and " + (occList.length - 40) + " more</div>" : "");
    var pn = opts.hidePrinted ? [] : printedSummary(e);
    return '<details class="row"><summary><span class="tag">' + esc(e.disp) + '</span><span class="times">×' + e.occ.length + "</span>" +
      (opts.badge || "") +
      (pn.length ? '<span class="printed">' + esc(pn.slice(0, 4).join(" · ")) + (pn.length > 4 ? " · +" + (pn.length - 4) : "") + "</span>" : "") +
      '</summary><div class="occ">' + occ + "</div></details>";
  }
  function personChips(list) {
    return '<div class="people">' + list.map(function (p) {
      var names = Object.keys(p.names).sort(function (a, b) { return p.names[b] - p.names[a]; });
      return '<span class="person">' + esc(names.join(" / ")) + "<i>×" + p.count + "</i></span>";
    }).join("") + "</div>";
  }
  function groupHtml(key, g) {
    if (key === "untagged") {
      return '<div class="grp"><div class="plain-row"><span class="tag">' + esc(g.name) + '</span><span class="printed">' +
        esc(g.context || "—") + (g.where ? " · " + esc(g.where) : "") + "</span></div></div>";
    }
    var badge = "";
    if (g.why) badge = '<span class="why b-red">' + esc(g.why) + "</span>";
    if (g.note) badge = '<span class="why b-blue">' + esc(g.note) + "</span>";
    if (key === "D") return '<div class="grp"><div class="grp-note">Printed as <b>' + esc(g.printed) + "</b></div>" +
      g.items.map(function (i) { return entryRow(i, { hidePrinted: true }); }).join("") + "</div>";
    if (key === "E") {
      var hl = {}; g.variants.forEach(function (p) { Object.keys(p.names).forEach(function (nm) { hl[nm] = true; }); });
      return '<div class="grp">' + entryRow(g.items[0], { hidePrinted: true, highlight: hl }) + personChips(g.variants) + "</div>";
    }
    if (key === "F") return '<div class="grp">' + entryRow(g.items[0], { hidePrinted: true, badge: '<span class="why b-blue">' + g.people.length + " people</span>" }) + personChips(g.people) + "</div>";
    return '<div class="grp">' + g.items.map(function (i) { return entryRow(i, { badge: badge }); }).join("") + "</div>";
  }

  function renderResults(animate) {
    var body = "", ranState = JSON.parse(state.ran);
    GROUPS.forEach(function (g) {
      var ran = g.checks.filter(function (c) { return ranOn(c.key); });
      if (!ran.length) return;
      body += '<p class="res-group"><span class="dot ' + g.dot + '"></span>' + esc(g.title) + "</p>";
      ran.forEach(function (c) {
        var all = state.res[c.key], n = all.length;
        var shown = all.filter(function (x) { return matchesFilter(x, c.key); });
        var cap = state.showAll[c.key] ? shown.length : Math.min(shown.length, LIMIT);
        var inner = shown.length ? shown.slice(0, cap).map(function (x) { return groupHtml(c.key, x); }).join("") :
          '<p class="empty">' + (n ? "Nothing matches the filter." : "✓ None found.") + "</p>";
        if (cap < shown.length) inner += '<div class="more"><button class="btn btn-sm" type="button" data-more="' + c.key + '">Show all ' + fmt(shown.length) + "</button></div>";
        var u = unit(c.key), note = "";
        if (c.mark) note = ranState.opt.skipDiffFirst ? " Clearly different first names skipped." : " First names not compared.";
        if (c.key === "B") note += ranState.opt.shortNames ? " Short last names included." : " Short last names skipped.";
        body += '<section class="sec" id="sec-' + c.key + '"><div class="sec-head"><div><h3>' + esc(c.title) + (c.mark ? '<span class="mark">◆</span>' : "") +
          "</h3><p>" + esc(c.desc + note) + '</p></div><span class="badge ' + (n ? "b-" + c.kind : "b-green") + '">' + (n ? fmt(n) + " " + u[n === 1 ? 0 : 1] : "None") + "</span></div>" + inner + "</section>";
      });
    });
    var box = $("results");
    box.innerHTML = body;
    if (animate) { box.classList.remove("enter"); void box.offsetWidth; box.classList.add("enter"); }
  }
  $("results").addEventListener("click", function (e) {
    var k = e.target.getAttribute && e.target.getAttribute("data-more");
    if (k) { state.showAll[k] = true; renderResults(false); }
  });
  var ft;
  $("search").addEventListener("input", function (e) { clearTimeout(ft); ft = setTimeout(function () { state.filter = e.target.value.trim(); renderResults(false); }, 150); });

  // ---------- export
  function baseName() { return (state.fileName || "index").replace(/\.[^.]+$/, "") + " - Index Author Check"; }
  function peopleText(list) {
    return list.map(function (p) { var names = Object.keys(p.names); return names.join(" / ") + " (×" + p.count + ")"; }).join(" · ");
  }
  function buildTxt() {
    var d = state.data, ran = JSON.parse(state.ran), L = [];
    L.push("INDEX AUTHOR CHECK");
    L.push("File: " + state.fileName);
    L.push("Run: " + new Date().toLocaleString());
    L.push("Index markers: " + d.markers + "   Distinct tags: " + d.entries.length);
    L.push("Settings: " + (ran.opt.skipDiffFirst ? "clearly different first names skipped" : "first names not compared") + "; " +
           (ran.opt.shortNames ? "short last names included" : "short last names skipped") + " in spelling check");
    L.push("");
    GROUPS.forEach(function (g) {
      var checks = g.checks.filter(function (c) { return ran.on[c.key]; });
      if (!checks.length) return;
      L.push("#### " + g.title.toUpperCase()); L.push("");
      checks.forEach(function (c) {
        var arr = state.res[c.key], u = unit(c.key);
        var t = c.title + "  (" + arr.length + " " + u[arr.length === 1 ? 0 : 1] + ")";
        L.push("==== " + t + " " + new Array(Math.max(4, 72 - t.length)).join("="));
        L.push("  " + c.desc);
        if (!arr.length) L.push("  None found.");
        arr.forEach(function (x) {
          if (c.key === "untagged") { L.push("  " + x.name + "   —   " + (x.context || "") + (x.where ? " · " + x.where : "")); return; }
          if (c.key === "D") L.push("  Printed as: " + x.printed);
          x.items.forEach(function (i) {
            var e = d.entries[i], pn = printedSummary(e);
            var tail = c.key === "E" ? peopleText(x.variants) : c.key === "F" ? peopleText(x.people) : c.key === "D" ? "" :
              pn.slice(0, 6).join(" · ") + (pn.length > 6 ? " · +" + (pn.length - 6) : "");
            L.push("  " + e.disp + "   ×" + e.occ.length + (x.why ? "   [" + x.why + "]" : "") + (x.note ? "   [" + x.note + "]" : "") + (tail ? "   —   " + tail : ""));
          });
          if (x.items.length > 1 || c.key === "D") L.push("");
        });
        L.push("");
      });
    });
    return L.join("\r\n");
  }
  function csvCell(v) { v = String(v == null ? "" : v); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function buildCsv() {
    var d = state.data, ran = JSON.parse(state.ran), rows = [["Group", "Check", "Result #", "Tag", "Times tagged", "Printed name(s)", "Note", "First place it appears"]];
    GROUPS.forEach(function (g) {
      g.checks.forEach(function (c) {
        if (!ran.on[c.key]) return;
        state.res[c.key].forEach(function (x, xi) {
          if (c.key === "untagged") { rows.push([g.title, c.title, xi + 1, "", "", x.name, "", (x.context || "") + (x.where ? " · " + x.where : "")]); return; }
          x.items.forEach(function (i) {
            var e = d.entries[i], o = e.occ[0];
            var printed = c.key === "E" ? peopleText(x.variants) : c.key === "F" ? peopleText(x.people) : printedSummary(e).join("; ");
            rows.push([g.title, c.title, xi + 1, e.disp, e.occ.length, printed,
              x.why || x.note || (x.printed ? "Printed as " + x.printed : "") || (c.key === "F" ? x.people.length + " people" : ""),
              (o.context || "") + (o.where ? " · " + o.where : "")]);
          });
        });
      });
    });
    return "﻿" + rows.map(function (r) { return r.map(csvCell).join(","); }).join("\r\n");
  }
  var dl = null;
  if (window.claude && typeof window.claude.use === "function") {
    window.claude.use("downloads").then(function (x) { dl = x; }).catch(function () {});
  }
  function toast(msg) { $("toast").textContent = msg; clearTimeout(toast.t); toast.t = setTimeout(function () { $("toast").textContent = ""; }, 4000); }
  function save(filename, text, mime) {
    if (dl) {
      dl.save({ filename: filename, data: text }).then(function () { toast("Saved " + filename); })
        .catch(function (e) { toast(e && e.code === "declined" ? "Export cancelled" : "Couldn’t export here: " + (e && e.message || "unavailable")); });
      return;
    }
    var url = URL.createObjectURL(new Blob([text], { type: mime }));
    var a = document.createElement("a"); a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    toast("Saved " + filename);
  }
  $("exportTxt").addEventListener("click", function () { save(baseName() + ".txt", buildTxt(), "text/plain;charset=utf-8"); });
  $("exportCsv").addEventListener("click", function () { save(baseName() + ".csv", buildCsv(), "text/csv;charset=utf-8"); });


  // ---------- service worker: fresh files on every deploy
  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
    var hadController = !!navigator.serviceWorker.controller, reloading = false;
    navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then(function (reg) {
      reg.update();
      document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") reg.update(); });
    }).catch(function () {});
    navigator.serviceWorker.addEventListener("controllerchange", function () {
      if (!hadController || reloading) { hadController = true; return; }
      if (!state.data) { reloading = true; location.reload(); return; }   // nothing loaded yet: just refresh
      $("updateBtn").hidden = false;                                    // don't wipe results mid-review
    });
    $("updateBtn").addEventListener("click", function () { reloading = true; location.reload(); });
  }

  renderList();
})();
