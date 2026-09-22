const ALL_COLUMNS = [
  { key: "book", label: "Book" },
  { key: "verse", label: "Verse" },
  { key: "clhebrew", label: "Clause (Hebrew)", heb: true },
  { key: "SBL_cltransliteration", label: "Clause (Transliteration)" },
  { key: "clgloss", label: "Clause (Gloss)" },
  { key: "cltranslation", label: "Clause (Translation)" },
  { key: "vinflected", label: "Verb (Inflected)", heb: true },
  { key: "vroot", label: "Verb Root", heb: true },
  { key: "vbinyan", label: "Binyan" },
  { key: "vconjugation", label: "Conjugation" },
  { key: "vtype", label: "Verb Type" },
  { key: "xphebrew", label: "Phrase", heb: true },
  { key: "SBL_xptransliteration", label: "Phrase (Transliteration)" },
  { key: "xpgloss", label: "Gloss" },
  { key: "xpcategory", label: "Cat." },
  { key: "type", label: "Type" },
  { key: "subtype", label: "Subtype" },
  { key: "relation", label: "Relation" },
  { key: "agreement", label: "Agreement" },
  { key: "marker", label: "Marker" },
  { key: "word_order", label: "Word Order" },
  { key: "determination", label: "Determination" },
  { key: "cognate", label: "Cognate" },
  { key: "conjuncts_num", label: "Conjuncts #" },
  { key: "notes", label: "Notes" },
];

const DEFAULT_VISIBLE = [
  "verse", "vroot", "xphebrew", "xpgloss", "xpcategory",
  "type", "subtype", "relation", "marker", "word_order", "determination",
];

const STORAGE_KEY = "bhad_visible_columns";

const FILTER_FIELDS = [
  "book", "type", "subtype", "relation", "marker", "word_order",
  "determination", "vbinyan", "vconjugation", "xpcategory", "vtype",
  "agreement", "cognate",
];

const SEARCH_FIELDS = [
  "clhebrew", "SBL_cltransliteration", "clgloss", "cltranslation",
  "xphebrew", "SBL_xptransliteration", "xpgloss",
  "vinflected", "vroot", "notes", "verse",
];

// Hebrew in data.json mixes presentation forms (e.g. U+FB33 dalet with dagesh)
// with fully pointed, cantillated text, so a plain substring test misses
// ordinary queries. Search compares a folded key instead: NFKD splits the
// presentation forms, points and accents (U+0591–U+05C7) are dropped, and a
// maqaf becomes a space so "הארץ" finds "עַל־הָאָ֑רֶץ". Displayed text is untouched.
function searchKey(s) {
  return String(s)
    .normalize("NFKD")
    .replace(/\u05BE/g, " ")
    .replace(/[\u0591-\u05C7*]/g, "")
    .toLowerCase();
}

// One folded key per searchable field, per row, built once at load.
const SEARCH_KEYS = new Map();
function buildSearchKeys(rows) {
  rows.forEach((row) => {
    SEARCH_KEYS.set(row, SEARCH_FIELDS.filter((f) => row[f]).map((f) => searchKey(row[f])));
  });
}

// Sections rendered in the detail panel. "triplet" sections get word-by-word
// interlinear alignment when the Hebrew/transliteration/gloss token counts match.
const DETAIL_SECTIONS = [
  {
    title: "Clause",
    triplet: { section: "clause", heb: "clhebrew", translit: "SBL_cltransliteration", gloss: "clgloss" },
    fields: [
      ["verse", "Verse"],
      ["cltranslation", "Translation"],
    ],
  },
  {
    title: "Verb",
    fields: [
      ["vinflected", "Inflected form", true],
      ["vroot", "Root", true],
      ["vbinyan", "Binyan"],
      ["vconjugation", "Conjugation"],
      ["vtype", "Verb type"],
    ],
  },
  {
    title: "Phrase",
    triplet: { section: "phrase", heb: "xphebrew", translit: "SBL_xptransliteration", gloss: "xpgloss" },
    fields: [
      ["xpcategory", "Category"],
    ],
  },
  {
    title: "Syntactic Analysis",
    fields: [
      ["type", "Type"],
      ["subtype", "Subtype"],
      ["relation", "Relation"],
      ["agreement", "Agreement"],
      ["marker", "Marker"],
      ["word_order", "Word order"],
      ["determination", "Determination"],
      ["cognate", "Cognate"],
      ["conjuncts_num", "Conjuncts #"],
    ],
  },
  {
    title: "Notes",
    fields: [["notes", "Notes"]],
  },
];

