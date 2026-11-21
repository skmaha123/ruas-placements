/* RUAS Placement Portal
 * Public visitors: read-only view of data.json.
 * Admins: log in with a GitHub token (write access to the repo) → edit → "Publish changes"
 * commits data.json to the repository; GitHub Pages redeploys in ~1 minute.
 */
"use strict";

const CFG = window.SITE_CONFIG || {};
const STATUSES = ["Upcoming", "Registration Open", "Registration Closed", "In Progress", "Results Announced", "Completed"];
const $ = id => document.getElementById(id);

let data = { stats: {}, announcements: [], companies: [] };
let admin = null;          // { owner, repo, token, login }
let dirty = false;
let statusFilter = "";

/* ---------------- helpers ---------------- */
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-");
const uid = () => Math.random().toString(36).slice(2, 10);
const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
function parseDate(s) { if (!s) return null; const d = new Date(s + "T00:00:00"); return isNaN(d) ? null : d; }
function fmtDate(s, opts = { day: "numeric", month: "short", year: "numeric" }) {
  const d = parseDate(s); return d ? d.toLocaleDateString("en-IN", opts) : "";
}
function daysFromToday(s) { const d = parseDate(s); return d ? Math.round((d - today()) / 86400000) : null; }
function safeUrl(u) { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : ""; } catch { return ""; } }
function toast(msg, ms = 3500) { const t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), ms); }
const store = {
  get(k) { try { return sessionStorage.getItem(k) || localStorage.getItem(k); } catch { return null; } },
  set(k, v, persist) { try { (persist ? localStorage : sessionStorage).setItem(k, v); } catch {} },
  del(k) { try { sessionStorage.removeItem(k); localStorage.removeItem(k); } catch {} },
};

/* ---------------- repository detection ---------------- */
function detectRepo() {
  if (CFG.githubOwner && CFG.githubRepo) return `${CFG.githubOwner}/${CFG.githubRepo}`;
  const h = location.hostname;
  if (h.endsWith(".github.io")) {
    const owner = h.split(".")[0];
    const first = location.pathname.split("/").filter(Boolean)[0];
    return `${owner}/${first || h}`;
  }
  return "";
}

