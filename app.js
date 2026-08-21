const DEFAULT_API_URL = "";
const DEFAULT_BOOTSTRAP = {
  schoolName: "School Fee Management",
  academicYear: "",
  role: "",
  userId: "",
  classes: [],
  feeHeads: [],
  schedules: [],
  categories: [],
  partners: []
};

const state = {
  token: localStorage.getItem("feeToken") || "",
  bootstrap: JSON.parse(localStorage.getItem("feeBootstrap") || "null"),
  theme: localStorage.getItem("feeTheme") || "light",
  view: "dashboard",
  mobileMenuOpen: false,
  studentModalOpen: false,
  collectModalOpen: false,
  stale: {
    dashboard: true,
    students: true,
    receipts: true,
    expenses: true,
    dueReport: true,
    analytics: true,
    finances: true,
    partners: true,
    logs: true,
    setup: true
  },
  loading: {
    active: false,
    view: "",
    startedAt: 0,
    timerId: null
  },
  actionLoading: {
    active: false,
    label: "",
    startedAt: 0,
    timerId: null
  },
  dashboard: null,
  students: [],
  receipts: [],
  expenses: [],
  expensesMeta: { rows: [], total: 0, page: 1, pageSize: 25, totalPages: 1 },
  expenseFilters: {
    status: "",
    page: 1,
    pageSize: 25
  },
  dueReport: [],
  dueReportMeta: { rows: [], total: 0, page: 1, pageSize: 25, totalPages: 1 },
  dueFilters: {
    asOnDate: new Date().toISOString().slice(0, 10),
    activeOnly: true,
    minimumDueAmount: "",
    maximumDueAmount: "",
    page: 1,
    pageSize: 25
  },
  analytics: null,
  analyticsFilters: {
    asOfDate: new Date().toISOString().slice(0, 10),
    paymentMode: "",
    studentName: "",
    rangePreset: "last7days"
  },
  finances: null,
  partners: [],
  logs: [],
  logsMeta: { rows: [], total: 0, page: 1, pageSize: 25, totalPages: 1 },
  logFilters: {
    loginId: "",
    actionName: "",
    page: 1,
    pageSize: 25
  },
  ledger: null,
  collectLedger: null,
  reassignDraft: null,
  scheduleDraft: {
    feeHead: "",
    instalmentCount: 1,
    dates: [""]
  },
  setupSection: "heads",
  collectStudentId: "",
  collectReceiptHistory: [],
  collectReceiptMeta: { rows: [], total: 0, page: 1, pageSize: 20, totalPages: 1 },
  studentSearch: "",
  studentClassFilter: "",
  studentStatusFilter: "Active",
  selectedReceipt: null,
  secretPrompt: null,
  message: "",
  error: "",
  messageTimerId: null
};

const SLOW_VIEWS = new Set(["logs", "analytics", "finances", "partners"]);

function formatCurrency(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function qs(selector) {
  return document.querySelector(selector);
}

function safe(obj, path, fallback) {
  const result = path.split(".").reduce((curr, key) => (curr && curr[key] !== undefined ? curr[key] : undefined), obj);
  return result === undefined ? fallback : result;
}

function getClassFeeConfigs(classItem) {
  if (classItem && Array.isArray(classItem.feeHeadConfigs) && classItem.feeHeadConfigs.length) {
    return classItem.feeHeadConfigs.map(item => ({
      headName: item.headName,
      actualFee: Number(item.actualFee || 0)
    }));
  }
  if (classItem && Array.isArray(classItem.feeHeads) && classItem.feeHeads.length) {
    return classItem.feeHeads.map(headName => ({
      headName,
      actualFee: 0
    }));
  }
  return safe(state, "bootstrap.feeHeads", []).map(item => ({
    headName: item.headName,
    actualFee: 0
  }));
}

function getDefaultStudentJoinedDate(classItem) {
  const feeHeadNames = getClassFeeConfigs(classItem).map(item => item.headName);
  const schedules = safe(state, "bootstrap.schedules", [])
    .filter(item => feeHeadNames.includes(item.feeHead))
    .map(item => String(item.dueDate || "").slice(0, 10))
    .filter(Boolean)
    .sort();
  return schedules[0] || new Date().toISOString().slice(0, 10);
}

function getApiUrl() {
  return localStorage.getItem("feeApiUrl") || DEFAULT_API_URL;
}

function ensureApiUrl(interactive = false) {
  let apiUrl = getApiUrl();
  if (!apiUrl && interactive) {
    apiUrl = window.prompt("Enter your Apps Script web app URL");
    if (apiUrl) {
      localStorage.setItem("feeApiUrl", apiUrl.trim());
      apiUrl = apiUrl.trim();
    }
  }
  return apiUrl || "";
}

function formatValue(value, kind = "text") {
  if (kind === "currency") {
    return formatCurrency(value);
  }
  if (kind === "number") {
    return Number(value || 0).toLocaleString("en-IN");
  }
  return value ?? "";
}

function formatElapsed(ms) {
  const totalSeconds = Math.floor(Math.max(0, ms) / 1000);
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function formatCountdown(ms, totalSeconds = 10) {
  const elapsedSeconds = Math.floor(Math.max(0, ms) / 1000);
  const remaining = Math.max(0, totalSeconds - elapsedSeconds);
  const minutes = String(Math.floor(remaining / 60)).padStart(2, "0");
  const seconds = String(remaining % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function formatDateOnly(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value).slice(0, 10);
  }
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startLoading(view) {
  stopLoading();
  state.loading.active = true;
  state.loading.view = view;
  state.loading.startedAt = Date.now();
  state.loading.timerId = window.setInterval(() => render(), 1000);
}

function stopLoading() {
  if (state.loading.timerId) {
    window.clearInterval(state.loading.timerId);
  }
  state.loading.active = false;
  state.loading.view = "";
  state.loading.startedAt = 0;
  state.loading.timerId = null;
}

function startActionLoading(label) {
  stopActionLoading();
  state.actionLoading.active = true;
  state.actionLoading.label = label || "Processing";
  state.actionLoading.startedAt = Date.now();
  state.actionLoading.timerId = window.setInterval(() => render(), 1000);
  render();
}

function stopActionLoading() {
  if (state.actionLoading.timerId) {
    window.clearInterval(state.actionLoading.timerId);
  }
  state.actionLoading.active = false;
  state.actionLoading.label = "";
  state.actionLoading.startedAt = 0;
  state.actionLoading.timerId = null;
}

async function runAction(label, work) {
  startActionLoading(label);
  try {
    return await work();
  } finally {
    stopActionLoading();
  }
}

function markStale(keys) {
  keys.forEach(key => {
    if (state.stale[key] !== undefined) state.stale[key] = true;
  });
}

function markFresh(keys) {
  keys.forEach(key => {
    if (state.stale[key] !== undefined) state.stale[key] = false;
  });
}

async function api(action, payload = {}, token = state.token) {
  const apiUrl = ensureApiUrl(false);
  if (!apiUrl) {
    throw new Error("Apps Script web app URL is missing.");
  }
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, payload, token })
  });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    if (/^\s*</.test(text)) {
      throw new Error("Apps Script returned an HTML page instead of JSON. Redeploy the web app and confirm access is set correctly.");
    }
    throw new Error("Invalid response from Apps Script.");
  }
  if (!data.success) {
    throw new Error(data.error || "Request failed");
  }
  return data.data;
}

function setMessage(message, isError = false) {
  if (state.messageTimerId) {
    window.clearTimeout(state.messageTimerId);
    state.messageTimerId = null;
  }
  state.message = isError ? "" : message;
  state.error = isError ? message : "";
  render();
  if (message) {
    state.messageTimerId = window.setTimeout(() => {
      state.message = "";
      state.error = "";
      state.messageTimerId = null;
      render();
    }, 10000);
  }
}

function setBootstrap(patch) {
  state.bootstrap = Object.assign({}, DEFAULT_BOOTSTRAP, state.bootstrap || {}, patch || {});
  localStorage.setItem("feeBootstrap", JSON.stringify(state.bootstrap));
}

function setTheme(theme) {
  state.theme = theme === "dark" ? "dark" : "light";
  localStorage.setItem("feeTheme", state.theme);
}

async function ensureBootstrapData() {
  const needsFullBootstrap =
    !state.bootstrap ||
    !Array.isArray(state.bootstrap.classes) ||
    !Array.isArray(state.bootstrap.feeHeads) ||
    !Array.isArray(state.bootstrap.categories) ||
    !Array.isArray(state.bootstrap.partners) ||
    !Array.isArray(state.bootstrap.schedules);
  if (needsFullBootstrap || state.stale.setup) {
    setBootstrap(await api("getBootstrap"));
    markFresh(["setup"]);
  }
}

async function init() {
  if (!state.token) {
    render();
    return;
  }
  try {
    if (!state.bootstrap) {
      setBootstrap(DEFAULT_BOOTSTRAP);
    }
    render();
    loadViewData(state.view).catch(error => {
      localStorage.removeItem("feeToken");
      localStorage.removeItem("feeBootstrap");
      state.token = "";
      state.bootstrap = null;
      setMessage(error.message, true);
      render();
    });
  } catch (error) {
    localStorage.removeItem("feeToken");
    localStorage.removeItem("feeBootstrap");
    state.token = "";
    state.bootstrap = null;
    setMessage(error.message, true);
  }
  render();
}

async function loadViewData(view) {
  state.view = view;
  if (!state.token) {
    render();
    return;
  }
  const needsFetch =
    (view === "dashboard" && (state.stale.dashboard || !state.dashboard)) ||
    (view === "students" && state.stale.students) ||
    (view === "expenses" && (state.stale.expenses || state.stale.receipts)) ||
    (view === "due-report" && state.stale.dueReport) ||
    (view === "analytics" && state.stale.analytics) ||
    (view === "finances" && (state.stale.finances || state.stale.partners)) ||
    (view === "logs" && state.stale.logs) ||
    (view === "setup" && (state.stale.setup || !state.bootstrap));
  if (needsFetch) {
    startLoading(view);
  }
  render();
  try {
    if (view === "dashboard" && (state.stale.dashboard || !state.dashboard)) {
      state.dashboard = await api("getDashboard");
      markFresh(["dashboard"]);
    }
    if (view === "students" && state.stale.students) {
      await ensureBootstrapData();
      state.students = await api("listStudents");
      markFresh(["students"]);
    }
    if (view === "expenses" && (state.stale.expenses || state.stale.receipts)) {
      await ensureBootstrapData();
      const expenseResponse = await api("listExpenses", {
        status: state.expenseFilters.status,
        paginated: true,
        page: state.expenseFilters.page,
        pageSize: state.expenseFilters.pageSize
      });
      state.expenses = expenseResponse.rows;
      state.expensesMeta = expenseResponse;
      const receiptResponse = await api("listReceipts", {
        paymentMode: "Cash",
        status: "Valid",
        paginated: true,
        page: 1,
        pageSize: 200
      });
      state.receipts = receiptResponse.rows;
      markFresh(["expenses"]);
      markFresh(["receipts"]);
    }
    if (view === "due-report" && state.stale.dueReport) {
      const dueResponse = await api("getDueReport", {
        asOnDate: state.dueFilters.asOnDate,
        activeOnly: state.dueFilters.activeOnly,
        minimumDueAmount: state.dueFilters.minimumDueAmount,
        maximumDueAmount: state.dueFilters.maximumDueAmount,
        paginated: true,
        page: state.dueFilters.page,
        pageSize: state.dueFilters.pageSize
      });
      state.dueReport = dueResponse.rows;
      state.dueReportMeta = dueResponse;
      markFresh(["dueReport"]);
    }
    if (view === "analytics" && state.stale.analytics) {
      state.analytics = await api("getAnalytics", {
        asOfDate: state.analyticsFilters.asOfDate,
        paymentMode: state.analyticsFilters.paymentMode,
        studentName: state.analyticsFilters.studentName,
        rangePreset: state.analyticsFilters.rangePreset
      });
      markFresh(["analytics"]);
    }
    if (view === "finances" && state.stale.finances) {
      state.finances = await api("getFinances");
      markFresh(["finances"]);
    }
    if (view === "finances" && state.stale.partners) {
      state.partners = await api("getPartnerAccounts");
      markFresh(["partners"]);
    }
    if (view === "logs" && state.stale.logs) {
      const logResponse = await api("listLogs", {
        loginId: state.logFilters.loginId,
        actionName: state.logFilters.actionName,
        paginated: true,
        page: state.logFilters.page,
        pageSize: state.logFilters.pageSize
      });
      state.logs = logResponse.rows;
      state.logsMeta = logResponse;
      markFresh(["logs"]);
    }
    if (view === "setup" && (state.stale.setup || !state.bootstrap)) {
      await ensureBootstrapData();
    }
  } finally {
    stopLoading();
  }
  render();
}

function visibleMenu() {
  const items = [
    ["dashboard", "Dashboard"],
    ["students", "Student Fees Data"],
    ["due-report", "Due Report"],
    ["expenses", "Expenses"]
  ];
  if (safe(state, "bootstrap.role", "") === "Senior Admin") {
    items.push(
      ["analytics", "Fee Analytics"],
      ["finances", "Finances"],
      ["logs", "Logs"],
      ["setup", "Setup"]
    );
  }
  return items;
}

function renderLogin() {
  return `
    <div class="login">
      <div class="login-shell">
        <section class="login-showcase">
          <div class="eyebrow">School Operations Suite</div>
          <div class="brand">School Fee Management</div>
          <h1>Fast counter collections. Clear financial control.</h1>
          <p>Built for the morning fee rush, with reports separated from daily collection work so the counter stays fast.</p>
          <div class="login-stat-row">
            <div class="login-stat">
              <strong>Instant</strong>
              <span>Daily collection screens</span>
            </div>
            <div class="login-stat">
              <strong>20 sec</strong>
              <span>Visible loading countdown</span>
            </div>
            <div class="login-stat">
              <strong>Audit ready</strong>
              <span>Receipts, logs, and handovers</span>
            </div>
          </div>
        </section>
        <div class="panel login-card stack">
          <div class="login-card-head">
            <div class="eyebrow">Secure Sign In</div>
            <div class="brand">Welcome Back</div>
            <div class="muted">Use your operator account to continue.</div>
          </div>
          <div class="login-input-grid">
          <label>Login ID
            <select id="login-user">
              <option value="Admin">Admin</option>
              <option value="Senior Admin">Senior Admin</option>
            </select>
          </label>
          <label>Password<input id="login-password" type="password" /></label>
          </div>
          <button class="primary login-submit" onclick="handleLogin()">Enter Dashboard</button>
          ${state.error ? `<div class="error">${state.error}</div>` : ""}
          <div class="login-note">Initial credentials are temporary. Change both passwords immediately after first login.</div>
        </div>
      </div>
    </div>
  `;
}

function renderCards(cards, options = {}) {
  function cardTone(label) {
    var text = String(label || "").toLowerCase();
    if (text.indexOf("cash") !== -1) return "card-cash";
    if (text.indexOf("upi") !== -1) return "card-upi";
    if (text.indexOf("due") !== -1) return "card-due";
    if (text.indexOf("student") !== -1) return "card-students";
    if (text.indexOf("collected") !== -1) return "card-collected";
    return "card-neutral";
  }
  function cardNote(label) {
    var text = String(label || "").toLowerCase();
    if (text.indexOf("cash") !== -1) return "Counter cash";
    if (text.indexOf("upi") !== -1) return "Digital flow";
    if (text.indexOf("due") !== -1) return "Attention needed";
    if (text.indexOf("student") !== -1) return "Live strength";
    if (text.indexOf("collected") !== -1) return "Recorded receipts";
    return "Operational summary";
  }
  return `<div class="cards ${options.className || ""}">${cards.map(card => `
    <div class="card ${cardTone(card.label)}">
      <div class="muted">${card.label}</div>
      <div class="value">${formatValue(card.value, card.kind || (typeof card.value === "number" ? "currency" : "text"))}</div>
      <div class="card-note">${cardNote(card.label)}</div>
    </div>`).join("")}
  </div>`;
}