let DATA = [];
let filtered = [];
let sortKey = null;
let sortDir = 1;
const activeFilters = {};
let visibleColumns = loadVisibleColumns();

function loadVisibleColumns() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(stored) && stored.length) return new Set(stored);
  } catch (e) { /* ignore malformed storage */ }
  return new Set(DEFAULT_VISIBLE);
}

function saveVisibleColumns() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...visibleColumns]));
}

// Human-confirmed word groupings for entries whose Hebrew/transliteration/gloss
// token counts don't line up 1:1 (produced by the review tool, see review.html).
// Optional: absent or malformed, the site just falls back to unaligned text.
let ALIGNMENT_OVERRIDES = {};

async function loadOverrides() {
  try {
    const res = await fetch("alignment_overrides.json", { cache: "no-cache" });
    if (!res.ok) return;
    const data = await res.json();
    if (data && typeof data.entries === "object") ALIGNMENT_OVERRIDES = data.entries;
  } catch (e) { /* no overrides published yet */ }
}

// Several verse_0s entries (e.g. "Deut 02:09a" / "Deut 02:09b") share the same
// human-readable "verse" text, which otherwise makes distinct rows look like
// duplicates in the table and detail panel. Where verse_0s carries a trailing
// letter tag that's unique within the group, surface it in the detail panel.
// Groups where that tag is missing or doesn't disambiguate are left alone
// rather than guessed at.
function markVerseSuffixes(rows) {
  const byVerse = new Map();
  rows.forEach((row) => {
    if (!byVerse.has(row.verse)) byVerse.set(row.verse, []);
    byVerse.get(row.verse).push(row);
  });

  byVerse.forEach((group) => {
    if (new Set(group.map((r) => r.verse_0s)).size <= 1) return;
    const tags = group.map((r) => (r.verse_0s.match(/[a-zA-Z]+$/) || [""])[0]);
    const disambiguates = tags.every((t) => t) && new Set(tags).size === tags.length;
    if (!disambiguates) return;
    group.forEach((r, i) => { r._verseSuffix = tags[i]; });
  });
}

// Notes mark italics (transliterations, Latin terms) as *text*.
function setMarkedText(el, text) {
  el.textContent = "";
  String(text).split(/(\*[^*]+\*)/).forEach((part) => {
    if (/^\*[^*]+\*$/.test(part)) {
      const i = document.createElement("i");
      i.textContent = part.slice(1, -1);
      el.appendChild(i);
    } else if (part) {
      el.appendChild(document.createTextNode(part));
    }
  });
}

// Hebrew columns occasionally hold an English label ("null copula"), set small.
function hebrewClass(val) {
  return /[א-תיִ-ﭏ]/.test(val ?? "") ? "heb" : "heb-label";
}

// Detail-panel label: clause letters attach to the verse, entry numerals go in
// parentheses ("biii" -> "Exod 26:1b (iii)").
function verseLabel(row) {
  const m = (row._verseSuffix || "").match(/^([a-h]*)([ivx]*)$/);
  if (!m || !row._verseSuffix) return row.verse;
  return row.verse + m[1] + (m[2] ? ` (${m[2]})` : "");
}

async function init() {
  // Revalidate rather than trust the cache: a rebuilt data.json must not be
  // masked by a stale copy. An unchanged file still costs only a 304.
  const res = await fetch("data.json", { cache: "no-cache" });
  DATA = await res.json();
  markVerseSuffixes(DATA);
  buildSearchKeys(DATA);
  await loadOverrides();
  buildFilters();
  buildColumnPicker();
  buildHeader();
  attachEvents();
  applyFilters();
  updateTableMaxHeight();
  window.addEventListener("resize", updateTableMaxHeight);
}