/* ---------------- load ---------------- */
async function loadData() {
  try {
    const res = await fetch(`data.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(res.status);
    data = await res.json();
  } catch (e) {
    console.error(e);
    toast("Could not load placement data.");
  }
  data.stats ||= {}; data.announcements ||= []; data.companies ||= [];
}

/* ---------------- render ---------------- */
function renderStatic() {
  $("uniName").textContent = CFG.university || "";
  $("deptName").textContent = CFG.department || "";
  $("season").textContent = CFG.season || "Placements";
  $("footDept").textContent = CFG.department || "";
  $("footUni").textContent = CFG.university || "";
  const c = CFG.contact || {};
  $("footAddr").textContent = c.address || "";
  $("footEmail").innerHTML = c.email ? `✉ <a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : "";
  $("footPhone").textContent = c.phone ? "☎ " + c.phone : "";
  document.title = `${CFG.shortName || "RUAS"} ${CFG.season || "Placements"} | ${CFG.department || ""}`;


  $("statusChips").innerHTML = ["All", ...STATUSES]
    .map(s => `<button class="chip${s === "All" ? " on" : ""}" data-s="${s === "All" ? "" : esc(s)}">${esc(s)}</button>`).join("");
  $("statusChips").addEventListener("click", e => {
    const b = e.target.closest(".chip"); if (!b) return;
    statusFilter = b.dataset.s;
    document.querySelectorAll(".chip").forEach(x => x.classList.toggle("on", x === b));
    renderCards();
  });
  ["q", "fBranch", "fType"].forEach(id => $(id).addEventListener("input", renderCards));
}

function allBranches() {
  const set = new Set(CFG.branches || []);
  data.companies.forEach(c => (c.branches || []).forEach(b => set.add(b)));
  return [...set].sort((x, y) => x.localeCompare(y));
}

function renderBranchFilter() {
  const fb = $("fBranch"), cur = fb.value;
  fb.innerHTML = `<option value="">All branches</option>` + allBranches().map(b => `<option>${esc(b)}</option>`).join("");
  fb.value = allBranches().includes(cur) ? cur : "";
}

function renderAll() {
  renderBranchFilter();
  renderStats(); renderNews(); renderCards(); renderTimeline();
  $("updated").textContent = data.updated ? "Last updated: " + new Date(data.updated).toLocaleString("en-IN") : "";
  $("pending").textContent = dirty ? "● Unpublished changes" : "";
}

function renderStats() {
  const s = data.stats;
  const tiles = [
    [s.companies, "Companies visited"], [s.offers, "Offers"],
    [s.highestCtc, "Highest CTC"], [s.averageCtc, "Average CTC"],
    [data.companies.filter(c => c.status === "Registration Open").length, "Open registrations"],
  ];
  $("stats").innerHTML = tiles.map(([v, l]) => `<div class="stat"><b>${esc(v ?? "—")}</b><span>${esc(l)}</span></div>`).join("");
}

function renderNews() {
  const list = [...data.announcements].sort((a, b) => (b.pinned - a.pinned) || String(b.date).localeCompare(String(a.date)));
  $("newsList").innerHTML = list.length ? list.map(n => `
    <div class="news-item${n.pinned ? " pinned" : ""}">
      <div class="date">${n.pinned ? "📌 " : ""}${esc(fmtDate(n.date))}</div>
      <h4>${esc(n.title)}</h4>
      ${n.body ? `<p>${esc(n.body)}</p>` : ""}
      ${admin ? `<div class="card-actions"><button class="btn small light" data-edit-news="${esc(n.id)}">Edit</button></div>` : ""}
    </div>`).join("") : `<div class="empty">No announcements yet.</div>`;
}

function deadlineInfo(c) {
  const d = daysFromToday(c.regDeadline);
  if (d === null) return "";
  if (d < 0) return `<div class="deadline past">Registration closed on ${esc(fmtDate(c.regDeadline))}</div>`;
  if (d === 0) return `<div class="deadline soon">⏰ Registration closes today</div>`;
  if (d <= 3) return `<div class="deadline soon">⏰ Registration closes in ${d} day${d > 1 ? "s" : ""} (${esc(fmtDate(c.regDeadline))})</div>`;
  return `<div class="deadline ok">Register by ${esc(fmtDate(c.regDeadline))}</div>`;
}

function sortKey(c) {
  const order = { "Registration Open": 0, "Upcoming": 1, "In Progress": 2, "Registration Closed": 3, "Results Announced": 4, "Completed": 5 };
  return [order[c.status] ?? 9, c.regDeadline || c.interviewDate || "9999"];
}

function renderCards() {
  const q = $("q").value.trim().toLowerCase();
  const br = $("fBranch").value, ty = $("fType").value;
  const list = data.companies.filter(c =>
    (!statusFilter || c.status === statusFilter) &&
    (!br || (c.branches || []).includes(br)) &&
    (!ty || c.type === ty) &&
    (!q || [c.name, c.role, c.location, c.ctc, c.eligibility, (c.branches || []).join(" ")].join(" ").toLowerCase().includes(q))
  ).sort((a, b) => { const ka = sortKey(a), kb = sortKey(b); return ka[0] - kb[0] || ka[1].localeCompare(kb[1]); });

  $("count").textContent = `${list.length} of ${data.companies.length} drives`;
  $("cards").innerHTML = list.length ? list.map(c => {
    const link = safeUrl(c.regLink);
    const regOpen = c.status === "Registration Open" && (daysFromToday(c.regDeadline) ?? 0) >= 0;
    const rows = [
      ["Type", c.type], ["CTC / Stipend", c.ctc], ["Location", c.location], ["Batch", c.batch],
      ["Eligibility", c.eligibility], ["Online test", fmtDate(c.oaDate)], ["Interview", fmtDate(c.interviewDate)], ["Mode", c.mode],
    ].filter(r => r[1]);
    return `
    <article class="card">
      <span class="badge s-${slug(c.status || "upcoming")}">${esc(c.status || "Upcoming")}</span>
      <h3>${esc(c.name)}</h3>
      ${c.role ? `<div class="role">${esc(c.role)}</div>` : ""}
      ${deadlineInfo(c)}
      <dl class="meta">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>
      ${(c.branches || []).length ? `<div class="tags">${c.branches.map(b => `<span class="tag">${esc(b)}</span>`).join("")}</div>` : ""}
      ${c.notes ? `<div class="notes">${esc(c.notes)}</div>` : ""}
      <div class="card-actions">
        ${link && regOpen ? `<a class="btn small" href="${esc(link)}" target="_blank" rel="noopener">Register ↗</a>` : ""}
        ${link && !regOpen ? `<a class="btn small light" href="${esc(link)}" target="_blank" rel="noopener">Details ↗</a>` : ""}
        ${admin ? `<button class="btn small light" data-edit-company="${esc(c.id)}">Edit</button>` : ""}
      </div>
    </article>`;
  }).join("") : `<div class="empty">No drives match your filters.</div>`;
}

function renderTimeline() {
  const events = [];
  for (const c of data.companies) {
    if (c.regDeadline) events.push({ date: c.regDeadline, kind: "Registration deadline", c });
    if (c.oaDate) events.push({ date: c.oaDate, kind: "Online assessment", c });
    if (c.interviewDate) events.push({ date: c.interviewDate, kind: "Interview", c });
  }
  const upcoming = events.filter(e => (daysFromToday(e.date) ?? -1) >= 0).sort((a, b) => a.date.localeCompare(b.date));
  $("timeline").innerHTML = upcoming.length ? upcoming.map(e => {
    const d = daysFromToday(e.date);
    return `<div class="tl-row">
      <div class="tl-date">${esc(fmtDate(e.date, { day: "numeric", month: "short" }))}<small>${d === 0 ? "Today" : d === 1 ? "Tomorrow" : `in ${d} days`}</small></div>
      <div><b>${esc(e.c.name)}</b>${e.c.role ? ` · <span class="muted">${esc(e.c.role)}</span>` : ""}</div>
      <span class="tl-kind">${esc(e.kind)}</span>
    </div>`;
  }).join("") : `<p class="muted">No upcoming events.</p>`;
}

/* ---------------- admin: auth ---------------- */
async function gh(path, opts = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...opts,
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${admin.token}`, ...(opts.headers || {}) },
  });
  const body = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error((body && body.message) || `GitHub error ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return body;
}

async function login(repo, token, remember) {
  const [owner, name] = repo.trim().replace(/^https?:\/\/github\.com\//, "").split("/");
  if (!owner || !name) throw new Error("Enter the repository as owner/repo");
  admin = { owner, repo: name, token: token.trim() };
  try {
    const r = await gh(`/repos/${owner}/${name}`);
    if (!r.permissions || !r.permissions.push) throw new Error("This token does not have write access to the repository.");
    const u = await gh("/user").catch(() => null);
    admin.login = u ? u.login : owner;
  } catch (e) {
    admin = null;
    throw new Error(/Bad credentials/i.test(e.message) ? "Invalid token." : e.message);
  }
  store.set("ruas_admin", JSON.stringify({ owner, repo: name, token: admin.token }), remember);
  await enterAdmin();
}

function fromBase64Utf8(b64) {
  const bin = atob(b64.replace(/\s/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/* Admins always edit the newest data.json in the repository (the public site can lag ~1 min behind) */
async function loadLatestFromRepo() {
  try {
    const branch = CFG.githubBranch || "main";
    const f = await gh(`/repos/${admin.owner}/${admin.repo}/contents/data.json?ref=${encodeURIComponent(branch)}&t=${Date.now()}`);
    const d = JSON.parse(fromBase64Utf8(f.content));
    d.stats ||= {}; d.announcements ||= []; d.companies ||= [];
    data = d;
  } catch (e) { console.warn("Could not load data.json from repository", e); }
}

function explainPublishError(e) {
  if (e.status === 403 || /not accessible|permission/i.test(e.message))
    return "Your GitHub token is not allowed to WRITE to this repository. On GitHub open Settings → Developer settings → Fine-grained tokens → your token → Edit: set Repository access to 'Only select repositories' → ruas-placements, and Permissions → Contents → 'Read and write'. Save, then log out and log in here again.";
  if (e.status === 404)
    return "The token cannot see this repository. Edit the token on GitHub and add this repository under 'Repository access'.";
  if (e.status === 401)
    return "The token is invalid or has expired. Create a new token and log in again.";
  if (e.status === 409 || e.status === 422)
    return "The data changed on GitHub while you were editing. Your edits are kept here — click Publish changes again.";
  return e.message;
}

async function enterAdmin() {
  if (!dirty) await loadLatestFromRepo();
  $("adminBar").hidden = false;
  $("btnLogin").hidden = true;
  $("adminUser").textContent = admin.login ? `· ${admin.login}` : "";
  renderAll();
}

function logout() {
  if (dirty && !confirm("You have unpublished changes. Log out and discard them?")) return;
  admin = null; dirty = false; store.del("ruas_admin");
  $("adminBar").hidden = true; $("btnLogin").hidden = false;
  loadData().then(renderAll);
}

function markDirty() { dirty = true; renderAll(); }

/* ---------------- admin: publish ---------------- */
function toBase64Utf8(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function publish() {
  const btn = $("btnPublish");
  btn.disabled = true; btn.textContent = "Publishing…";
  try {
    data.updated = new Date().toISOString();
    const branch = CFG.githubBranch || "main";
    const path = `/repos/${admin.owner}/${admin.repo}/contents/data.json`;
    let sha;
    try { sha = (await gh(`${path}?ref=${encodeURIComponent(branch)}`)).sha; } catch { sha = undefined; }
    await gh(path, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Update placement data (${new Date().toLocaleString("en-IN")})`,
        content: toBase64Utf8(JSON.stringify(data, null, 2) + "\n"),
        sha, branch,
      }),
    });
    dirty = false; renderAll();
    $("pending").textContent = `✓ Published at ${new Date().toLocaleTimeString("en-IN")} — visible to everyone in 1–2 minutes (press Ctrl+F5 to refresh).`;
    toast("Published ✓", 4000);
  } catch (e) {
    const msg = explainPublishError(e);
    $("pending").textContent = "✗ Not published. " + msg;
    alert("Publish failed — nothing was saved to the website.\n\n" + msg);
  } finally {
    btn.disabled = false; btn.textContent = "Publish changes";
  }
}

function exportJson() {
  const blob = new Blob([JSON.stringify(data, null, 2) + "\n"], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = "data.json"; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ---------------- admin: editors ---------------- */
let editingCompany = null, editingNews = null;

function openCompany(id) {
  const f = $("formCompany");
  const c = id ? data.companies.find(x => x.id === id) : null;
  editingCompany = c;
  f.reset();
  $("companyTitle").textContent = c ? `Edit ${c.name}` : "Add company";
  $("btnDeleteCompany").hidden = !c;
  const known = allBranches();
  $("branchChecks").innerHTML = known.map(b =>
    `<label><input type="checkbox" value="${esc(b)}" ${c && (c.branches || []).includes(b) ? "checked" : ""}/> ${esc(b)}</label>`).join("");
  $("branchChecks").hidden = !known.length;
  if (c) {
    for (const k of ["name", "role", "type", "status", "ctc", "location", "batch", "mode", "regDeadline", "regLink", "oaDate", "interviewDate", "eligibility", "notes"]) {
      if (f.elements[k]) f.elements[k].value = c[k] || "";
    }
    f.elements.otherBranches.value = (c.branches || []).filter(b => !known.includes(b)).join(", ");
  } else {
    f.elements.status.value = "Upcoming";
  }
  $("dlgCompany").showModal();
}

function saveCompany(e) {
  e.preventDefault();
  const f = $("formCompany");
  const v = k => f.elements[k].value.trim();
  const branches = [
    ...[...$("branchChecks").querySelectorAll("input:checked")].map(i => i.value),
    ...v("otherBranches").split(",").map(s => s.trim()).filter(Boolean),
  ];
  const obj = {
    id: editingCompany ? editingCompany.id : "c" + uid(),
    name: v("name"), role: v("role"), type: v("type"), ctc: v("ctc"), location: v("location"),
    branches, eligibility: v("eligibility"), batch: v("batch"), status: v("status"),
    regDeadline: v("regDeadline"), regLink: v("regLink"), oaDate: v("oaDate"), interviewDate: v("interviewDate"),
    mode: v("mode"), notes: v("notes"),
  };
  if (editingCompany) Object.assign(editingCompany, obj); else data.companies.push(obj);
  $("dlgCompany").close(); markDirty();
}

function deleteCompany() {
  if (!editingCompany || !confirm(`Delete ${editingCompany.name}?`)) return;
  data.companies = data.companies.filter(c => c !== editingCompany);
  $("dlgCompany").close(); markDirty();
}

function openNews(id) {
  const f = $("formNews");
  const n = id ? data.announcements.find(x => x.id === id) : null;
  editingNews = n; f.reset();
  $("btnDeleteNews").hidden = !n;
  f.elements.title.value = n ? n.title : "";
  f.elements.body.value = n ? n.body || "" : "";
  f.elements.date.value = n ? n.date || "" : new Date().toISOString().slice(0, 10);
  f.elements.pinned.checked = !!(n && n.pinned);
  $("dlgNews").showModal();
}

function saveNews(e) {
  e.preventDefault();
  const f = $("formNews");
  const obj = { id: editingNews ? editingNews.id : "a" + uid(), title: f.elements.title.value.trim(), date: f.elements.date.value, body: f.elements.body.value.trim(), pinned: f.elements.pinned.checked };
  if (editingNews) Object.assign(editingNews, obj); else data.announcements.push(obj);
  $("dlgNews").close(); markDirty();
}

function deleteNews() {
  if (!editingNews || !confirm("Delete this announcement?")) return;
  data.announcements = data.announcements.filter(n => n !== editingNews);
  $("dlgNews").close(); markDirty();
}

function openStats() {
  const f = $("formStats");
  for (const k of ["companies", "offers", "highestCtc", "averageCtc"]) f.elements[k].value = data.stats[k] || "";
  $("dlgStats").showModal();
}
function saveStats(e) {
  e.preventDefault();
  const f = $("formStats");
  for (const k of ["companies", "offers", "highestCtc", "averageCtc"]) data.stats[k] = f.elements[k].value.trim();
  $("dlgStats").close(); markDirty();
}

/* ---------------- wiring ---------------- */
function wire() {
  document.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", () => b.closest("dialog").close()));

  $("btnLogin").addEventListener("click", () => {
    $("loginRepo").value = $("loginRepo").value || detectRepo();
    $("loginErr").textContent = "";
    $("dlgLogin").showModal();
  });
  $("formLogin").addEventListener("submit", async e => {
    e.preventDefault();
    const btn = $("btnDoLogin"); btn.disabled = true; btn.textContent = "Checking…";
    try {
      await login($("loginRepo").value, $("loginToken").value, $("loginRemember").checked);
      $("loginToken").value = "";
      $("dlgLogin").close();
      toast("Logged in as admin.");
    } catch (err) {
      $("loginErr").textContent = err.message;
    } finally { btn.disabled = false; btn.textContent = "Log in"; }
  });
  $("btnLogout").addEventListener("click", logout);
  $("btnAddCompany").addEventListener("click", () => openCompany(null));
  $("btnAddNews").addEventListener("click", () => openNews(null));
  $("btnEditStats").addEventListener("click", openStats);
  $("btnPublish").addEventListener("click", publish);
  $("btnExport").addEventListener("click", exportJson);
  $("formCompany").addEventListener("submit", saveCompany);
  $("btnDeleteCompany").addEventListener("click", deleteCompany);
  $("formNews").addEventListener("submit", saveNews);
  $("btnDeleteNews").addEventListener("click", deleteNews);
  $("formStats").addEventListener("submit", saveStats);

  document.addEventListener("click", e => {
    const c = e.target.closest("[data-edit-company]"); if (c && admin) openCompany(c.dataset.editCompany);
    const n = e.target.closest("[data-edit-news]"); if (n && admin) openNews(n.dataset.editNews);
  });
  window.addEventListener("beforeunload", e => { if (dirty) { e.preventDefault(); e.returnValue = ""; } });
}

(async function init() {
  renderStatic();
  wire();
  await loadData();
  renderAll();
  const saved = store.get("ruas_admin");
  if (saved) {
    try {
      const s = JSON.parse(saved);
      admin = { owner: s.owner, repo: s.repo, token: s.token };
      const r = await gh(`/repos/${s.owner}/${s.repo}`);
      if (!r.permissions || !r.permissions.push) throw new Error("no access");
      const u = await gh("/user").catch(() => null);
      admin.login = u ? u.login : s.owner;
      await enterAdmin();
    } catch { admin = null; store.del("ruas_admin"); }
  }
})();