function renderTable(headers, rows) {
  return `
    <div class="table-wrap">
      <table>
        <thead><tr>${headers.map(header => `<th>${header}</th>`).join("")}</tr></thead>
        <tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${cell ?? ""}</td>`).join("")}</tr>`).join("")}</tbody>
      </table>
    </div>
  `;
}

function renderPager(meta, onPageChange) {
  const total = Number(meta && meta.total || 0);
  const page = Number(meta && meta.page || 1);
  const totalPages = Number(meta && meta.totalPages || 1);
  if (totalPages <= 1) {
    return total ? `<div class="pager-meta muted">${total} records</div>` : "";
  }
  return `
    <div class="pager">
      <button class="secondary" ${page <= 1 ? "disabled" : ""} onclick="${onPageChange}(${page - 1})">Prev</button>
      <div class="pager-meta muted">Page ${page} of ${totalPages} • ${total} records</div>
      <button class="secondary" ${page >= totalPages ? "disabled" : ""} onclick="${onPageChange}(${page + 1})">Next</button>
    </div>
  `;
}

function renderTimedLoading(title, description) {
  const elapsed = state.loading.startedAt ? formatCountdown(Date.now() - state.loading.startedAt) : "00:10";
  return `
    <div class="panel slow-load stack">
      <div class="pill">Fetching ${title}</div>
      <div class="loading-time">${elapsed}</div>
      <div>${description}</div>
      <div class="muted">Please wait. The screen stays busy until the request finishes, even if this timer reaches zero.</div>
    </div>
  `;
}

function renderActionOverlay() {
  if (!state.actionLoading.active) return "";
  const elapsed = state.actionLoading.startedAt ? formatCountdown(Date.now() - state.actionLoading.startedAt) : "00:10";
  return `
    <div class="action-overlay action-overlay-passive">
      <div class="action-overlay-card">
        <div class="pill">Please wait</div>
        <div class="loading-time">${elapsed}</div>
        <div class="action-overlay-title">${state.actionLoading.label}</div>
        <div class="muted">The system is completing your request.</div>
      </div>
    </div>
  `;
}

function renderSecretPrompt() {
  if (!state.secretPrompt) return "";
  return `
    <div class="action-overlay">
      <div class="action-overlay-card secret-card">
        <h3>${state.secretPrompt.title || "Confirm Action"}</h3>
        <div class="muted">${state.secretPrompt.message || ""}</div>
        <label>Password
          <input id="secret-code-input" type="password" autocomplete="off" />
        </label>
        <div class="actions-row">
          <button class="secondary" onclick="cancelSecretPrompt()">Cancel</button>
          <button class="danger" onclick="submitSecretPrompt()">Continue</button>
        </div>
      </div>
    </div>
  `;
}

function requestSecretCode(title, message) {
  return new Promise(resolve => {
    state.secretPrompt = { title, message, resolve };
    render();
    window.setTimeout(() => {
      const input = qs("#secret-code-input");
      if (input) input.focus();
    }, 0);
  });
}

function cancelSecretPrompt() {
  if (!state.secretPrompt) return;
  const resolve = state.secretPrompt.resolve;
  state.secretPrompt = null;
  render();
  resolve("");
}

function submitSecretPrompt() {
  if (!state.secretPrompt) return;
  const input = qs("#secret-code-input");
  const value = input ? input.value.trim() : "";
  const resolve = state.secretPrompt.resolve;
  state.secretPrompt = null;
  render();
  resolve(value);
}

function renderDashboard() {
  if (!state.dashboard) return `<div class="panel">Loading...</div>`;
  const statCards = (Array.isArray(state.dashboard.cards) ? state.dashboard.cards : []).map(card => ({
    label: card.label,
    value: card.value,
    kind: String(card.label || "").includes("Students") ? "number" : "currency"
  }));
  return `
    <div class="dashboard-shell stack">
      <div class="hero-banner">
        <div class="hero-copy">
          <div class="eyebrow">Live Overview</div>
          <h2>Counter-first school collections.</h2>
          <p>Keep the payment desk fast, keep financial signals visible, and keep reporting separate from rush-hour operations.</p>
        </div>
        <div class="hero-badge">
          <span>Today</span>
          <strong>${formatDateOnly(new Date())}</strong>
        </div>
      </div>
      ${renderCards(statCards)}
      <div class="panel panel-wide dashboard-receipts">
        <div class="panel-heading">
          <div>
            <div class="eyebrow">Collections</div>
            <h3>Today's Receipts</h3>
          </div>
          <div class="pill">${(Array.isArray(state.dashboard.recentReceipts) ? state.dashboard.recentReceipts : []).length} today</div>
        </div>
        ${renderTable(
          ["Receipt No", "Date", "Student", "Mode", "Amount", "Status", "Action"],
          (Array.isArray(state.dashboard.recentReceipts) ? state.dashboard.recentReceipts : []).map(item => [
            item["Receipt Number"],
            formatDateOnly(item["Receipt Date"]),
            item["Student Name"],
            item["Payment Mode"],
            formatCurrency(item["Amount"]),
            item["Status"],
            `<div class="actions-row actions-row-icons">
              ${item["Status"] === "Valid" ? `<button class="danger icon-action icon-delete" onclick="handleCancelReceipt('${item["Receipt ID"]}')" title="Cancel">&#10006;</button>` : ""}
              <button class="secondary icon-action icon-print" onclick="handlePrintReceipt('${item["Receipt ID"]}')" title="Print">&#128424;</button>
              <button class="secondary icon-action icon-view" onclick="handleOpenReceipt('${item["Receipt ID"]}')" title="View">&#128065;</button>
              ${safe(state, "bootstrap.role", "") === "Senior Admin" && item["Status"] === "Cancelled" ? `<button class="danger icon-action icon-delete" onclick="handleDeleteReceipt('${item["Receipt ID"]}')" title="Delete">&#128465;</button>` : ""}
            </div>`
          ])
        )}
      </div>
    </div>
  `;
}

function renderReportActions() {
  return `
    <div class="section-actions">
      <button class="secondary" onclick="exportCurrentView()">Download CSV</button>
    </div>
  `;
}

function renderStudentWorkspace() {
  const ledger = state.ledger;
  const classes = safe(state, "bootstrap.classes", []);
  const feeHeads = safe(state, "bootstrap.feeHeads", []);
  const role = safe(state, "bootstrap.role", "");
  const searchText = String(state.studentSearch || "").trim().toLowerCase();
  const classFilter = String(state.studentClassFilter || "");
  const statusFilter = String(state.studentStatusFilter || "");
  const filteredStudents = state.students.filter(item => {
    const matchesSearch = !searchText ||
      String(item.studentName || "").toLowerCase().includes(searchText) ||
      String(item.mobileNumber || "").toLowerCase().includes(searchText) ||
      String(item.className || "").toLowerCase().includes(searchText);
    const matchesClass = !classFilter || String(item.className || "") === classFilter;
    const matchesStatus = !statusFilter || String(item.status || "") === statusFilter;
    return matchesSearch && matchesClass && matchesStatus;
  });
  const reassignStudent = state.reassignDraft
    ? state.students.find(item => item.studentId === state.reassignDraft.studentId)
    : null;
  return `
    <div class="stack student-workspace">
      <div class="panel student-workspace-panel">
        <div class="panel-heading">
          <div class="section-head">
            <div class="eyebrow">Student Fees Data</div>
            <h3>Student Register</h3>
            <div class="muted">Default view shows active students. Search and filters stay compact so the table gets maximum space.</div>
          </div>
          <div class="actions-row">
            <button class="secondary" onclick="downloadStudentBulkTemplate()">Sample CSV</button>
            <button class="secondary" onclick="openStudentBulkUpload()">Bulk Upload</button>
            <button class="primary add-student-btn" onclick="openStudentModal()">Add Student</button>
          </div>
        </div>
        <div class="inline-form compact-filters">
          <input id="student-search" value="${state.studentSearch || ""}" oninput="handleStudentFilters()" placeholder="Search by student or mobile" />
          <select id="student-class-filter" onchange="handleStudentFilters()">
            <option value="">All Classes</option>
            ${classes.map(item => `<option value="${item.className}" ${state.studentClassFilter === item.className ? "selected" : ""}>${item.className}</option>`).join("")}
          </select>
          <select id="student-status-filter" onchange="handleStudentFilters()">
            <option value="">All Statuses</option>
            <option value="Active" ${state.studentStatusFilter === "Active" ? "selected" : ""}>Active</option>
            <option value="Inactive" ${state.studentStatusFilter === "Inactive" ? "selected" : ""}>Inactive</option>
          </select>
          <div class="pill">${filteredStudents.length} students</div>
        </div>
        <div class="student-card-list">
          ${filteredStudents.map(item => `
            <div class="student-card">
              <div class="student-card-head">
                <div>
                  <div class="student-name">${item.studentName}</div>
                  <div class="muted">${item.className} &bull; ${item.mobileNumber}</div>
                </div>
                <div class="pill">${item.status}</div>
              </div>
              <div class="student-card-stats">
                <div><span>Assigned</span><strong>${formatCurrency(item.totalAssigned)}</strong></div>
                <div><span>Paid</span><strong>${formatCurrency(item.totalPaid)}</strong></div>
                <div><span>Overall Due</span><strong>${formatCurrency(item.overallDue)}</strong></div>
                <div><span>Due Today</span><strong>${formatCurrency(item.dueAsOfToday)}</strong></div>
              </div>
              <div class="muted">${item.feeHeadSummary || "-"}</div>
              <div class="actions-row actions-row-icons">
                <button class="secondary icon-action icon-ledger" onclick="handleOpenLedger('${item.studentId}')" title="Ledger">&#128214;</button>
                <button class="secondary icon-action icon-status" onclick="handleManageStudent('${item.studentId}','${item.status}')" title="${item.status === "Active" ? "Inactivate or Delete" : "Reactivate or Delete"}">${item.status === "Active" ? "&#9881;" : "&#9881;"}</button>
                <button class="secondary icon-action icon-reassign" onclick="handleStartReassign('${item.studentId}')" title="Reassign">&#128257;</button>
                <button class="secondary icon-action icon-collect" onclick="handleCollectFeesForStudent('${item.studentId}')" title="Collect Fees">&#8377;</button>
              </div>
            </div>
          `).join("") || `<div class="muted">No students matched the selected filters.</div>`}
        </div>
        <div class="desktop-only">
          <div class="student-table-shell">
            <div class="student-table-meta">
              <div class="pill">${filteredStudents.length} active view rows</div>
              <div class="muted">Compact fee grid for counter and review work.</div>
            </div>
          ${renderTable(
            ["Class", "Student", "Mobile", "Actual Fee", "Committed", "Concession", "Fee Heads", "Assigned", "Paid", "Overall Due", "Due Today", "Status", "Actions"],
            filteredStudents.map(item => [
              `<div class="table-chip">${item.className}</div>`,
              `<div class="student-cell"><strong>${item.studentName}</strong><span>${item.studentId}</span></div>`,
              `<div class="table-phone">${item.mobileNumber}</div>`,
              `<div class="amount-compact">${formatCurrency(item.actualSchoolFee)}</div>`,
              `<div class="amount-compact">${formatCurrency(item.committedSchoolFee)}</div>`,
              `<div class="amount-compact amount-soft">${formatCurrency(item.concession)}</div>`,
              `<div class="fee-head-cell">${item.feeHeadSummary || "-"}</div>`,
              `<div class="amount-compact">${formatCurrency(item.totalAssigned)}</div>`,
              `<div class="amount-compact amount-good">${formatCurrency(item.totalPaid)}</div>`,
              `<div class="amount-compact amount-warn">${formatCurrency(item.overallDue)}</div>`,
              `<div class="amount-compact amount-warn">${formatCurrency(item.dueAsOfToday)}</div>`,
              `<div class="table-status ${String(item.status || "").toLowerCase()}">${item.status}</div>`,
              `<div class="actions-row actions-row-icons">
                <button class="secondary icon-action icon-ledger" onclick="handleOpenLedger('${item.studentId}')" title="Ledger">&#128214;</button>
                <button class="secondary icon-action icon-status" onclick="handleManageStudent('${item.studentId}','${item.status}')" title="${item.status === "Active" ? "Inactivate or Delete" : "Reactivate or Delete"}">&#9881;</button>
                <button class="secondary icon-action icon-reassign" onclick="handleStartReassign('${item.studentId}')" title="Reassign">&#128257;</button>
                <button class="secondary icon-action icon-collect" onclick="handleCollectFeesForStudent('${item.studentId}')" title="Collect Fees">&#8377;</button>
              </div>`
            ])
          )}
          </div>
        </div>
      </div>
      ${reassignStudent ? `
        <div class="panel detail-panel stack">
          <h3>Reassign Fee Head</h3>
          <div class="muted">${reassignStudent.studentName} &bull; ${reassignStudent.className}</div>
          <div class="form-grid">
            <label>Fee Head
              <select id="reassign-fee-head">
                ${feeHeads.map(item => `<option value="${item.headName}" ${state.reassignDraft.feeHead === item.headName ? "selected" : ""}>${item.headName}</option>`).join("")}
              </select>
            </label>
            <label>New Amount<input id="reassign-amount" type="number" min="0" value="${state.reassignDraft.newAmount || 0}" /></label>
            <label>Reason<input id="reassign-reason" value="${state.reassignDraft.reason || ""}" /></label>
          </div>
          <div class="actions-row">
            <button class="primary" onclick="handleSubmitReassign()">Save Reassignment</button>
            <button class="secondary" onclick="handleCancelReassign()">Cancel</button>
          </div>
        </div>
      ` : ""}
      ${ledger ? renderLedgerPanel(ledger) : ""}
    </div>
  `;
}