function updateTableMaxHeight() {
  const wrap = document.querySelector(".table-wrap");
  const spaceAbove = wrap.getBoundingClientRect().top;
  const available = window.innerHeight - spaceAbove - 24;
  document.documentElement.style.setProperty("--table-max-height", Math.max(available, 240) + "px");
}

function buildFilters() {
  const container = document.getElementById("filters");
  FILTER_FIELDS.forEach((field) => {
    const values = [...new Set(DATA.map((r) => r[field]).filter((v) => v !== null && v !== undefined && v !== ""))];
    values.sort((a, b) => String(a).localeCompare(String(b)));
    if (values.length === 0) return;
    const select = document.createElement("select");
    select.dataset.field = field;
    const allOpt = document.createElement("option");
    allOpt.value = "";
    allOpt.textContent = fieldLabel(field) + ": All";
    select.appendChild(allOpt);
    values.forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v;
      opt.textContent = v;
      select.appendChild(opt);
    });
    select.addEventListener("change", () => {
      if (select.value) activeFilters[field] = select.value;
      else delete activeFilters[field];
      applyFilters();
    });
    container.appendChild(select);
  });
}

function fieldLabel(field) {
  const found = ALL_COLUMNS.find((c) => c.key === field);
  if (found) return found.label;
  return field
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildColumnPicker() {
  const list = document.getElementById("columnsList");
  list.innerHTML = "";
  ALL_COLUMNS.forEach((col) => {
    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = visibleColumns.has(col.key);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) visibleColumns.add(col.key);
      else visibleColumns.delete(col.key);
      saveVisibleColumns();
      buildHeader();
      renderTable();
    });
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(col.label));
    list.appendChild(label);
  });

  const btn = document.getElementById("columnsBtn");
  const panel = document.getElementById("columnsPanel");
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const willOpen = panel.hidden;
    panel.hidden = !willOpen;
    btn.setAttribute("aria-expanded", String(willOpen));
  });
  document.addEventListener("click", (e) => {
    if (!panel.hidden && !panel.contains(e.target) && e.target !== btn) {
      panel.hidden = true;
      btn.setAttribute("aria-expanded", "false");
    }
  });

  document.getElementById("resetColumnsBtn").addEventListener("click", () => {
    visibleColumns = new Set(DEFAULT_VISIBLE);
    saveVisibleColumns();
    list.querySelectorAll("input[type=checkbox]").forEach((cb, i) => {
      cb.checked = visibleColumns.has(ALL_COLUMNS[i].key);
    });
    buildHeader();
    renderTable();
  });
}

function visibleColumnDefs() {
  return ALL_COLUMNS.filter((c) => visibleColumns.has(c.key));
}

function buildHeader() {
  const row = document.getElementById("headerRow");
  row.innerHTML = "";
  visibleColumnDefs().forEach((col) => {
    const th = document.createElement("th");
    th.textContent = col.label;
    th.dataset.key = col.key;
    th.addEventListener("click", () => {
      if (sortKey === col.key) {
        sortDir *= -1;
      } else {
        sortKey = col.key;
        sortDir = 1;
      }
      renderHeaderSortState();
      renderTable();
    });
    row.appendChild(th);
  });
  renderHeaderSortState();
}

function renderHeaderSortState() {
  document.querySelectorAll("#headerRow th").forEach((th) => {
    th.classList.remove("sorted");
    th.removeAttribute("data-dir");
    if (th.dataset.key === sortKey) {
      th.classList.add("sorted");
      th.setAttribute("data-dir", sortDir === 1 ? "▲" : "▼");
    }
  });
}

function attachEvents() {
  document.getElementById("searchBox").addEventListener("input", applyFilters);
  document.getElementById("clearBtn").addEventListener("click", () => {
    document.getElementById("searchBox").value = "";
    Object.keys(activeFilters).forEach((k) => delete activeFilters[k]);
    document.querySelectorAll(".filters select").forEach((s) => (s.value = ""));
    applyFilters();
  });
  document.getElementById("closeDetail").addEventListener("click", closeDetail);
  document.getElementById("detailOverlay").addEventListener("click", (e) => {
    if (e.target.id === "detailOverlay") closeDetail();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDetail();
  });
}

function applyFilters() {
  const q = searchKey(document.getElementById("searchBox").value).trim();
  filtered = DATA.filter((row) => {
    for (const field of Object.keys(activeFilters)) {
      if (String(row[field]) !== activeFilters[field]) return false;
    }
    if (!q) return true;
    return SEARCH_KEYS.get(row).some((key) => key.includes(q));
  });
  renderTable();
}

function renderTable() {
  if (sortKey) {
    filtered.sort((a, b) => {
      const av = a[sortKey] ?? "";
      const bv = b[sortKey] ?? "";
      return String(av).localeCompare(String(bv), undefined, { numeric: true }) * sortDir;
    });
  }

  const cols = visibleColumnDefs();
  const tbody = document.getElementById("tableBody");
  tbody.innerHTML = "";
  const frag = document.createDocumentFragment();

  filtered.forEach((row) => {
    const tr = document.createElement("tr");
    cols.forEach((col) => {
      const td = document.createElement("td");
      const val = row[col.key];
      const empty = val === null || val === undefined || val === "";
      // An empty relation is meaningful (no adverbial relation applies), so
      // print a dash rather than leave a blank that reads as an omission.
      if (col.key === "notes" && val) setMarkedText(td, val);
      else td.textContent = empty && col.key === "relation" ? "–" : val ?? "";
      td.dataset.key = col.key;
      if (col.heb) td.classList.add(hebrewClass(val));
      if (val === null || val === undefined || val === "") td.classList.add("dim");
      tr.appendChild(td);
    });
    tr.addEventListener("click", () => openDetail(row));
    frag.appendChild(tr);
  });

  tbody.appendChild(frag);
  document.getElementById("resultCount").textContent = `${filtered.length} / ${DATA.length} rows`;
  document.getElementById("emptyMsg").hidden = filtered.length !== 0;
}

function tokenize(str) {
  return str.trim().split(/\s+/).filter(Boolean);
}

// Hebrew letters, incl. precomposed presentation forms (e.g. שׁ/שׂ as single
// codepoints). Used to drop standalone cantillation marks like paseq (׀) and
// sof pasuq (׃) that appear as their own space-delimited "word" in clhebrew/
// xphebrew but have no counterpart in the transliteration or gloss.
const HEBREW_LETTER = /[א-תיִ-ﭏ]/;

function tokenizeHebrew(str) {
  return tokenize(str).filter((t) => HEBREW_LETTER.test(t));
}

// A confirmed grouping only counts if it still describes the data it was made
// against: same token counts, and all three tiers the same length. Otherwise the
// source has changed since review and we fall back rather than mis-align.
function overrideFor(row, triplet) {
  const entry = ALIGNMENT_OVERRIDES[`${row.verse_0s}|${triplet.section}`];
  if (!entry || !entry.groups) return null;

  const { heb, translit, gloss } = entry.groups;
  if (![heb, translit, gloss].every(Array.isArray)) return null;
  if (heb.length !== translit.length || heb.length !== gloss.length) return null;

  const expected = entry.src_counts;
  if (Array.isArray(expected)) {
    const actual = [
      tokenizeHebrew(row[triplet.heb]).length,
      tokenize(row[triplet.translit]).length,
      tokenize(row[triplet.gloss]).length,
    ];
    if (expected.some((n, i) => n !== actual[i])) return null;
  }

  return { hebTokens: heb, translitTokens: translit, glossTokens: gloss };
}