function renderStudentModal() {
  const classes = safe(state, "bootstrap.classes", []);
  const defaultClass = classes[0] || { classId: "", feeHeads: [], feeHeadConfigs: [] };
  const feeHeadConfigs = getClassFeeConfigs(defaultClass);
  const totalActualFee = feeHeadConfigs.reduce((acc, item) => acc + Number(item.actualFee || 0), 0);
  const defaultJoinedDate = getDefaultStudentJoinedDate(defaultClass);
  return `
    <div class="action-overlay">
      <div class="action-overlay-card student-modal-card">
        <div class="modal-head">
          <h3>Add Student</h3>
          <button class="secondary" onclick="closeStudentModal()">Close</button>
        </div>
        <div class="form-grid">
          <label>Student Name<input id="student-name" /></label>
          <label>Class
            <select id="student-class" onchange="handleStudentClassChange()">
              ${classes.map(item => `<option value="${item.classId}">${item.className}</option>`).join("")}
            </select>
          </label>
          <label>Mobile Number<input id="student-mobile" /></label>
          <label>Status
            <select id="student-status">
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </label>
          <label>Joined Date<input id="student-joined" type="date" value="${defaultJoinedDate}" /></label>
          <label>Total Actual Fee<input id="student-actual-fee" type="number" value="${totalActualFee}" readonly /></label>
          <label>Total Committed Fee<input id="student-committed-fee" type="number" min="0" value="0" readonly /></label>
          <label>Concession<input id="student-concession" type="number" value="0" readonly /></label>
        </div>
        <div class="stack">
          <h3>Fee Head Commitment</h3>
          ${feeHeadConfigs.length ? `
            <div id="student-fee-head-grid" class="class-fee-grid">
              ${feeHeadConfigs.map(item => `
                <div class="class-fee-card">
                  <div class="class-fee-card-head">${item.headName}</div>
                  <label>Actual Fee<input class="student-fee-actual" data-head="${item.headName}" type="number" value="${Number(item.actualFee || 0)}" readonly /></label>
                  <label>Committed Fee<input class="student-fee-head" data-head="${item.headName}" data-actual="${Number(item.actualFee || 0)}" type="number" min="0" max="${Number(item.actualFee || 0)}" value="0" oninput="handleStudentCommittedFeeChange()" /></label>
                </div>
              `).join("")}
            </div>
          ` : `<div class="muted">Select fee heads for this class first in Setup.</div>`}
        </div>
        <div class="actions-row">
          <button class="primary" onclick="handleAddStudent()">Save Student</button>
          <button class="secondary" onclick="closeStudentModal()">Cancel</button>
        </div>
      </div>
    </div>
  `;
}

function renderLedgerPanel(ledger) {
  const student = ledger.student;
  return `
    <div class="panel stack ledger-panel">
      <div class="panel-heading">
        <div class="section-head">
          <div class="eyebrow">Student Ledger</div>
          <h3>${student["Student Name"]}</h3>
        </div>
        <div class="pill mono">${student["Student ID"]}</div>
      </div>
      ${renderTable(
        ["Head", "Due Date", "Assigned", "Paid", "Remaining", "Status"],
        ledger.instalments.map(item => [
          item["Fee Head"],
          formatDateOnly(item["Due Date"]),
          formatCurrency(item["Assigned Amount"]),
          formatCurrency(item["Paid Amount"]),
          formatCurrency(item["Remaining Amount"]),
          item["Status"]
        ])
      )}
      ${renderTable(
        ["Receipt No", "Date", "Amount", "Mode", "Status", "Action"],
        ledger.receipts.map(item => [
          item["Receipt Number"],
          formatDateOnly(item["Receipt Date"]),
          formatCurrency(item["Amount"]),
          item["Payment Mode"],
          item["Status"],
          `<div class="actions-row actions-row-icons">
            <button class="secondary icon-action icon-print" onclick="handlePrintReceipt('${item["Receipt ID"]}')" title="Print">&#128424;</button>
            <button class="secondary icon-action icon-view" onclick="handleOpenReceipt('${item["Receipt ID"]}')" title="View">&#128065;</button>
          </div>`
        ])
      )}
    </div>
  `;
}

function summarizeCollectHeads(ledger) {
  if (!ledger || !Array.isArray(ledger.instalments)) return [];
  const map = {};
  ledger.instalments
    .filter(item => item["Status"] === "Active" && Number(item["Remaining Amount"] || 0) > 0)
    .forEach(item => {
      const head = item["Fee Head"];
      if (!map[head]) {
        map[head] = { head, remaining: 0, instalments: [] };
      }
      map[head].remaining += Number(item["Remaining Amount"] || 0);
      map[head].instalments.push(item);
    });
  return Object.values(map).sort((a, b) => String(a.head).localeCompare(String(b.head)));
}

function renderCollectFeesModal() {
  if (!state.collectModalOpen) return "";
  const activeStudents = state.students.filter(item => item.status === "Active");
  const selectedStudent = activeStudents.find(item => item.studentId === state.collectStudentId) || null;
  const headSummary = summarizeCollectHeads(state.collectLedger);
  const receiptRows = state.collectReceiptHistory || [];
  return `
    <div class="action-overlay collect-full-overlay">
      <div class="action-overlay-card student-modal-card collect-modal-card">
        <div class="modal-head collect-modal-head">
          <div class="section-head">
            <div class="eyebrow">Collections Desk</div>
            <h2>Collect Fees</h2>
            <div class="muted">${selectedStudent ? `${selectedStudent.studentName} • ${selectedStudent.className} • ${selectedStudent.mobileNumber}` : "Loading student data"}</div>
          </div>
          <button class="secondary" onclick="closeCollectFeesModal()">Close</button>
        </div>
        ${selectedStudent ? `
          <div class="collect-modal-layout">
            <div class="collect-student-banner collect-student-banner-wide">
              <div>
                <span>Overall Due</span>
                <strong>${formatCurrency(selectedStudent.overallDue)}</strong>
              </div>
              <div>
                <span>Due Today</span>
                <strong>${formatCurrency(selectedStudent.dueAsOfToday)}</strong>
              </div>
              <div>
                <span>Paid So Far</span>
                <strong>${formatCurrency(selectedStudent.totalPaid)}</strong>
              </div>
            </div>
            <div class="collect-full-card">
              <div class="section-head">
                <h3>Create Receipt</h3>
                <div class="muted">Pick the fee head, enter amount, and generate the receipt.</div>
              </div>
              <div class="collect-head-cards">
                ${headSummary.map(item => `
                  <div class="collect-head-card">
                    <span>${item.head}</span>
                    <strong>${formatCurrency(item.remaining)}</strong>
                  </div>
                `).join("") || `<div class="collect-head-card"><span>No open heads</span><strong>${formatCurrency(0)}</strong></div>`}
              </div>
              <div class="collect-form-grid">
                <label>Amount<input id="collect-amount" type="number" min="1" /></label>
                <label>Fee Head
                  <select id="collect-head">
                    <option value="">Select Head</option>
                    ${headSummary.map(item => `<option value="${item.head}">${item.head} • Due ${formatCurrency(item.remaining)}</option>`).join("")}
                  </select>
                </label>
                <label>Payment Date<input id="collect-date" type="date" value="${new Date().toISOString().slice(0, 10)}" /></label>
                <label>Mode
                  <select id="collect-mode" onchange="toggleModeFields()">
                    <option value="Cash">Cash</option>
                    <option value="UPI">UPI</option>
                  </select>
                </label>
                <label id="upi-ref-wrap">UPI Ref<input id="collect-upi-ref" /></label>
                <label id="upi-in-wrap">UPI Received In<input id="collect-upi-in" placeholder="School account or Partner name" /></label>
              </div>
              <div class="actions-row collect-submit-row">
                <button class="primary" onclick="handleCollectFees()">Create Receipt</button>
              </div>
            </div>
            <div class="collect-full-card">
              <div class="panel-heading">
                <div class="section-head">
                  <h3>Recent Receipts</h3>
                  <div class="muted">Latest receipts for this student.</div>
                </div>
                <div class="pill">${state.collectReceiptMeta.total || receiptRows.length} receipts</div>
              </div>
              ${receiptRows.length ? renderTable(
                ["Receipt No", "Date", "Mode", "Amount", "Status", "Action"],
                receiptRows.map(item => [
                  item["Receipt Number"],
                  formatDateOnly(item["Receipt Date"]),
                  item["Payment Mode"],
                  formatCurrency(item["Amount"]),
                  `<div class="table-status ${String(item["Status"] || "").toLowerCase()}">${item["Status"]}</div>`,
                  `<div class="actions-row actions-row-icons">
                    <button class="secondary icon-action icon-view" onclick="handleOpenReceipt('${item["Receipt ID"]}')" title="View">&#128065;</button>
                    <button class="secondary icon-action icon-print" onclick="handlePrintReceipt('${item["Receipt ID"]}')" title="Print">&#128424;</button>
                    ${item["Status"] === "Valid" ? `<button class="danger icon-action icon-delete" onclick="handleCancelReceipt('${item["Receipt ID"]}')" title="Cancel">&#10006;</button>` : ""}
                    ${safe(state, "bootstrap.role", "") === "Senior Admin" && item["Status"] === "Cancelled" ? `<button class="danger icon-action icon-delete" onclick="handleDeleteReceipt('${item["Receipt ID"]}')" title="Delete">&#128465;</button>` : ""}
                  </div>`
                ])
              ) : `<div class="muted">No receipts for this student yet.</div>`}
              ${renderPager(state.collectReceiptMeta, "handleCollectReceiptPage")}
            </div>
            ${state.selectedReceipt ? renderReceiptPanel(state.selectedReceipt) : ""}
          </div>
        ` : `<div class="muted">Loading student fee data...</div>`}
      </div>
    </div>
  `;
}
function renderCollectFeesModal() {
  if (!state.collectModalOpen) return "";
  const activeStudents = state.students.filter(item => item.status === "Active");
  const selectedStudent = activeStudents.find(item => item.studentId === state.collectStudentId) || null;
  const headSummary = summarizeCollectHeads(state.collectLedger);
  const receiptRows = state.collectReceiptHistory || [];
  const upiTargets = ["School"].concat(safe(state, "bootstrap.partners", []).map(item => item["Partner Name"] || item.partnerName).filter(Boolean));
  return `
    <div class="action-overlay collect-full-overlay">
      <div class="action-overlay-card collect-modal-card">
        <div class="modal-head collect-modal-head">
          <div class="section-head">
            <div class="eyebrow">Collections Desk</div>
            <h2>Collect Fees</h2>
            <div class="muted">${selectedStudent ? `${selectedStudent.studentName} &bull; ${selectedStudent.className} &bull; ${selectedStudent.mobileNumber}` : "Loading student data"}</div>
          </div>
          <button class="secondary" onclick="closeCollectFeesModal()">Close</button>
        </div>
        ${selectedStudent ? `
          <div class="collect-modal-layout">
            <div class="collect-student-banner collect-student-banner-wide">
              <div>
                <span>Overall Due</span>
                <strong>${formatCurrency(selectedStudent.overallDue)}</strong>
              </div>
              <div>
                <span>Due Today</span>
                <strong>${formatCurrency(selectedStudent.dueAsOfToday)}</strong>
              </div>
              <div>
                <span>Paid So Far</span>
                <strong>${formatCurrency(selectedStudent.totalPaid)}</strong>
              </div>
            </div>
            <div class="collect-full-card">
              <div class="section-head">
                <h3>Create Receipt</h3>
                <div class="muted">Pick the fee head, enter amount, and generate the receipt.</div>
              </div>
              <div class="collect-head-cards">
                ${headSummary.map(item => `
                  <div class="collect-head-card">
                    <span>${item.head}</span>
                    <strong>${formatCurrency(item.remaining)}</strong>
                  </div>
                `).join("") || `<div class="collect-head-card"><span>No open heads</span><strong>${formatCurrency(0)}</strong></div>`}
              </div>
              <div class="collect-form-grid">
                <label>Amount<input id="collect-amount" type="number" min="1" /></label>
                <label>Fee Head
                  <select id="collect-head">
                    <option value="">Select Head</option>
                    ${headSummary.map(item => `<option value="${item.head}">${item.head} - Due ${formatCurrency(item.remaining)}</option>`).join("")}
                  </select>
                </label>
                <label>Payment Date<input id="collect-date" type="date" value="${new Date().toISOString().slice(0, 10)}" /></label>
                <label>Mode
                  <select id="collect-mode" onchange="toggleModeFields()">
                    <option value="Cash">Cash</option>
                    <option value="UPI">UPI</option>
                  </select>
                </label>
                <label id="upi-ref-wrap">UPI Ref<input id="collect-upi-ref" /></label>
                <label id="upi-in-wrap">UPI Received In
                  <select id="collect-upi-in">
                    <option value="">Select Account</option>
                    ${upiTargets.map(item => `<option value="${item}">${item}</option>`).join("")}
                  </select>
                </label>
              </div>
              <div class="actions-row collect-submit-row">
                <button class="primary" onclick="handleCollectFees()">Create Receipt</button>
              </div>
            </div>
            <div class="collect-full-card">
              <div class="panel-heading">
                <div class="section-head">
                  <h3>Recent Receipts</h3>
                  <div class="muted">Latest receipts for this student.</div>
                </div>
                <div class="pill">${state.collectReceiptMeta.total || receiptRows.length} receipts</div>
              </div>
              ${receiptRows.length ? renderTable(
                ["Receipt No", "Date", "Mode", "Amount", "Status", "Action"],
                receiptRows.map(item => [
                  item["Receipt Number"],
                  formatDateOnly(item["Receipt Date"]),
                  item["Payment Mode"],
                  formatCurrency(item["Amount"]),
                  `<div class="table-status ${String(item["Status"] || "").toLowerCase()}">${item["Status"]}</div>`,
                  `<div class="actions-row actions-row-icons">
                    <button class="secondary icon-action icon-view" onclick="handleOpenReceipt('${item["Receipt ID"]}')" title="View">&#128065;</button>
                    <button class="secondary icon-action icon-print" onclick="handlePrintReceipt('${item["Receipt ID"]}')" title="Print">&#128424;</button>
                    ${item["Status"] === "Valid" ? `<button class="danger icon-action icon-delete" onclick="handleCancelReceipt('${item["Receipt ID"]}')" title="Cancel">&#10006;</button>` : ""}
                    ${safe(state, "bootstrap.role", "") === "Senior Admin" && item["Status"] === "Cancelled" ? `<button class="danger icon-action icon-delete" onclick="handleDeleteReceipt('${item["Receipt ID"]}')" title="Delete">&#128465;</button>` : ""}
                  </div>`
                ])
              ) : `<div class="muted">No receipts for this student yet.</div>`}
              ${renderPager(state.collectReceiptMeta, "handleCollectReceiptPage")}
            </div>
            ${state.selectedReceipt ? renderReceiptPanel(state.selectedReceipt) : ""}
          </div>
        ` : `<div class="muted">Loading student fee data...</div>`}
      </div>
    </div>
  `;
}

function renderReceiptPanel(detail) {
  const allocations = Array.isArray(detail && detail.allocations) ? detail.allocations : [];
  return `
    <div class="panel stack receipt-detail-panel">
      <div class="panel-heading">
        <div class="section-head">
          <div class="eyebrow">Receipt Detail</div>
          <h3>${detail.receipt["Student Name"]}</h3>
        </div>
        <div class="pill mono">${detail.receipt["Receipt Number"]}</div>
      </div>
      ${renderTable(
        ["Field", "Value"],
        [
          ["Student", detail.receipt["Student Name"]],
          ["Date", formatDateOnly(detail.receipt["Receipt Date"])],
          ["Amount", formatCurrency(detail.receipt["Amount"])],
          ["Mode", detail.receipt["Payment Mode"]],
          ["UPI Ref", detail.receipt["UPI Reference"]],
          ["Status", detail.receipt["Status"]],
          ["Due On Receipt Date", formatCurrency(detail.receipt["Due As Of Receipt Date"])],
          ["Overall Remaining", formatCurrency(detail.receipt["Overall Remaining Balance"])]
        ]
      )}
      ${renderTable(
        ["Fee Head", "Instalment", "Due Date", "Allocated Amount", "Status"],
        allocations.map(item => [
          item["Fee Head"],
          item["Sequence No"] ? `#${item["Sequence No"]}` : "-",
          formatDateOnly(item["Due Date"]),
          formatCurrency(item["Allocated Amount"]),
          item["Status"]
        ])
      )}
    </div>
  `;
}

function renderDueReport() {
  const dueMode = safe(state, "dueMode", "dueTillDate");
  return `
    <div class="panel">
      <h3>Due Report</h3>
      ${renderReportActions()}
      <div class="inline-form">
        <input id="due-date" type="date" value="${state.dueFilters.asOnDate}" />
        <select id="due-mode">
          <option value="dueTillDate" ${dueMode === "dueTillDate" ? "selected" : ""}>Due Till Date</option>
          <option value="totalDue" ${dueMode === "totalDue" ? "selected" : ""}>Total Due</option>
        </select>
        <select id="due-active-only">
          <option value="true" ${state.dueFilters.activeOnly ? "selected" : ""}>Active Only</option>
          <option value="false" ${!state.dueFilters.activeOnly ? "selected" : ""}>All Students</option>
        </select>
        <input id="due-min" type="number" min="0" placeholder="Min Due" value="${state.dueFilters.minimumDueAmount}" />
        <input id="due-max" type="number" min="0" placeholder="Max Due" value="${state.dueFilters.maximumDueAmount}" />
        <button class="secondary" onclick="handleFilterDueReport()">Filter</button>
      </div>
      ${renderTable(
        ["Class", "Student", "Mobile", "Assigned", "Paid", "Overall Due", dueMode === "totalDue" ? "Total Due" : "Due Till Date"],
        state.dueReport.map(item => [
          item.className,
          item.studentName,
          item.mobile,
          formatCurrency(item.totalAssigned),
          formatCurrency(item.totalPaid),
          formatCurrency(item.overallDue),
          formatCurrency(dueMode === "totalDue" ? item.overallDue : item.dueAsOfSelectedDate)
        ])
      )}
      ${renderPager(state.dueReportMeta, "handleDueReportPage")}
    </div>
  `;
}

function renderExpenses() {
  const categories = safe(state, "bootstrap.categories", []);
  const role = safe(state, "bootstrap.role", "");
  const paidByOptions = ["School Cash"].concat(safe(state, "bootstrap.partners", []).map(item => item["Partner Name"]));
  const cashReceipts = state.receipts.filter(item => item["Payment Mode"] === "Cash" && item["Status"] === "Valid");
  const recipients = ["School"].concat(safe(state, "bootstrap.partners", []).map(item => item["Partner Name"]));
  return `
    <div class="split">
      <div class="panel">
        <h3>Add Expense</h3>
        <div class="form-grid">
          <label>Date<input id="expense-date" type="date" value="${new Date().toISOString().slice(0, 10)}" /></label>
          <label>Category
            <select id="expense-category">${categories.map(item => `<option>${item["Category Name"]}</option>`).join("")}</select>
          </label>
          <label>Description<input id="expense-description" /></label>
          <label>Amount<input id="expense-amount" type="number" min="1" /></label>
          <label>Status
            <select id="expense-status">
              <option value="Paid">Paid</option>
              ${role === "Senior Admin" ? `<option value="Expected">Expected</option>` : ""}
            </select>
          </label>
          <label>Payment Mode
            <select id="expense-mode">
              <option value="Cash">Cash</option>
              <option value="UPI">UPI</option>
              <option value="Bank">Bank</option>
            </select>
          </label>
          <label>Paid By
            <select id="expense-paid-by">
              ${paidByOptions.map(item => `<option value="${item}">${item}</option>`).join("")}
            </select>
          </label>
          <label>Reference<input id="expense-ref" /></label>
          <label>Description / Remarks<textarea id="expense-remarks"></textarea></label>
        </div>
        <button class="primary" onclick="handleAddExpense()">Save Expense</button>
      </div>
      <div class="panel">
        <div class="panel-heading">
          <h3>Expense Register</h3>
          ${role === "Senior Admin" ? `<button class="secondary" onclick="document.getElementById('cash-handover-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })">Add Cash Handover</button>` : ""}
        </div>
        <div class="inline-form">
          <select id="expense-filter-status">
            <option value="">All Statuses</option>
            <option value="Paid" ${state.expenseFilters.status === "Paid" ? "selected" : ""}>Paid</option>
            <option value="Expected" ${state.expenseFilters.status === "Expected" ? "selected" : ""}>Expected</option>
            <option value="Archived" ${state.expenseFilters.status === "Archived" ? "selected" : ""}>Archived</option>
          </select>
          <button class="secondary" onclick="handleFilterExpenses()">Filter</button>
        </div>
        ${renderTable(
          ["Date", "Category", "Description", "Amount", "Status", "Paid By", "Action"],
          state.expenses.map(item => [
            item["Date"],
            item["Category"],
            item["Description"],
            formatCurrency(item["Amount"]),
            item["Status"],
            item["Paid By"],
            role === "Senior Admin" && item["Status"] !== "Archived"
              ? `<button class="danger" onclick="handleArchiveExpense('${item["Expense ID"]}')">Archive</button>`
              : ""
          ])
        )}
        ${renderPager(state.expensesMeta, "handleExpensesPage")}
        ${role === "Senior Admin" ? `
          <div id="cash-handover-panel" class="subpanel stack">
            <div class="panel-heading">
              <h3>Cash Handover</h3>
            </div>
            ${cashReceipts.length ? `
              <div class="form-grid">
                <label>Receipt
                  <select id="handover-receipt">${cashReceipts.map(item => `<option value="${item["Receipt ID"]}" data-amount="${item["Amount"]}">${item["Receipt Number"]} - ${item["Student Name"]}</option>`).join("")}</select>
                </label>
                <label>Amount<input id="handover-amount" type="number" min="1" /></label>
                <label>Recipient
                  <select id="handover-recipient">
                    ${recipients.map(item => `<option value="${item}">${item}</option>`).join("")}
                  </select>
                </label>
                <label>Date<input id="handover-date" type="date" value="${new Date().toISOString().slice(0, 10)}" /></label>
              </div>
              <label>Remarks<textarea id="handover-remarks"></textarea></label>
              <button class="primary" onclick="handleCreateHandover()">Save Handover</button>
            ` : `<div class="muted">No active cash receipts are available for handover.</div>`}
          </div>
        ` : ""}
      </div>
    </div>
  `;
}

function renderAnalytics() {
  if (state.loading.active && state.loading.view === "analytics") {
    return renderTimedLoading("analytics", "Calculating academic-year fee metrics.");
  }
  if (!state.analytics) return `<div class="panel">Loading...</div>`;
  const totalCollected = Number(state.analytics.totalFeesCollected || 0);
  const cashShare = totalCollected ? (Number(state.analytics.cashCollected || 0) / totalCollected) * 100 : 0;
  const upiShare = totalCollected ? (Number(state.analytics.upiCollected || 0) / totalCollected) * 100 : 0;
  const series = Array.isArray(state.analytics.collectionSeries) ? state.analytics.collectionSeries : [];
  const maxSeriesValue = series.reduce((acc, item) => Math.max(acc, Number(item.total || 0)), 0) || 1;
  return `
    <div class="analytics-stack">
      <div class="panel">
        ${renderReportActions()}
        <div class="inline-form analytics-filters">
          <input id="analytics-date" type="date" value="${state.analyticsFilters.asOfDate}" />
          <select id="analytics-range">
            <option value="lastWeek" ${state.analyticsFilters.rangePreset === "lastWeek" || state.analyticsFilters.rangePreset === "last7days" ? "selected" : ""}>Last Week</option>
            <option value="last12weeks" ${state.analyticsFilters.rangePreset === "last12weeks" ? "selected" : ""}>Week Wise</option>
            <option value="last12months" ${state.analyticsFilters.rangePreset === "last12months" ? "selected" : ""}>Month Wise</option>
          </select>
          <select id="analytics-mode">
            <option value="" ${state.analyticsFilters.paymentMode === "" ? "selected" : ""}>All Modes</option>
            <option value="Cash" ${state.analyticsFilters.paymentMode === "Cash" ? "selected" : ""}>Cash</option>
            <option value="UPI" ${state.analyticsFilters.paymentMode === "UPI" ? "selected" : ""}>UPI</option>
          </select>
          <input id="analytics-student" placeholder="Student name" value="${state.analyticsFilters.studentName}" />
          <button class="secondary" onclick="handleFilterAnalytics()">Filter</button>
        </div>
      </div>
      <div class="analytics-set panel stack">
        <div class="eyebrow">Set 1</div>
        ${renderCards([
          { label: "Total Students", value: state.analytics.totalStudents, kind: "number" },
          { label: "Total Active Students", value: state.analytics.activeStudents, kind: "number" },
          { label: "Students With 0 Paid", value: state.analytics.totalStudentsWithZeroPaid, kind: "number" },
          { label: "Students With 0 Due", value: state.analytics.totalStudentsWithZeroDue, kind: "number" }
        ], { className: "cards-inline analytics-cards-4" })}
      </div>
      <div class="analytics-set panel stack">
        <div class="eyebrow">Fee Base</div>
        ${renderCards([
          { label: "Actual Class Fees", value: state.analytics.totalFeesAssigned, kind: "currency" },
          { label: "Parent Commitment", value: state.analytics.totalFeesCommitted, kind: "currency" },
          { label: "Total Concessions", value: state.analytics.totalConcessions, kind: "currency" }
        ], { className: "cards-inline analytics-cards-3" })}
      </div>
      <div class="analytics-set panel stack">
        <div class="eyebrow">Collection Position</div>
        ${renderCards([
          { label: "Overall Collectable", value: state.analytics.totalFeesCollectable, kind: "currency" },
          { label: "Payable Till Date", value: state.analytics.totalFeesCollectableAsOfDate, kind: "currency" },
          { label: "Collected Till Date", value: state.analytics.totalFeesCollectedAsOfDate, kind: "currency" },
          { label: "Due Till Date", value: state.analytics.totalFeesDueAsOfDate, kind: "currency" },
          { label: "Total Collected Overall", value: state.analytics.totalFeesCollected, kind: "currency" },
          { label: "Overall Pending Balance", value: state.analytics.totalFeesDue, kind: "currency" }
        ], { className: "cards-inline analytics-cards-3" })}
      </div>
      <div class="analytics-set panel stack">
        <div class="eyebrow">Collection Mix</div>
        ${renderCards([
          { label: "Cash Collection", value: state.analytics.cashCollected, kind: "currency" },
          { label: "Cash %", value: `${cashShare.toFixed(2)}%`, kind: "text" },
          { label: "UPI Collection", value: state.analytics.upiCollected, kind: "currency" },
          { label: "UPI %", value: `${upiShare.toFixed(2)}%`, kind: "text" }
        ], { className: "cards-inline analytics-cards-4" })}
      </div>
      <div class="panel stack">
        <div class="panel-heading">
          <h3>Collection Trend</h3>
          <div class="pill">${state.analyticsFilters.rangePreset === "last12weeks" ? "Week wise" : state.analyticsFilters.rangePreset === "last12months" ? "Month wise" : "Day wise"}</div>
        </div>
        <div class="analytics-chart">
          ${series.map(item => `
            <div class="chart-col">
              <div class="chart-bars">
                <div class="chart-bar chart-bar-cash" style="height:${Math.max(8, (Number(item.cash || 0) / maxSeriesValue) * 140)}px" title="Cash ${formatCurrency(item.cash || 0)}"></div>
                <div class="chart-bar chart-bar-upi" style="height:${Math.max(8, (Number(item.upi || 0) / maxSeriesValue) * 140)}px" title="UPI ${formatCurrency(item.upi || 0)}"></div>
              </div>
              <div class="chart-total">${formatCurrency(item.total || 0)}</div>
              <div class="chart-label">${item.label}</div>
            </div>
          `).join("") || `<div class="muted">No collections found in the selected range.</div>`}
        </div>
      </div>
    </div>
  `;
}

function renderFinances() {
  if (state.loading.active && state.loading.view === "finances") {
    return renderTimedLoading("finances", "Preparing projected income, expenses, and current position.");
  }
  return `
    <div class="grid">
      <div class="panel">
        <h3>Finances</h3>
        ${renderReportActions()}
        ${renderTable(
          ["Metric", "Value"],
          Object.entries(state.finances || {}).map(([key, value]) => [key, typeof value === "number" ? formatCurrency(value) : value])
        )}
      </div>
      <div class="panel">
        <h3>Partner Accounts</h3>
        ${renderTable(
          ["Partner", "Share %", "Shortfall", "Profit Share", "Expenses Paid", "Collections Received", "Net Contribution", "Still Required", "Excess"],
          state.partners.map(item => [
            item.partnerName,
            item.sharePercentage,
            formatCurrency(item.shortfallResponsibility),
            formatCurrency(item.projectedProfitShare),
            formatCurrency(item.expensesDonePersonally),
            formatCurrency(item.feesCollectionsReceived),
            formatCurrency(item.netContribution),
            formatCurrency(item.amountStillRequired),
            formatCurrency(item.excessContribution)
          ])
        )}
      </div>
    </div>
  `;
}

function renderLogs() {
  if (state.loading.active && state.loading.view === "logs") {
    return renderTimedLoading("logs", "Loading the full audit trail and action history.");
  }
  return `
    <div class="panel">
      <h3>Logs</h3>
      ${renderReportActions()}
      <div class="inline-form">
        <input id="logs-login-id" placeholder="Login ID" value="${state.logFilters.loginId}" />
        <input id="logs-action" placeholder="Action" value="${state.logFilters.actionName}" />
        <button class="secondary" onclick="handleFilterLogs()">Filter</button>
      </div>
      ${renderTable(
        ["Date Time", "Login ID", "Role", "Action", "Entity Type", "Entity ID", "Reason"],
        state.logs.map(item => [
          item["Date Time"],
          item["Login ID"],
          item["Role"],
          item["Action"],
          item["Entity Type"],
          item["Entity ID"],
          item["Reason"]
        ])
      )}
      ${renderPager(state.logsMeta, "handleLogsPage")}
    </div>
  `;
}

function renderSetup() {
  const partners = safe(state, "bootstrap.partners", []);
  const categories = safe(state, "bootstrap.categories", []);
  const feeHeads = safe(state, "bootstrap.feeHeads", []);
  const classes = safe(state, "bootstrap.classes", []);
  const schedules = safe(state, "bootstrap.schedules", []).slice().sort((a, b) => {
    const byHead = String(a.feeHead || "").localeCompare(String(b.feeHead || ""));
    if (byHead) return byHead;
    return String(a.dueDate || "").localeCompare(String(b.dueDate || ""));
  });
  const schoolName = safe(state, "bootstrap.schoolName", "");
  const academicYear = safe(state, "bootstrap.academicYear", "");
  const partnerOptions = partners.map(item => `<div class="pill">${item["Partner Name"]} - ${item["Share Percentage"]}%</div>`).join("");
  const categoryOptions = categories.map(item => `<div class="pill">${item["Category Name"]}</div>`).join("");
  const feeHeadOptions = feeHeads.map(item => `<div class="pill">${item.headName}</div>`).join("");
  const classOptions = classes.map(item => {
    const feeHeadConfigs = getClassFeeConfigs(item);
    const feeText = feeHeadConfigs.map(config => `${config.headName}: ${formatCurrency(config.actualFee || 0)}`).join(", ");
    return `<div class="pill">${item.className}${feeText ? ` • ${feeText}` : ""}</div>`;
  }).join("");
  const partnerLines = partners.map(item => `${item["Partner Name"]},${item["Share Percentage"]}`).join("\n");
  const canSchedule = feeHeads.length > 0;
  const scheduleDraft = state.scheduleDraft || { feeHead: "", instalmentCount: 1, dates: [""] };
  const scheduleHead = scheduleDraft.feeHead || safe(feeHeads, "0.headName", "");
  const instalmentCount = Math.max(1, Math.min(24, Number(scheduleDraft.instalmentCount || 1)));
  const setupSection = state.setupSection || "heads";
  const navItems = [
    ["general", "General"],
    ["heads", "Fee Heads"],
    ["schedules", "Schedules"],
    ["categories", "Categories"],
    ["partners", "Partners"]
  ];
  let sectionContent = "";
  if (setupSection === "general") {
    sectionContent = `
      <div class="setup-grid">
        <div class="panel stack setup-card">
          <div class="section-head">
            <h3>Basic Settings</h3>
            <div class="muted">School details used across the app.</div>
          </div>
          <label>School Name<input id="setup-school-name" value="${schoolName}" /></label>
          <label>Academic Year<input id="setup-year" value="${academicYear}" /></label>
          <button class="primary" onclick="handleSaveSettings()">Save Settings</button>
          <button class="secondary" onclick="handleChangePassword()">Change Password</button>
        </div>
        <div class="panel stack setup-card">
          <div class="section-head">
            <h3>Add Class</h3>
            <div class="muted">Create the class and choose the fee heads linked to it.</div>
          </div>
          <div class="form-grid">
            <label>Class Name<input id="setup-class-name" /></label>
          </div>
          <div class="stack">
            <div class="muted">Fee Heads For This Class</div>
            <div class="class-head-grid">
              ${feeHeads.map(item => `
                <label class="class-head-option">
                  <input class="setup-class-head" type="checkbox" value="${item.headName}" />
                  <span>${item.headName}</span>
                  <input class="setup-class-head-fee" data-head="${item.headName}" type="number" min="0" placeholder="Actual fee" />
                </label>
              `).join("") || '<div class="muted">Create fee heads first.</div>'}
            </div>
          </div>
          <button class="primary" onclick="handleSaveClass()">Add Class</button>
          <div class="pill-cloud">${classOptions || '<span class="muted">No classes yet</span>'}</div>
        </div>
        <div class="panel stack setup-card setup-card-wide">
          <div class="section-head">
            <h3>Manage Classes</h3>
            <div class="muted">Delete classes that have not been used yet.</div>
          </div>
          ${classes.length ? renderTable(
            ["Class", "Actions"],
            classes.map(item => [
              `${item.className}<div class="muted">${getClassFeeConfigs(item).map(config => `${config.headName}: ${formatCurrency(config.actualFee || 0)}`).join(" • ") || "No fee heads linked"}</div>`,
              `<div class="actions-row">
                <button class="danger" onclick="handleDeleteClass('${item.classId}', '${String(item.className || '').replace(/'/g, "\\'")}')">Delete</button>
              </div>`
            ])
          ) : '<div class="muted">No classes yet</div>'}
        </div>
      </div>
    `;
  }
  if (setupSection === "heads") {
    sectionContent = `
      <div class="setup-grid">
        <div class="panel stack setup-card">
          <div class="section-head">
            <h3>Add Fee Head</h3>
            <div class="muted">Examples: Tuition, Van Fee, Books, Exam Fee.</div>
          </div>
          <label>Fee Head Name<input id="setup-fee-head-name" placeholder="Tuition / Books / Van / Exam Fee" /></label>
          <button class="primary" onclick="handleSaveFeeHead()">Add Fee Head</button>
          <div class="pill-cloud">${feeHeadOptions || '<span class="muted">No fee heads yet</span>'}</div>
        </div>
        <div class="panel stack setup-card setup-card-wide">
          <div class="section-head">
            <h3>Manage Fee Heads</h3>
            <div class="muted">Rename or delete unused fee heads.</div>
          </div>
          ${feeHeads.length ? renderTable(
            ["Fee Head", "Actions"],
            feeHeads.map(item => [
              item.headName,
              `<div class="actions-row">
                <button class="secondary" onclick="handleEditFeeHead('${item.headId}', '${item.headName.replace(/'/g, "\\'")}')">Edit</button>
                <button class="danger" onclick="handleDeleteFeeHead('${item.headId}')">Delete</button>
              </div>`
            ])
          ) : '<div class="muted">No fee heads yet</div>'}
        </div>
      </div>
    `;
  }
  if (setupSection === "schedules") {
    sectionContent = `
      <div class="setup-grid">
        <div class="panel stack setup-card setup-card-wide">
          <div class="section-head">
            <h3>Add Schedule Date</h3>
            <div class="muted">Pick a fee head, choose instalments, then enter the exact due date for each one.</div>
          </div>
          ${canSchedule ? `
            <div class="form-grid">
              <label>Fee Head
                <select id="setup-schedule-head" onchange="handleScheduleHeadChange()">
                  ${feeHeads.map(item => `<option value="${item.headName}" ${scheduleHead === item.headName ? "selected" : ""}>${item.headName}</option>`).join("")}
                </select>
              </label>
              <label>No. of Instalments<input id="setup-schedule-count" type="number" min="1" max="24" value="${instalmentCount}" onchange="handleScheduleCountChange()" /></label>
            </div>
            <div class="schedule-date-grid">
              ${Array.from({ length: instalmentCount }, (_, index) => `
                <label class="schedule-date-card">Instalment ${index + 1} Due Date
                  <input class="setup-schedule-date" data-index="${index}" type="date" value="${scheduleDraft.dates[index] || ""}" />
                </label>
              `).join("")}
            </div>
            <div class="muted">Add the exact due date for each instalment of this fee head.</div>
            <button class="primary" onclick="handleSaveSchedule()">Add Schedule</button>
          ` : `<div class="muted">Create at least one fee head first, then add schedule dates for it.</div>`}
        </div>
        <div class="panel stack setup-card setup-card-wide">
          <div class="section-head">
            <h3>Manage Schedules</h3>
            <div class="muted">View, edit, or delete existing schedule dates.</div>
          </div>
          ${schedules.length ? renderTable(
            ["Fee Head", "Due Date", "Actions"],
            schedules.map(item => [
              item.feeHead,
              item.dueDate,
              `<div class="actions-row">
                <button class="secondary" onclick="handleEditSchedule('${item.scheduleId}', '${item.feeHead.replace(/'/g, "\\'")}', '${item.dueDate}')">Edit</button>
                <button class="danger" onclick="handleDeleteSchedule('${item.scheduleId}')">Delete</button>
              </div>`
            ])
          ) : '<div class="muted">No schedules yet</div>'}
        </div>
      </div>
    `;
  }
  if (setupSection === "categories") {
    sectionContent = `
      <div class="setup-grid">
        <div class="panel stack setup-card">
          <div class="section-head">
            <h3>Add Expense Category</h3>
            <div class="muted">Keep expense entry clean and consistent.</div>
          </div>
          <label>Category Name<input id="setup-category-name" /></label>
          <button class="primary" onclick="handleSaveCategory()">Add Category</button>
          <div class="pill-cloud">${categoryOptions || '<span class="muted">No categories yet</span>'}</div>
        </div>
        <div class="panel stack setup-card setup-card-wide">
          <div class="section-head">
            <h3>Manage Categories</h3>
            <div class="muted">Delete categories that have not been used in expenses.</div>
          </div>
          ${categories.length ? renderTable(
            ["Category", "Actions"],
            categories.map(item => [
              item["Category Name"],
              `<div class="actions-row">
                <button class="danger" onclick="handleDeleteCategory('${item["Category ID"]}')">Delete</button>
              </div>`
            ])
          ) : '<div class="muted">No categories yet</div>'}
        </div>
      </div>
    `;
  }
  if (setupSection === "partners") {
    sectionContent = `
      <div class="setup-grid">
        <div class="panel stack setup-card setup-card-wide">
          <div class="section-head">
            <h3>Partner Share Set</h3>
            <div class="muted">One line per partner. Total must equal 100%.</div>
          </div>
          <label>Partners and shares
            <textarea id="setup-partner-lines" placeholder="Partner A,60&#10;Partner B,40">${partnerLines}</textarea>
          </label>
          <button class="primary" onclick="handleSavePartner()">Save Partner Set</button>
          <div class="muted">Partner shares must total exactly 100% in each save request.</div>
          <div class="pill-cloud">${partnerOptions || '<span class="muted">No partners yet</span>'}</div>
        </div>
      </div>
    `;
  }
  return `
    <div class="setup-shell stack">
      <div class="setup-hero panel">
        <div class="setup-hero-copy">
          <div class="eyebrow">System Setup</div>
          <div class="brand">Configure Once, Run Fast</div>
          <div class="muted">Create classes, fee heads, schedules, categories, and partner shares in one clean workspace.</div>
        </div>
      </div>
      <div class="setup-nav panel">
        ${navItems.map(([key, label]) => `<button class="${setupSection === key ? "active" : ""}" onclick="handleSetupSection('${key}')">${label}</button>`).join("")}
      </div>
      ${sectionContent}
    </div>
  `;
}

function renderMain() {
  const schoolName = safe(state, "bootstrap.schoolName", "School Fee Management");
  const academicYear = safe(state, "bootstrap.academicYear", "");
  const userId = safe(state, "bootstrap.userId", "");
  const role = safe(state, "bootstrap.role", "");
  const currentViewLabel = visibleMenu().find(item => item[0] === state.view)?.[1] || "Dashboard";
  const contentMap = {
    dashboard: renderDashboard,
    students: renderStudentWorkspace,
    "due-report": renderDueReport,
    expenses: renderExpenses,
    analytics: renderAnalytics,
    finances: renderFinances,
    logs: renderLogs,
    setup: renderSetup
  };
  const activeRenderer = contentMap[state.view] || renderDashboard;
  const loadingTitle = String(state.view || "module").replace(/-/g, " ");
  const menuIconMap = {
    dashboard: "DB",
    students: "SF",
    "due-report": "DR",
    expenses: "EX",
    analytics: "AN",
    finances: "FN",
    logs: "LG",
    setup: "ST"
  };
  return `
    <div class="shell theme-${state.theme}">
      <div class="mobile-topbar">
        <div class="mobile-title shell-title">
          <div class="shell-kicker">Next-Gen Counter Desk</div>
          <strong>${schoolName}</strong>
          <span>${currentViewLabel}</span>
        </div>
        <div class="topbar-actions">
          <button class="icon-button shell-control" onclick="toggleTheme()" title="Theme" aria-label="Theme">${state.theme === "dark" ? "Light" : "Dark"}</button>
          <button class="icon-button shell-control" onclick="handleLogout()" title="Logout" aria-label="Logout">Logout</button>
          <button class="icon-button shell-control" onclick="toggleMobileMenu()" title="Menu" aria-label="Menu">Menu</button>
        </div>
      </div>
      ${state.mobileMenuOpen ? `<button class="menu-backdrop" onclick="closeMobileMenu()" aria-label="Close menu"></button>` : ""}
      <aside class="sidebar ${state.mobileMenuOpen ? "open" : ""}">
        <div class="sidebar-top">
          <div class="eyebrow">Academic Operations</div>
          <div class="brand">${schoolName}</div>
          <div class="subtle">${currentViewLabel}</div>
          <div class="user-chip">${userId} &bull; ${role}</div>
        </div>
        <div class="menu">
          ${visibleMenu().map(([key, label]) => `
            <button class="${state.view === key ? "active" : ""}" onclick="switchView('${key}')">
              <span class="menu-icon">${menuIconMap[key] || "."}</span>
              <span>${label}</span>
            </button>
          `).join("")}
        </div>
        <div class="sidebar-footer">
          <button class="sidebar-logout" onclick="toggleTheme()">${state.theme === "dark" ? "Light Theme" : "Dark Theme"}</button>
          <div class="sidebar-meta">${academicYear || "Current academic year"}</div>
          <button class="sidebar-logout" onclick="handleLogout()">Logout</button>
        </div>
      </aside>
      <main class="content">
        ${state.message ? `<div class="success">${state.message}</div>` : ""}
        ${state.error ? `<div class="error">${state.error}</div>` : ""}
        ${state.loading.active ? renderTimedLoading(loadingTitle, "Loading module data.") : activeRenderer()}
      </main>
      ${state.studentModalOpen ? renderStudentModal() : ""}
      ${renderCollectFeesModal()}
      ${renderActionOverlay()}
      ${renderSecretPrompt()}
    </div>
  `;
}

function render() {
  qs("#app").innerHTML = state.token && state.bootstrap ? renderMain() : renderLogin();
  toggleModeFields();
}

function bindStudentClassFee() {
  if (state.studentModalOpen) {
    handleStudentClassChange();
  }
}

function openStudentModal() {
  state.studentModalOpen = true;
  render();
  handleStudentClassChange();
}

function closeStudentModal() {
  state.studentModalOpen = false;
  render();
}

function handleStudentClassChange() {
  const classSelect = qs("#student-class");
  const actualFeeInput = qs("#student-actual-fee");
  const committedFeeInput = qs("#student-committed-fee");
  const concessionInput = qs("#student-concession");
  const feeHeadGrid = qs("#student-fee-head-grid");
  if (!classSelect || !actualFeeInput || !committedFeeInput || !concessionInput || !feeHeadGrid) return;
  const selectedClass = safe(state, "bootstrap.classes", []).find(item => item.classId === classSelect.value);
  const feeHeadConfigs = getClassFeeConfigs(selectedClass);
  feeHeadGrid.innerHTML = feeHeadConfigs.length
    ? feeHeadConfigs.map(item => `
      <div class="class-fee-card">
        <div class="class-fee-card-head">${item.headName}</div>
        <label>Actual Fee<input class="student-fee-actual" data-head="${item.headName}" type="number" value="${Number(item.actualFee || 0)}" readonly /></label>
        <label>Committed Fee<input class="student-fee-head" data-head="${item.headName}" data-actual="${Number(item.actualFee || 0)}" type="number" min="0" max="${Number(item.actualFee || 0)}" value="0" oninput="handleStudentCommittedFeeChange()" /></label>
      </div>
    `).join("")
    : `<div class="muted">Select fee heads for this class first in Setup.</div>`;
  actualFeeInput.value = feeHeadConfigs.reduce((acc, item) => acc + Number(item.actualFee || 0), 0);
  committedFeeInput.value = "0";
  concessionInput.value = actualFeeInput.value;
  if (qs("#student-joined")) {
    qs("#student-joined").value = getDefaultStudentJoinedDate(selectedClass);
  }
  handleStudentCommittedFeeChange();
}

function handleStudentCommittedFeeChange() {
  const feeInputs = Array.from(document.querySelectorAll(".student-fee-head"));
  feeInputs.forEach(input => {
    const actual = Number(input.dataset.actual || 0);
    const nextValue = Math.max(0, Math.min(actual, Number(input.value || 0)));
    if (Number(input.value || 0) !== nextValue) {
      input.value = String(nextValue);
    }
  });
  const actualFee = Array.from(document.querySelectorAll(".student-fee-actual")).reduce((acc, input) => acc + Number(input.value || 0), 0);
  if (qs("#student-actual-fee")) {
    qs("#student-actual-fee").value = actualFee;
  }
  const committedFee = feeInputs.reduce((acc, input) => acc + Number(input.value || 0), 0);
  if (qs("#student-committed-fee")) {
    qs("#student-committed-fee").value = committedFee;
  }
  const concession = Math.max(0, actualFee - committedFee);
  if (qs("#student-concession")) {
    qs("#student-concession").value = concession;
  }
}

function pickStudentBulkClass() {
  const classes = safe(state, "bootstrap.classes", []);
  if (!classes.length) {
    throw new Error("Create a class first in Setup.");
  }
  const options = classes.map(item => item.className).join(", ");
  const chosen = window.prompt(`Enter class name for the student template/upload:\n${options}`, state.studentClassFilter || classes[0].className || "");
  if (!chosen) return null;
  const selected = classes.find(item => String(item.className).toLowerCase() === String(chosen).trim().toLowerCase());
  if (!selected) {
    throw new Error("Selected class was not found.");
  }
  return selected;
}

function buildStudentTemplateHeaders(selectedClass) {
  const feeHeads = selectedClass && Array.isArray(selectedClass.feeHeads) && selectedClass.feeHeads.length
    ? selectedClass.feeHeads
    : safe(state, "bootstrap.feeHeads", []).map(item => item.headName);
  return ["Student Name", "Mobile Number", "Status", "Joined Date", "Committed School Fee"].concat(feeHeads);
}

function downloadStudentBulkTemplate() {
  try {
    const selectedClass = pickStudentBulkClass();
    if (!selectedClass) return;
    const headers = buildStudentTemplateHeaders(selectedClass);
    const sampleRow = ["", "", "Active", new Date().toISOString().slice(0, 10), 0]
      .concat(headers.slice(5).map(() => ""));
    const csv = [headers, sampleRow].map(row => row.map(value => JSON.stringify(String(value ?? ""))).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${selectedClass.className.replace(/\s+/g, "_")}_student_template.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setMessage(`Sample CSV downloaded for ${selectedClass.className}`);
  } catch (error) {
    setMessage(error.message, true);
  }
}

function openStudentBulkUpload() {
  try {
    const selectedClass = pickStudentBulkClass();
    if (!selectedClass) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv";
    input.onchange = () => {
      const file = input.files && input.files[0];
      if (file) handleStudentBulkUpload(file, selectedClass);
    };
    input.click();
  } catch (error) {
    setMessage(error.message, true);
  }
}

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      row.push(current);
      current = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(current);
      rows.push(row);
      row = [];
      current = "";
    } else {
      current += char;
    }
  }
  if (current.length || row.length) {
    row.push(current);
    rows.push(row);
  }
  return rows.filter(item => item.some(cell => String(cell || "").trim() !== ""));
}

async function handleStudentBulkUpload(file, selectedClass) {
  const feeHeads = Array.isArray(selectedClass.feeHeads) && selectedClass.feeHeads.length
    ? selectedClass.feeHeads
    : safe(state, "bootstrap.feeHeads", []).map(item => item.headName);
  const text = await file.text();
  const rows = parseCsvRows(text);
  if (rows.length < 2) {
    setMessage("CSV is empty.", true);
    return;
  }
  const headers = rows[0].map(item => String(item || "").trim());
  const headerIndex = Object.fromEntries(headers.map((item, index) => [item, index]));
  if (headerIndex["Student Name"] === undefined || headerIndex["Mobile Number"] === undefined || headerIndex["Committed School Fee"] === undefined) {
    setMessage("CSV must include Student Name, Mobile Number, and Committed School Fee columns.", true);
    return;
  }
  const missingFeeHeadColumns = feeHeads.filter(headName => headerIndex[headName] === undefined);
  if (missingFeeHeadColumns.length) {
    setMessage(`CSV is missing fee-head columns for this class: ${missingFeeHeadColumns.join(", ")}`, true);
    return;
  }
  const dataRows = rows.slice(1).filter(row => String(row[headerIndex["Student Name"]] || "").trim());
  if (!dataRows.length) {
    setMessage("No student rows found in CSV.", true);
    return;
  }
  try {
    await runAction("Uploading students", async () => {
      await api("addStudentsBulk", {
        students: dataRows.map(row => {
          const feeAssignments = feeHeads.map(headName => ({
            head: headName,
            amount: Number(row[headerIndex[headName]] || 0)
          })).filter(item => item.amount > 0);
          return {
          studentName: String(row[headerIndex["Student Name"]] || "").trim(),
          classId: selectedClass.classId,
          mobileNumber: String(row[headerIndex["Mobile Number"]] || "").trim(),
          status: String(row[headerIndex["Status"]] || "Active").trim() || "Active",
          joinedDate: String(row[headerIndex["Joined Date"]] || new Date().toISOString().slice(0, 10)).trim(),
          committedSchoolFee: Number(row[headerIndex["Committed School Fee"]] || 0),
          feeAssignments
          };
        })
      });
      state.students = await api("listStudents");
      markFresh(["students"]);
      markStale(["dashboard", "dueReport", "analytics", "finances", "setup"]);
    });
    setMessage(`${dataRows.length} students uploaded for ${selectedClass.className}`);
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function handleLogin() {
  try {
    await runAction("Signing in", async () => {
      const apiUrl = ensureApiUrl(true);
      if (!apiUrl) {
        throw new Error("Apps Script web app URL is required.");
      }
      localStorage.setItem("feeApiUrl", apiUrl);
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          action: "login",
          payload: {
            userId: qs("#login-user").value,
            password: qs("#login-password").value
          }
        })
      });
      const text = await response.text();
      let result;
      try {
        result = JSON.parse(text);
      } catch (error) {
        if (/^\s*</.test(text)) {
          throw new Error("Apps Script returned an HTML page instead of JSON. Redeploy the web app and confirm access is set correctly.");
        }
        throw new Error("Invalid response from Apps Script.");
      }
      if (!result.success) throw new Error(result.error);
      state.token = result.data.token;
      localStorage.setItem("feeToken", state.token);
      markStale(["dashboard", "students", "receipts", "expenses", "dueReport", "analytics", "finances", "partners", "logs", "setup"]);
      if (result.data.bootstrap) {
        setBootstrap(result.data.bootstrap);
        markFresh(["setup"]);
      } else {
        setBootstrap(await api("getBootstrap", {}, result.data.token));
        markFresh(["setup"]);
      }
      if (result.data.dashboard) {
        state.dashboard = result.data.dashboard;
        markFresh(["dashboard"]);
      }
      setMessage("Login successful");
      state.view = "dashboard";
      render();
      if (state.stale.dashboard || !state.dashboard) {
        loadViewData("dashboard").catch(error => {
          setMessage(error.message, true);
        });
      }
    });
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function handleLogout() {
  try {
    await api("logout");
  } catch (error) {
    console.error(error);
  }
  localStorage.removeItem("feeToken");
  localStorage.removeItem("feeBootstrap");
  state.token = "";
  state.bootstrap = null;
  render();
}

function toggleMobileMenu() {
  state.mobileMenuOpen = !state.mobileMenuOpen;
  render();
}

function closeMobileMenu() {
  if (!state.mobileMenuOpen) return;
  state.mobileMenuOpen = false;
  render();
}

function toggleTheme() {
  setTheme(state.theme === "dark" ? "light" : "dark");
  render();
}

async function switchView(view) {
  try {
    state.mobileMenuOpen = false;
    await loadViewData(view);
  } catch (error) {
    setMessage(error.message, true);
  }
}

function toggleModeFields() {
  const mode = qs("#collect-mode");
  const isUpi = mode && mode.value === "UPI";
  if (qs("#upi-ref-wrap")) qs("#upi-ref-wrap").style.display = isUpi ? "grid" : "none";
  if (qs("#upi-in-wrap")) qs("#upi-in-wrap").style.display = isUpi ? "grid" : "none";
}

async function handleAddStudent() {
  try {
    const classSelect = qs("#student-class");
    if (!classSelect || !classSelect.value) {
      setMessage("Create a class first in Setup, then add the student.", true);
      return;
    }
    const nameInput = qs("#student-name");
    const mobileInput = qs("#student-mobile");
    const statusInput = qs("#student-status");
    const joinedInput = qs("#student-joined");
    if (!nameInput || !mobileInput || !statusInput || !joinedInput) {
      setMessage("Student form is not ready. Reopen the popup and try again.", true);
      return;
    }
    const feeInputs = Array.from(document.querySelectorAll(".student-fee-head"));
    const hasPositiveFee = feeInputs.some(input => Number(input.value || 0) > 0);
    if (!hasPositiveFee) {
      setMessage("Enter at least one fee head amount for the student.", true);
      return;
    }
    const studentPayload = {
      studentName: nameInput.value.trim(),
      classId: classSelect.value,
      mobileNumber: mobileInput.value.trim(),
      committedSchoolFee: feeInputs.reduce((acc, input) => acc + Number(input.value || 0), 0),
      feeAssignments: feeInputs
        .map(input => ({
          head: input.dataset.head,
          amount: Number(input.value || 0)
        }))
        .filter(item => item.amount > 0),
      status: statusInput.value,
      joinedDate: joinedInput.value
    };
    if (!studentPayload.studentName) {
      setMessage("Student name is required", true);
      return;
    }
    if (!studentPayload.mobileNumber) {
      setMessage("Mobile number is required", true);
      return;
    }
    await runAction("Saving student", async () => {
      await api("addStudent", studentPayload);
      state.students = await api("listStudents");
      markFresh(["students"]);
      markStale(["dashboard", "dueReport", "analytics", "finances", "setup"]);
    });
    state.studentModalOpen = false;
    setMessage("Student added");
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function handleOpenLedger(studentId) {
  try {
    state.ledger = await api("getStudentLedger", { studentId });
    render();
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function handleToggleStudentStatus(studentId, currentStatus) {
  const reason = prompt(currentStatus === "Active" ? "Reason for inactivation" : "Reason for reactivation");
  if (!reason) return;
  try {
    await runAction("Updating student status", async () => {
      await api("setStudentStatus", {
        studentId,
        status: currentStatus === "Active" ? "Inactive" : "Active",
        reason
      });
      state.students = await api("listStudents");
      markFresh(["students"]);
      markStale(["dashboard", "dueReport", "analytics", "finances"]);
      if (state.ledger && state.ledger.student["Student ID"] === studentId) {
        state.ledger = await api("getStudentLedger", { studentId });
      }
    });
    setMessage("Student status updated");
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function handleManageStudent(studentId, currentStatus) {
  const action = await resolveDeleteAction("this child");
  if (!action) return;
  try {
    if (action.mode === "archive") {
      await runAction(currentStatus === "Active" ? "Inactivating student" : "Reactivating student", async () => {
        await api("setStudentStatus", {
          studentId,
          status: currentStatus === "Active" ? "Inactive" : "Active",
          reason: action.reason
        });
        state.students = await api("listStudents");
        markFresh(["students"]);
        markStale(["dashboard", "dueReport", "analytics", "finances", "logs"]);
        if (state.ledger && state.ledger.student["Student ID"] === studentId) {
          state.ledger = await api("getStudentLedger", { studentId });
        }
      });
      setMessage(currentStatus === "Active" ? "Student inactivated" : "Student reactivated");
      return;
    }
    await runAction("Deleting student", async () => {
      await api("deleteStudent", { studentId, deleteCode: action.deleteCode });
      state.students = await api("listStudents");
      markFresh(["students"]);
      markStale(["dashboard", "dueReport", "analytics", "finances", "logs"]);
      if (state.ledger && state.ledger.student["Student ID"] === studentId) {
        state.ledger = null;
      }
    });
    setMessage("Student permanently deleted");
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function handleDeleteStudent(studentId) {
  const deleteCode = await requestSecretCode("Delete Child", "Enter the password to permanently remove this child.");
  if (!deleteCode) return;
  try {
    await runAction("Deleting student", async () => {
      await api("deleteStudent", { studentId, deleteCode: deleteCode.trim() });
      state.students = await api("listStudents");
      markFresh(["students"]);
      markStale(["dashboard", "dueReport", "analytics", "finances", "logs"]);
      if (state.ledger && state.ledger.student["Student ID"] === studentId) {
        state.ledger = null;
      }
    });
    setMessage("Student permanently deleted");
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function handleCollectFeesForStudent(studentId) {
  try {
    state.collectStudentId = studentId;
    state.collectModalOpen = true;
    state.selectedReceipt = null;
    state.collectLedger = null;
    state.collectReceiptHistory = [];
    state.collectReceiptMeta = { rows: [], total: 0, page: 1, pageSize: 20, totalPages: 1 };
    render();
    await runAction("Loading student dues", async () => {
      state.collectLedger = await api("getStudentLedger", { studentId });
      await loadCollectReceiptHistory(1);
    });
    render();
  } catch (error) {
    setMessage(error.message, true);
  }
}

function closeCollectFeesModal() {
  state.collectModalOpen = false;
  state.collectStudentId = "";
  state.collectLedger = null;
  state.collectReceiptHistory = [];
  state.collectReceiptMeta = { rows: [], total: 0, page: 1, pageSize: 20, totalPages: 1 };
  state.selectedReceipt = null;
  render();
}

async function loadCollectReceiptHistory(page = 1) {
  if (!state.collectStudentId) return;
  const response = await api("listReceipts", {
    studentId: state.collectStudentId,
    paginated: true,
    page,
    pageSize: state.collectReceiptMeta.pageSize || 20
  });
  state.collectReceiptHistory = response.rows;
  state.collectReceiptMeta = response;
}

async function handleDownloadStudentReceipts(studentId) {
  try {
    const receipts = await api("listReceipts", { studentId });
    if (!receipts.length) {
      setMessage("No receipts found for this student", true);
      return;
    }
    const student = state.students.find(item => item.studentId === studentId);
    const headers = ["Receipt Number", "Date", "Student Name", "Class Name", "Mode", "Amount", "Status", "UPI Reference", "Cancellation Number"];
    const rows = receipts.map(item => [
      item["Receipt Number"],
      formatDateOnly(item["Receipt Date"]),
      item["Student Name"],
      item["Class Name"],
      item["Payment Mode"],
      item["Amount"],
      item["Status"],
      item["UPI Reference"] || "",
      item["Cancellation Number"] || ""
    ]);
    const csv = [headers].concat(rows)
      .map(row => row.map(value => JSON.stringify(String(value ?? ""))).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${String((student && student.studentName) || studentId).replace(/\s+/g, "_")}_receipts.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setMessage("Student receipts downloaded");
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function handleCollectReceiptPage(page) {
  try {
    await loadCollectReceiptHistory(page);
    render();
  } catch (error) {
    setMessage(error.message, true);
  }
}

function handleStudentFilters() {
  state.studentSearch = qs("#student-search") ? qs("#student-search").value : "";
  state.studentClassFilter = qs("#student-class-filter") ? qs("#student-class-filter").value : "";
  state.studentStatusFilter = qs("#student-status-filter") ? qs("#student-status-filter").value : "";
  render();
}

async function resolveDeleteAction(entityLabel) {
  const archiveReason = prompt(`Enter archive reason for ${entityLabel}. Leave blank if you want permanent delete.`);
  if (archiveReason === null) {
    return null;
  }
  if (archiveReason.trim()) {
    return { mode: "archive", reason: archiveReason.trim() };
  }
  const deleteCode = await requestSecretCode("Permanent Delete", `Enter the password to permanently remove ${entityLabel}.`);
  if (!deleteCode) {
    return null;
  }
  return { mode: "delete", deleteCode: deleteCode.trim() };
}

function handleStartReassign(studentId) {
  const defaultHead = safe(state, "bootstrap.feeHeads.0.headName", "");
  if (!defaultHead) {
    setMessage("Create a fee head first in Setup.", true);
    return;
  }
  state.reassignDraft = {
    studentId,
    feeHead: defaultHead,
    newAmount: 0,
    reason: ""
  };
  render();
}

function handleCancelReassign() {
  state.reassignDraft = null;
  render();
}

async function handleSubmitReassign() {
  if (!state.reassignDraft) return;
  const feeHead = qs("#reassign-fee-head") ? qs("#reassign-fee-head").value : "";
  const newAmount = qs("#reassign-amount") ? Number(qs("#reassign-amount").value || 0) : 0;
  const reason = qs("#reassign-reason") ? qs("#reassign-reason").value.trim() : "";
  if (!feeHead) {
    setMessage("Fee head is required", true);
    return;
  }
  if (!reason) {
    setMessage("Reason is required", true);
    return;
  }
  try {
    await runAction("Reassigning fee head", async () => {
      await api("reassignFees", {
        studentId: state.reassignDraft.studentId,
        feeHead,
        newAmount,
        reason
      });
      state.students = await api("listStudents");
      markFresh(["students"]);
      markStale(["dashboard", "dueReport", "analytics", "finances"]);
      state.ledger = await api("getStudentLedger", { studentId: state.reassignDraft.studentId });
      state.reassignDraft = null;
    });
    setMessage("Fee reassigned");
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function handleCollectFees() {
  try {
    if (!state.collectStudentId) {
      throw new Error("Select a student before collecting fees");
    }
    const selectedHead = qs("#collect-head") ? qs("#collect-head").value : "";
    const amount = Number(qs("#collect-amount").value || 0);
    const headSummary = summarizeCollectHeads(state.collectLedger);
    const selectedHeadGroup = headSummary.find(item => item.head === selectedHead);
    if (!selectedHeadGroup) {
      throw new Error("Select a fee head before creating receipt");
    }
    if (amount <= 0) {
      throw new Error("Enter a valid amount");
    }
    if (amount > selectedHeadGroup.remaining) {
      throw new Error("Amount cannot exceed the selected head due amount");
    }
    const payload = {
      studentId: state.collectStudentId,
      paymentDate: qs("#collect-date").value,
      amount: amount,
      paymentMode: qs("#collect-mode").value,
      upiReference: qs("#collect-upi-ref")?.value || "",
      upiReceivedIn: qs("#collect-upi-in")?.value || "",
      allocations: buildAllocationsForHead(selectedHeadGroup.instalments, amount)
    };
    let result;
    await runAction("Creating receipt", async () => {
      result = await api("collectFees", payload);
      state.students = await api("listStudents");
      state.collectLedger = await api("getStudentLedger", { studentId: state.collectStudentId });
      await loadCollectReceiptHistory(1);
      markFresh(["students"]);
      markStale(["dashboard", "receipts", "dueReport", "analytics", "finances", "partners", "logs"]);
    });
    setMessage(`Receipt created: ${result.receiptNumber}`);
    await handlePrintReceipt(result.receiptId, result.receipt && result.allocations ? {
      receipt: result.receipt,
      allocations: result.allocations
    } : null);
  } catch (error) {
    setMessage(error.message, true);
  }
}

function buildAllocationsForHead(instalments, amount) {
  let remaining = Number(amount || 0);
  return instalments
    .slice()
    .sort((a, b) => String(a["Due Date"]).localeCompare(String(b["Due Date"])))
    .map(item => {
      const available = Number(item["Remaining Amount"] || 0);
      const allocated = Math.min(remaining, available);
      remaining -= allocated;
      return allocated > 0 ? { instalmentId: item["Instalment ID"], amount: allocated } : null;
    })
    .filter(Boolean);
}

async function handleCancelReceipt(receiptId) {
  const reason = prompt("Cancellation reason");
  if (!reason) return;
  try {
    await runAction("Cancelling receipt", async () => {
      await api("cancelReceipt", { receiptId, reason });
      if (state.collectModalOpen && state.collectStudentId) {
        await loadCollectReceiptHistory(state.collectReceiptMeta.page || 1);
      } else {
        const receiptResponse = await api("listReceipts", {
          paymentMode: "Cash",
          status: "Valid",
          paginated: true,
          page: 1,
          pageSize: 200
        });
        state.receipts = receiptResponse.rows;
        markFresh(["receipts"]);
      }
      markStale(["dashboard", "students", "dueReport", "analytics", "finances", "partners", "logs"]);
      if (state.selectedReceipt && state.selectedReceipt.receipt["Receipt ID"] === receiptId) {
        state.selectedReceipt = await api("getReceipt", { receiptId });
      }
    });
    setMessage("Receipt cancelled");
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function handleOpenReceipt(receiptId) {
  try {
    state.selectedReceipt = await api("getReceipt", { receiptId });
    render();
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function handlePrintReceipt(receiptId, preloadedDetail = null) {
  try {
    const win = window.open("", "_blank");
    if (!win) {
      setMessage("Allow popups in the browser to print receipts.", true);
      return;
    }
    win.document.write("<html><head><title>Loading receipt...</title></head><body style=\"margin:0;background:#ffffff\"></body></html>");
    win.document.close();
    const detail = preloadedDetail || await api("getReceipt", { receiptId });
    const allocationsHtml = detail.allocations.map(item => `
      <tr>
        <td>${item["Fee Head"]}</td>
        <td>Instalment ${Number(item["Sequence No"] || 0)}</td>
        <td>${formatCurrency(item["Allocated Amount"])}</td>
      </tr>
    `).join("");
    const receiptBlock = (copyLabel) => `
      <div class="receipt-sheet">
        <div class="receipt">
          <div class="receipt-header">
            <h1 class="receipt-title">${state.bootstrap.schoolName}</h1>
            <div class="receipt-subtitle">FEE RECEIPT</div>
            <div class="copy-badge">${copyLabel}</div>
          </div>
          <div class="receipt-body">
            <div class="section-title">RECEIPT INFORMATION</div>
            <div class="fields-grid">
              <div class="field-box grey">
                <span class="field-label">ACADEMIC YEAR</span>
                <span class="field-value">${state.bootstrap.academicYear}</span>
              </div>
              <div class="field-box grey">
                <span class="field-label">RECEIPT NUMBER</span>
                <span class="field-value">${detail.receipt["Receipt Number"]}</span>
              </div>
              <div class="field-box">
                <span class="field-label">DATE</span>
                <span class="field-value">${formatDateOnly(detail.receipt["Receipt Date"])}</span>
              </div>
              <div class="field-box">
                <span class="field-label">PAYMENT MODE</span>
                <span class="field-value">${detail.receipt["Payment Mode"]}</span>
              </div>
            </div>
            <div class="section-title">STUDENT DETAILS</div>
            <div class="fields-grid">
              <div class="field-box">
                <span class="field-label">STUDENT NAME</span>
                <span class="field-value">${detail.receipt["Student Name"]}</span>
              </div>
              <div class="field-box">
                <span class="field-label">CLASS</span>
                <span class="field-value">${detail.receipt["Class Name"]}</span>
              </div>
              <div class="field-box">
                <span class="field-label">MOBILE NUMBER</span>
                <span class="field-value">${detail.receipt["Mobile Number"]}</span>
              </div>
              <div class="field-box">
                <span class="field-label">UPI REFERENCE</span>
                <span class="field-value">${detail.receipt["UPI Reference"] || "-"}</span>
              </div>
            </div>
            <div class="section-title">PAYMENT BREAKUP</div>
            <div class="payment-table">
              <table>
                <thead>
                  <tr>
                    <th>FEE HEAD</th>
                    <th>INSTALMENT</th>
                    <th>AMOUNT</th>
                  </tr>
                </thead>
                <tbody>${allocationsHtml}</tbody>
              </table>
              <div class="payment-note">Payment received successfully</div>
            </div>
            <div class="totals-card">
              <div class="total-item">
                <span class="total-label">TOTAL PAID</span>
                <span class="total-main">${formatCurrency(detail.receipt["Amount"])}</span>
              </div>
              <div class="total-item">
                <span class="total-label">DUE ON RECEIPT DATE</span>
                <span class="total-amount">${formatCurrency(detail.receipt["Due As Of Receipt Date"])}</span>
                <span class="total-note">as on ${formatDateOnly(detail.receipt["Receipt Date"])}</span>
              </div>
              <div class="total-item">
                <span class="total-label">OVERALL REMAINING</span>
                <span class="total-amount">${formatCurrency(detail.receipt["Overall Remaining Balance"])}</span>
                <span class="total-note">after this payment</span>
              </div>
            </div>
            <div class="receipt-footer">
              <div>
                <span class="footer-label">Collected by</span>
                <span class="footer-value">${detail.receipt["Collected By"]}</span>
              </div>
              <div>
                <span class="footer-label">Authorised Signature</span>
                <span class="signature-line"></span>
              </div>
            </div>
            <div class="receipt-bottom-note">Computer-generated receipt | No signature required for digital copy</div>
          </div>
        </div>
      </div>`;
    const html = `
      <html><head><title>${detail.receipt["Receipt Number"]}</title>
      <style>
        * { box-sizing: border-box; }
        html, body { margin: 0; width: 210mm; height: 148mm; background: #fff; font-family: Arial, Helvetica, sans-serif; color: #000; overflow: hidden; }
        .sheet { display: grid; grid-template-columns: 1fr 1fr; width: 210mm; height: 148mm; }
        .receipt-sheet { width: 105mm; height: 148mm; padding: 4mm; background: #fff; }
        .receipt { height: 100%; border: 1px solid #a9a9a9; border-radius: 8px; overflow: hidden; background: #fff; }
        .receipt-header { min-height: 52px; padding: 10px 10px 8px 16px; background: #e5e5e5; position: relative; border-bottom: 1px solid #b7b7b7; }
        .receipt-header::before { content: ""; width: 4px; height: 28px; background: #000; border-radius: 4px; position: absolute; left: 10px; top: 11px; }
        .receipt-title { margin: 0 78px 2px 12px; font-size: 9.2pt; font-weight: 800; line-height: 1.02; text-transform: uppercase; }
        .receipt-subtitle { margin-left: 12px; font-size: 6.3pt; font-weight: 800; letter-spacing: 1px; }
        .copy-badge { position: absolute; right: 8px; top: 10px; min-width: 70px; padding: 4px 7px; border-radius: 14px; background: #fff; text-align: center; font-size: 5.8pt; font-weight: 800; letter-spacing: 0.4px; }
        .receipt-body { padding: 7px 9px 7px; }
        .section-title { margin: 0 0 5px; padding-top: 6px; border-top: 1px solid #a9a9a9; font-size: 6.2pt; font-weight: 800; letter-spacing: 0.35px; }
        .fields-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 5px; margin-bottom: 7px; }
        .field-box { min-height: 34px; padding: 5px 6px; border: 1px solid #b7b7b7; border-radius: 7px; background: #fff; }
        .field-box.grey { background: #f4f4f4; }
        .field-label { display: block; margin-bottom: 2px; font-size: 5.5pt; font-weight: 800; color: #454545; letter-spacing: 0.25px; }
        .field-value { display: block; font-size: 8.2pt; font-weight: 800; color: #000; word-break: break-word; line-height: 1.14; }
        .payment-table { overflow: hidden; margin-bottom: 7px; border: 1px solid #a9a9a9; border-radius: 7px; }
        .payment-table table { width: 100%; border-collapse: collapse; }
        .payment-table th { padding: 5px 6px; background: #ededed; border-bottom: 1px solid #a9a9a9; font-size: 5.8pt; text-align: left; }
        .payment-table th:last-child, .payment-table td:last-child { text-align: right; }
        .payment-table td { padding: 5px 6px; border-bottom: 1px solid #d2d2d2; font-size: 6.7pt; vertical-align: top; }
        .payment-table td:last-child { font-size: 7.5pt; font-weight: 800; }
        .payment-note { padding: 4px 6px; font-size: 5.4pt; color: #444; }
        .totals-card { display: grid; grid-template-columns: 1.08fr 1fr 1fr; margin-top: 6px; overflow: hidden; border: 1px solid #9b9b9b; border-radius: 8px; background: #dedede; }
        .total-item { padding: 7px 8px; min-height: 54px; }
        .total-item + .total-item { border-left: 1px solid #9a9a9a; }
        .total-label { display: block; margin-bottom: 3px; font-size: 5.3pt; font-weight: 800; letter-spacing: 0.2px; }
        .total-main { display: block; font-size: 10.5pt; font-weight: 800; line-height: 1; }
        .total-amount { display: block; font-size: 8.2pt; font-weight: 800; line-height: 1.08; }
        .total-note { display: block; margin-top: 3px; font-size: 5.2pt; line-height: 1.1; }
        .receipt-footer { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 7px; padding-top: 7px; border-top: 1px solid #a9a9a9; }
        .footer-label { display: block; margin-bottom: 3px; font-size: 5.5pt; }
        .footer-value { font-size: 6.8pt; font-weight: 800; }
        .signature-line { display: block; height: 12px; border-bottom: 1px solid #000; }
        .receipt-bottom-note { margin-top: 5px; padding-top: 5px; border-top: 1px solid #a9a9a9; text-align: center; font-size: 5.1pt; color: #444; }
        @media print {
          @page { size: A5 landscape; margin: 0; }
          html, body { width: 210mm; height: 148mm; }
          .receipt-sheet { padding: 4mm; }
        }
      </style></head>
      <body><div class="sheet">${receiptBlock("PARENT COPY")}${receiptBlock("OFFICE COPY")}</div>
      <script>window.onload = function () { window.print(); };</script>
      </body></html>`;
    win.document.open();
    win.document.write(html);
    win.document.close();
  } catch (error) {
    setMessage(error.message, true);
  }
}
async function handleDeleteReceipt(receiptId) {
  const deleteCode = await requestSecretCode("Delete Receipt", "Enter the password to permanently remove this cancelled receipt.");
  if (!deleteCode) return;
  try {
    await runAction("Deleting receipt", async () => {
      await api("deleteReceipt", {
        receiptId,
        deleteCode: deleteCode.trim()
      });
      if (state.collectModalOpen && state.collectStudentId) {
        await loadCollectReceiptHistory(state.collectReceiptMeta.page || 1);
      } else {
        const receiptResponse = await api("listReceipts", {
          paymentMode: "Cash",
          status: "Valid",
          paginated: true,
          page: 1,
          pageSize: 200
        });
        state.receipts = receiptResponse.rows;
        markFresh(["receipts"]);
      }
      markStale(["dashboard", "dueReport", "analytics", "finances", "students"]);
      if (state.collectStudentId) {
        state.collectLedger = await api("getStudentLedger", { studentId: state.collectStudentId });
      }
      if (state.selectedReceipt && state.selectedReceipt.receipt["Receipt ID"] === receiptId) {
        state.selectedReceipt = null;
      }
    });
    setMessage("Receipt permanently deleted");
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function handleAddExpense() {
  try {
    await runAction("Saving expense", async () => {
      await api("addExpense", {
        date: qs("#expense-date").value,
        category: qs("#expense-category").value,
        description: qs("#expense-description").value.trim(),
        amount: Number(qs("#expense-amount").value),
        status: qs("#expense-status").value,
        paymentMode: qs("#expense-mode").value,
        paidBy: qs("#expense-paid-by").value.trim(),
        referenceNumber: qs("#expense-ref").value.trim(),
        remarks: qs("#expense-remarks").value.trim()
      });
      state.expenses = await api("listExpenses");
      markFresh(["expenses"]);
      markStale(["finances", "partners", "logs"]);
    });
    setMessage("Expense saved");
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function handleArchiveExpense(expenseId) {
  const reason = prompt("Archive reason");
  if (!reason) return;
  try {
    await runAction("Archiving expense", async () => {
      await api("archiveExpense", { expenseId, reason });
      state.expenses = await api("listExpenses");
      markFresh(["expenses"]);
      markStale(["finances", "partners", "logs"]);
    });
    setMessage("Expense archived");
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function handleCreateHandover() {
  try {
    await runAction("Saving cash handover", async () => {
      await api("createCashHandover", {
        recipient: qs("#handover-recipient").value.trim(),
        handoverDate: qs("#handover-date").value,
        remarks: qs("#handover-remarks").value.trim(),
        allocations: [{
          receiptId: qs("#handover-receipt").value,
          amount: Number(qs("#handover-amount").value)
        }]
      });
      const receiptResponse = await api("listReceipts", {
        paymentMode: "Cash",
        status: "Valid",
        paginated: true,
        page: 1,
        pageSize: 200
      });
      state.receipts = receiptResponse.rows;
      markFresh(["receipts"]);
      markStale(["partners", "logs"]);
    });
    setMessage("Cash handover saved");
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function handleSaveSettings() {
  try {
    await runAction("Saving settings", async () => {
      await api("saveBasicSettings", { schoolName: qs("#setup-school-name").value.trim() });
      await api("setAcademicYear", { academicYear: qs("#setup-year").value.trim() });
      setBootstrap(await api("getBootstrap"));
      markFresh(["setup"]);
      markStale(["dashboard", "students", "receipts", "expenses", "dueReport", "analytics", "finances", "partners", "logs"]);
    });
    setMessage("Settings updated");
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function handleSaveClass() {
  const className = qs("#setup-class-name") ? qs("#setup-class-name").value.trim() : "";
  const feeHeads = Array.from(document.querySelectorAll(".setup-class-head:checked")).map(input => {
    const feeInput = document.querySelector(`.setup-class-head-fee[data-head="${input.value.replace(/"/g, '\\"')}"]`);
    return {
      headName: input.value,
      actualFee: Number(feeInput ? feeInput.value || 0 : 0)
    };
  });
  if (!className) {
    setMessage("Class name is required", true);
    return;
  }
  if (!feeHeads.length) {
    setMessage("Select at least one fee head for the class", true);
    return;
  }
  if (feeHeads.some(item => Number(item.actualFee || 0) <= 0)) {
    setMessage("Enter the actual fee for every selected fee head.", true);
    return;
  }
  try {
    await runAction("Saving class", async () => {
      await api("saveClassSetup", {
        classes: [{
          className,
          feeHeads
        }]
      });
      setBootstrap(await api("getBootstrap"));
      markFresh(["setup"]);
      markStale(["students", "dashboard"]);
    });
    if (qs("#setup-class-name")) qs("#setup-class-name").value = "";
    document.querySelectorAll(".setup-class-head").forEach(input => {
      input.checked = false;
    });
    document.querySelectorAll(".setup-class-head-fee").forEach(input => {
      input.value = "";
    });
    setMessage("Class added");
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function handleDeleteClass(classId, className = "") {
  const action = await resolveDeleteAction("this class");
  if (!action) return;
  try {
    await runAction(action.mode === "delete" ? "Deleting class" : "Archiving class", async () => {
      if (action.mode === "delete") {
        await api("deleteClass", { classId, className, deleteCode: action.deleteCode });
      } else {
        await api("archiveClass", { classId, className, reason: action.reason });
      }
      setBootstrap(await api("getBootstrap"));
      markFresh(["setup"]);
      markStale(["students", "dashboard"]);
    });
    setMessage(action.mode === "delete" ? "Class permanently deleted" : "Class archived");
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function handleSaveFeeHead() {
  const input = qs("#setup-fee-head-name");
  const headName = input ? input.value.trim() : "";
  if (!input) {
    setMessage("Open the Fee Heads section first", true);
    return;
  }
  if (!headName) {
    setMessage("Fee head name is required", true);
    return;
  }
  try {
    await runAction("Saving fee head", async () => {
      await api("saveFeeHeads", {
        heads: [headName]
      });
      setBootstrap(await api("getBootstrap"));
      markFresh(["setup"]);
      markStale(["students", "dueReport", "dashboard"]);
    });
    input.value = "";
    setMessage("Fee head added");
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function handleSetupSection(section) {
  state.setupSection = section;
  render();
  if (!state.token || state.view !== "setup") {
    return;
  }
  try {
    setBootstrap(await api("getBootstrap"));
    markFresh(["setup"]);
    render();
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function handleEditFeeHead(headId, currentName) {
  const headName = prompt("Fee head name", currentName);
  if (!headName || headName.trim() === currentName) return;
  try {
    await runAction("Updating fee head", async () => {
      await api("updateFeeHead", { headId, headName: headName.trim() });
      setBootstrap(await api("getBootstrap"));
      markFresh(["setup"]);
      markStale(["students", "dueReport", "dashboard", "analytics"]);
    });
    setMessage("Fee head updated");
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function handleDeleteFeeHead(headId) {
  const action = await resolveDeleteAction("this fee head");
  if (!action) return;
  try {
    await runAction(action.mode === "delete" ? "Deleting fee head" : "Archiving fee head", async () => {
      if (action.mode === "delete") {
        await api("deleteFeeHead", { headId, deleteCode: action.deleteCode });
      } else {
        await api("archiveFeeHead", { headId, reason: action.reason });
      }
      setBootstrap(await api("getBootstrap"));
      markFresh(["setup"]);
      markStale(["students", "dueReport", "dashboard", "analytics"]);
    });
    setMessage(action.mode === "delete" ? "Fee head permanently deleted" : "Fee head archived");
  } catch (error) {
    setMessage(error.message, true);
  }
}

function handleScheduleHeadChange() {
  state.scheduleDraft.feeHead = qs("#setup-schedule-head") ? qs("#setup-schedule-head").value : "";
}

function handleScheduleCountChange() {
  const nextCount = Math.max(1, Math.min(24, Number(qs("#setup-schedule-count") ? qs("#setup-schedule-count").value : 1) || 1));
  const existingDates = Array.isArray(state.scheduleDraft.dates) ? state.scheduleDraft.dates.slice(0, nextCount) : [];
  while (existingDates.length < nextCount) {
    existingDates.push("");
  }
  state.scheduleDraft = {
    feeHead: qs("#setup-schedule-head") ? qs("#setup-schedule-head").value : state.scheduleDraft.feeHead,
    instalmentCount: nextCount,
    dates: existingDates
  };
  render();
}

async function handleSaveSchedule() {
  try {
    const feeHead = qs("#setup-schedule-head").value;
    const dates = Array.from(document.querySelectorAll(".setup-schedule-date"))
      .map(input => input.value)
      .filter(Boolean);
    if (!dates.length) {
      throw new Error("Add at least one due date");
    }
    await runAction("Saving schedule", async () => {
      await api("saveSchedules", {
        schedules: dates.map(dueDate => ({
          feeHead,
          dueDate,
          instalmentCount: 1
        }))
      });
      state.scheduleDraft = {
        feeHead,
        instalmentCount: 1,
        dates: [""]
      };
      setBootstrap(await api("getBootstrap"));
      markFresh(["setup"]);
      markStale(["students", "dueReport", "dashboard"]);
    });
    setMessage("Schedule added");
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function handleEditSchedule(scheduleId, currentHead, currentDate) {
  const feeHead = prompt("Fee head", currentHead);
  if (!feeHead) return;
  const dueDate = prompt("Due date (YYYY-MM-DD)", currentDate);
  if (!dueDate) return;
  try {
    await runAction("Updating schedule", async () => {
      await api("updateSchedule", {
        scheduleId,
        feeHead: feeHead.trim(),
        dueDate: dueDate.trim()
      });
      setBootstrap(await api("getBootstrap"));
      markFresh(["setup"]);
      markStale(["students", "dueReport", "dashboard"]);
    });
    setMessage("Schedule updated");
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function handleDeleteSchedule(scheduleId) {
  const action = await resolveDeleteAction("this schedule");
  if (!action) return;
  try {
    await runAction(action.mode === "delete" ? "Deleting schedule" : "Archiving schedule", async () => {
      if (action.mode === "delete") {
        await api("deleteSchedule", { scheduleId, deleteCode: action.deleteCode });
      } else {
        await api("archiveSchedule", { scheduleId, reason: action.reason });
      }
      setBootstrap(await api("getBootstrap"));
      markFresh(["setup"]);
      markStale(["students", "dueReport", "dashboard"]);
    });
    setMessage(action.mode === "delete" ? "Schedule permanently deleted" : "Schedule archived");
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function handleSaveCategory() {
  try {
    await runAction("Saving category", async () => {
      await api("saveExpenseCategories", {
        categories: [qs("#setup-category-name").value.trim()]
      });
      setBootstrap(await api("getBootstrap"));
      markFresh(["setup"]);
    });
    setMessage("Category added");
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function handleDeleteCategory(categoryId) {
  const action = await resolveDeleteAction("this category");
  if (!action) return;
  try {
    await runAction(action.mode === "delete" ? "Deleting category" : "Archiving category", async () => {
      if (action.mode === "delete") {
        await api("deleteExpenseCategory", { categoryId, deleteCode: action.deleteCode });
      } else {
        await api("archiveExpenseCategory", { categoryId, reason: action.reason });
      }
      setBootstrap(await api("getBootstrap"));
      markFresh(["setup"]);
    });
    setMessage(action.mode === "delete" ? "Category permanently deleted" : "Category archived");
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function handleSavePartner() {
  try {
    await runAction("Saving partner set", async () => {
      const partners = qs("#setup-partner-lines").value
        .split("\n")
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => {
          const parts = line.split(",");
          return {
            partnerName: (parts[0] || "").trim(),
            sharePercentage: Number((parts[1] || "").trim())
          };
        });
      await api("savePartners", {
        partners
      });
      setBootstrap(await api("getBootstrap"));
      markFresh(["setup"]);
      markStale(["partners", "finances", "logs"]);
    });
    setMessage("Partner set saved");
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function handleFilterExpenses() {
  try {
    state.expenseFilters = {
      ...state.expenseFilters,
      status: qs("#expense-filter-status").value,
      page: 1
    };
    const response = await api("listExpenses", {
      status: state.expenseFilters.status,
      paginated: true,
      page: state.expenseFilters.page,
      pageSize: state.expenseFilters.pageSize
    });
    state.expenses = response.rows;
    state.expensesMeta = response;
    setMessage("Expenses filtered");
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function handleFilterDueReport() {
  try {
    state.dueFilters = {
      ...state.dueFilters,
      asOnDate: qs("#due-date").value,
      activeOnly: qs("#due-active-only").value === "true",
      minimumDueAmount: qs("#due-min").value,
      maximumDueAmount: qs("#due-max").value,
      page: 1
    };
    const response = await api("getDueReport", {
      asOnDate: state.dueFilters.asOnDate,
      activeOnly: state.dueFilters.activeOnly,
      minimumDueAmount: state.dueFilters.minimumDueAmount,
      maximumDueAmount: state.dueFilters.maximumDueAmount,
      paginated: true,
      page: state.dueFilters.page,
      pageSize: state.dueFilters.pageSize
    });
    state.dueReport = response.rows;
    state.dueReportMeta = response;
    setMessage("Due report filtered");
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function handleFilterAnalytics() {
  try {
    state.analyticsFilters = {
      asOfDate: qs("#analytics-date").value,
      paymentMode: qs("#analytics-mode").value,
      studentName: qs("#analytics-student").value.trim(),
      rangePreset: qs("#analytics-range").value
    };
    state.analytics = await api("getAnalytics", state.analyticsFilters);
    setMessage("Analytics filtered");
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function handleFilterLogs() {
  try {
    state.logFilters = {
      ...state.logFilters,
      loginId: qs("#logs-login-id").value.trim(),
      actionName: qs("#logs-action").value.trim(),
      page: 1
    };
    const response = await api("listLogs", {
      loginId: state.logFilters.loginId,
      actionName: state.logFilters.actionName,
      paginated: true,
      page: state.logFilters.page,
      pageSize: state.logFilters.pageSize
    });
    state.logs = response.rows;
    state.logsMeta = response;
    setMessage("Logs filtered");
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function handleExpensesPage(page) {
  try {
    state.expenseFilters.page = page;
    const response = await api("listExpenses", {
      status: state.expenseFilters.status,
      paginated: true,
      page,
      pageSize: state.expenseFilters.pageSize
    });
    state.expenses = response.rows;
    state.expensesMeta = response;
    render();
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function handleDueReportPage(page) {
  try {
    state.dueFilters.page = page;
    const response = await api("getDueReport", {
      asOnDate: state.dueFilters.asOnDate,
      activeOnly: state.dueFilters.activeOnly,
      minimumDueAmount: state.dueFilters.minimumDueAmount,
      maximumDueAmount: state.dueFilters.maximumDueAmount,
      paginated: true,
      page,
      pageSize: state.dueFilters.pageSize
    });
    state.dueReport = response.rows;
    state.dueReportMeta = response;
    render();
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function handleLogsPage(page) {
  try {
    state.logFilters.page = page;
    const response = await api("listLogs", {
      loginId: state.logFilters.loginId,
      actionName: state.logFilters.actionName,
      paginated: true,
      page,
      pageSize: state.logFilters.pageSize
    });
    state.logs = response.rows;
    state.logsMeta = response;
    render();
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function handleChangePassword() {
  const currentPassword = prompt("Current password");
  if (!currentPassword) return;
  const newPassword = prompt("New password");
  if (!newPassword) return;
  try {
    await runAction("Changing password", async () => {
      await api("changePassword", { currentPassword, newPassword });
    });
    setMessage("Password changed");
  } catch (error) {
    setMessage(error.message, true);
  }
}

function exportCurrentView() {
  let rows = [];
  let headers = [];
  if (state.view === "students") rows = state.students;
  if (state.view === "students") headers = ["studentId", "className", "studentName", "mobileNumber", "feeHeadSummary", "totalAssigned", "totalPaid", "overallDue", "dueAsOfToday", "status"];
  if (state.view === "receipts") rows = state.receipts;
  if (state.view === "receipts") headers = ["Receipt Number", "Receipt Date", "Student Name", "Class Name", "Mobile Number", "Amount", "Payment Mode", "UPI Reference", "UPI Received In", "Status", "Collected By"];
  if (state.view === "expenses") rows = state.expenses;
  if (state.view === "expenses") headers = ["Date", "Category", "Description", "Amount", "Status", "Payment Mode", "Paid By", "Reference Number", "Remarks"];
  if (state.view === "due-report") rows = state.dueReport;
  if (state.view === "due-report") headers = ["studentId", "className", "studentName", "mobile", "totalAssigned", "totalPaid", "overallDue", "payableAsOfSelectedDate", "dueAsOfSelectedDate", "status"];
  if (state.view === "logs") rows = state.logs;
  if (state.view === "logs") headers = ["Date Time", "Login ID", "Role", "Action", "Entity Type", "Entity ID", "Student Ref", "Receipt Ref", "Reason"];
  if (!rows.length) {
    setMessage("Nothing to export in this view", true);
    return;
  }
  if (!headers.length) {
    headers = Object.keys(rows[0]);
  }
  const safeCell = (value) => {
    const text = String(value ?? "").replace(/\r?\n/g, " ").trim();
    return /^[=+\-@]/.test(text) ? "'" + text : text;
  };
  const csv = [headers.map(header => JSON.stringify(header)).join(",")]
    .concat(rows.map(row => headers.map(key => JSON.stringify(safeCell(row ? row[key] : ""))).join(",")))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${state.view}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

render();
init();