function buildInterlinear(row, triplet) {
  const heb = row[triplet.heb];
  const translit = row[triplet.translit];
  const gloss = row[triplet.gloss];
  if (!heb || !translit || !gloss) return null;

  let hebTokens = tokenizeHebrew(heb);
  let translitTokens = tokenize(translit);
  let glossTokens = tokenize(gloss);

  if (hebTokens.length !== translitTokens.length || hebTokens.length !== glossTokens.length) {
    const override = overrideFor(row, triplet);
    if (!override) return null;
    ({ hebTokens, translitTokens, glossTokens } = override);
  }

  const wrap = document.createElement("div");
  wrap.className = "interlinear";
  hebTokens.forEach((h, i) => {
    const word = document.createElement("div");
    word.className = "interlinear-word";
    const hebEl = document.createElement("div");
    hebEl.className = "heb";
    hebEl.textContent = h;
    const translitEl = document.createElement("div");
    translitEl.className = "translit";
    translitEl.textContent = translitTokens[i];
    const glossEl = document.createElement("div");
    glossEl.className = "gloss";
    glossEl.textContent = glossTokens[i];
    word.appendChild(hebEl);
    word.appendChild(translitEl);
    word.appendChild(glossEl);
    wrap.appendChild(word);
  });
  return wrap;
}

function buildTripletFallback(row, triplet) {
  const wrap = document.createElement("div");

  const note = document.createElement("p");
  note.className = "alignment-note";
  note.textContent = "Word-by-word alignment isn't available for this entry (the Hebrew, transliteration, and gloss have different word counts in the source data) — showing the full text instead.";
  wrap.appendChild(note);

  const grid = document.createElement("div");
  grid.className = "detail-grid";
  [
    [triplet.heb, "Hebrew", true],
    [triplet.translit, "Transliteration"],
    [triplet.gloss, "Gloss"],
  ].forEach(([key, label, isHeb]) => {
    const val = row[key];
    if (val === null || val === undefined || val === "") return;
    const wrapper = document.createElement("div");
    const labelEl = document.createElement("div");
    labelEl.className = "field-label";
    labelEl.textContent = label;
    const valueEl = document.createElement("div");
    valueEl.className = "field-value" + (isHeb ? " " + hebrewClass(val) : "");
    valueEl.textContent = val;
    wrapper.appendChild(labelEl);
    wrapper.appendChild(valueEl);
    grid.appendChild(wrapper);
  });
  wrap.appendChild(grid);
  return wrap;
}

function openDetail(row) {
  const content = document.getElementById("detailContent");
  content.innerHTML = "";

  DETAIL_SECTIONS.forEach((section) => {
    const tripletHasContent = section.triplet &&
      section.triplet && (row[section.triplet.heb] || row[section.triplet.translit] || row[section.triplet.gloss]);
    const fieldsHaveContent = section.fields.some(([key]) => row[key] !== null && row[key] !== undefined && row[key] !== "");
    if (!tripletHasContent && !fieldsHaveContent) return;

    const titleEl = document.createElement("div");
    titleEl.className = "section-title";
    titleEl.textContent = section.title;
    content.appendChild(titleEl);

    if (section.triplet && tripletHasContent) {
      const interlinear = buildInterlinear(row, section.triplet);
      content.appendChild(interlinear || buildTripletFallback(row, section.triplet));
    }

    if (fieldsHaveContent) {
      const grid = document.createElement("div");
      grid.className = "detail-grid";

      section.fields.forEach(([key, label, isHeb]) => {
        const val = key === "verse" ? verseLabel(row) : row[key];
        if (val === null || val === undefined || val === "") return;
        const wrapper = document.createElement("div");
        const labelEl = document.createElement("div");
        labelEl.className = "field-label";
        labelEl.textContent = label;
        const valueEl = document.createElement("div");
        valueEl.className = "field-value" + (isHeb ? " " + hebrewClass(val) : "");
        if (key === "notes") setMarkedText(valueEl, val);
        else valueEl.textContent = val;
        wrapper.appendChild(labelEl);
        wrapper.appendChild(valueEl);
        grid.appendChild(wrapper);
      });

      content.appendChild(grid);
    }
  });

  document.getElementById("detailOverlay").hidden = false;
}

function closeDetail() {
  document.getElementById("detailOverlay").hidden = true;
}

init();
