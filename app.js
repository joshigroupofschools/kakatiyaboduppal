const DEFAULT_API_URL = "https://script.google.com/macros/s/AKfycbyZ8RXjDl4IPoIYlqG-KwRp-wgtiDLDO3aQwG5qhI0PsAQttq9jQpnB_NYADgSe87l5/exec";
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
  view: "dashboard",
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
  dashboard: null,
  students: [],
  receipts: [],
  expenses: [],
  dueReport: [],
  analytics: null,
  finances: null,
  partners: [],
  logs: [],
  ledger: null,
  reassignDraft: null,
  selectedReceipt: null,
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

function getApiUrl() {
  return localStorage.getItem("feeApiUrl") || DEFAULT_API_URL;
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
  const apiUrl = getApiUrl();
  if (!apiUrl) {
    throw new Error("Apps Script web app URL is missing.");
  }
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, payload, token })
  });
  const data = await response.json();
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
    }, 5000);
  }
}

function setBootstrap(patch) {
  state.bootstrap = Object.assign({}, DEFAULT_BOOTSTRAP, state.bootstrap || {}, patch || {});
  localStorage.setItem("feeBootstrap", JSON.stringify(state.bootstrap));
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
    await loadViewData(state.view);
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
  const isSlowView = SLOW_VIEWS.has(view);
  if (isSlowView) {
    startLoading(view);
    render();
  }
  try {
    if (view === "dashboard" && (state.stale.dashboard || !state.dashboard)) {
      state.dashboard = await api("getDashboard");
      markFresh(["dashboard"]);
    }
    if (view === "students" && (state.stale.students || !state.students.length)) {
      await ensureBootstrapData();
      state.students = await api("listStudents");
      markFresh(["students"]);
    }
    if (view === "collect" && (state.stale.students || !state.students.length)) {
      await ensureBootstrapData();
      state.students = await api("listStudents");
      markFresh(["students"]);
    }
    if (view === "receipts" && (state.stale.receipts || !state.receipts.length)) {
      state.receipts = await api("listReceipts");
      markFresh(["receipts"]);
    }
    if (view === "expenses" && (state.stale.expenses || !state.expenses.length)) {
      await ensureBootstrapData();
      state.expenses = await api("listExpenses");
      markFresh(["expenses"]);
    }
    if (view === "handover" && (state.stale.receipts || !state.receipts.length)) {
      await ensureBootstrapData();
      state.receipts = await api("listReceipts");
      markFresh(["receipts"]);
    }
    if (view === "due-report" && state.stale.dueReport) {
      state.dueReport = await api("getDueReport", { asOnDate: new Date().toISOString().slice(0, 10), activeOnly: true });
      markFresh(["dueReport"]);
    }
    if (view === "analytics" && state.stale.analytics) {
      state.analytics = await api("getAnalytics", { asOfDate: new Date().toISOString().slice(0, 10) });
      markFresh(["analytics"]);
    }
    if (view === "finances" && state.stale.finances) {
      state.finances = await api("getFinances");
      markFresh(["finances"]);
    }
    if (view === "partners" && state.stale.partners) {
      state.partners = await api("getPartnerAccounts");
      markFresh(["partners"]);
    }
    if (view === "logs" && state.stale.logs) {
      state.logs = await api("listLogs");
      markFresh(["logs"]);
    }
    if (view === "setup" && (state.stale.setup || !state.bootstrap)) {
      await ensureBootstrapData();
    }
  } finally {
    if (isSlowView) {
      stopLoading();
    }
  }
  render();
}

function visibleMenu() {
  const items = [
    ["dashboard", "Dashboard"],
    ["students", "Fees Table"],
    ["collect", "Collect Fees"],
    ["receipts", "Receipts"],
    ["due-report", "Due Report"],
    ["expenses", "Expenses"],
    ["handover", "Cash Handover"]
  ];
  if (safe(state, "bootstrap.role", "") === "Senior Admin") {
    items.push(
      ["analytics", "Fee Analytics"],
      ["finances", "Finances"],
      ["partners", "Partner Accounts"],
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
              <strong>1 minute</strong>
              <span>Slow-report modules with timer</span>
            </div>
            <div class="login-stat">
              <strong>Audit ready</strong>
              <span>Receipts, logs, and handovers</span>
            </div>
          </div>
        </section>
        <div class="panel login-card stack">
          <div>
            <div class="eyebrow">Secure Sign In</div>
            <div class="brand">Welcome Back</div>
            <div class="muted">Use your operator account to continue.</div>
          </div>
          <label>Login ID
            <select id="login-user">
              <option value="Admin">Admin</option>
              <option value="Senior Admin">Senior Admin</option>
            </select>
          </label>
          <label>Password<input id="login-password" type="password" /></label>
          <button class="primary" onclick="handleLogin()">Login</button>
          ${state.error ? `<div class="error">${state.error}</div>` : ""}
          <div class="login-note">Initial credentials are temporary. Change both passwords immediately after first login.</div>
        </div>
      </div>
    </div>
  `;
}

function renderCards(cards) {
  return `<div class="cards">${cards.map(card => `
    <div class="card">
      <div class="muted">${card.label}</div>
      <div class="value">${formatValue(card.value, card.kind || (typeof card.value === "number" ? "currency" : "text"))}</div>
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

function renderTimedLoading(title, description) {
  const elapsed = state.loading.startedAt ? formatElapsed(Date.now() - state.loading.startedAt) : "00:00";
  return `
    <div class="panel slow-load stack">
      <div class="pill">Fetching ${title}</div>
      <div class="loading-time">${elapsed}</div>
      <div>${description}</div>
      <div class="muted">This module is lower priority for morning collections. It can take up to 1 minute on larger datasets.</div>
    </div>
  `;
}

function renderDashboard() {
  if (!state.dashboard) return `<div class="panel">Loading...</div>`;
  return `
    <div class="grid">
      ${renderCards(state.dashboard.cards.map(card => ({
        label: card.label,
        value: card.value,
        kind: card.label.includes("Students") ? "number" : "currency"
      })))}
      <div class="panel">
        <h3>Recent Receipts</h3>
        ${renderTable(
          ["Receipt No", "Date", "Student", "Mode", "Amount", "Status"],
          state.dashboard.recentReceipts.map(item => [
            item["Receipt Number"],
            item["Receipt Date"],
            item["Student Name"],
            item["Payment Mode"],
            formatCurrency(item["Amount"]),
            item["Status"]
          ])
        )}
      </div>
    </div>
  `;
}

function renderStudents() {
  const ledger = state.ledger;
  const classes = safe(state, "bootstrap.classes", []);
  const feeHeads = safe(state, "bootstrap.feeHeads", []);
  const reassignStudent = state.reassignDraft
    ? state.students.find(item => item.studentId === state.reassignDraft.studentId)
    : null;
  return `
    <div class="split">
      <div class="panel">
        <h3>Add Student</h3>
        <div class="form-grid">
          <label>Student Name<input id="student-name" /></label>
          <label>Class
            <select id="student-class">
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
          <label>Joined Date<input id="student-joined" type="date" value="${new Date().toISOString().slice(0, 10)}" /></label>
        </div>
        <div class="stack">
          <h3>Fee Head Assignment</h3>
          ${feeHeads.length ? `
            <div class="form-grid">
              ${feeHeads.map(item => `
                <label>${item.headName}<input class="student-fee-head" data-head="${item.headName}" type="number" min="0" value="0" /></label>
              `).join("")}
            </div>
          ` : `<div class="muted">Create fee heads first in Setup.</div>`}
        </div>
        <button class="primary" onclick="handleAddStudent()">Save Student</button>
      </div>
      <div class="panel">
        <h3>Fees Table</h3>
        ${renderTable(
          ["Class", "Student", "Mobile", "Fee Heads", "Assigned", "Paid", "Overall Due", "Due Today", "Status", "Actions"],
          state.students.map(item => [
            item.className,
            item.studentName,
            item.mobileNumber,
            item.feeHeadSummary || "-",
            formatCurrency(item.totalAssigned),
            formatCurrency(item.totalPaid),
            formatCurrency(item.overallDue),
            formatCurrency(item.dueAsOfToday),
            item.status,
            `<div class="actions-row">
              <button class="secondary" onclick="handleOpenLedger('${item.studentId}')">Ledger</button>
              <button class="secondary" onclick="handleToggleStudentStatus('${item.studentId}','${item.status}')">${item.status === "Active" ? "Inactivate" : "Reactivate"}</button>
              <button class="secondary" onclick="handleStartReassign('${item.studentId}')">Reassign</button>
            </div>`
          ])
        )}
        ${reassignStudent ? `
          <div class="detail-panel stack">
            <h3>Reassign Fee Head</h3>
            <div class="muted">${reassignStudent.studentName} · ${reassignStudent.className}</div>
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
    </div>
  `;
}

function renderLedgerPanel(ledger) {
  const student = ledger.student;
  return `
    <div class="detail-panel stack">
      <h3>Ledger: ${student["Student Name"]}</h3>
      <div class="pill mono">${student["Student ID"]}</div>
      ${renderTable(
        ["Head", "Due Date", "Assigned", "Paid", "Remaining", "Status"],
        ledger.instalments.map(item => [
          item["Fee Head"],
          item["Due Date"],
          formatCurrency(item["Assigned Amount"]),
          formatCurrency(item["Paid Amount"]),
          formatCurrency(item["Remaining Amount"]),
          item["Status"]
        ])
      )}
      ${renderTable(
        ["Receipt No", "Date", "Amount", "Mode", "Status"],
        ledger.receipts.map(item => [
          item["Receipt Number"],
          item["Receipt Date"],
          formatCurrency(item["Amount"]),
          item["Payment Mode"],
          item["Status"]
        ])
      )}
    </div>
  `;
}

function renderCollectFees() {
  const activeStudents = state.students.filter(item => item.status === "Active");
  if (!activeStudents.length) {
    return `
      <div class="panel stack">
        <h3>Collect Fees</h3>
        <div class="muted">No active students are available. Add or reactivate a student first.</div>
      </div>
    `;
  }
  return `
    <div class="panel stack">
      <h3>Collect Fees</h3>
      <div class="form-grid">
        <label>Student
          <select id="collect-student">
            ${activeStudents.map(item => `<option value="${item.studentId}">${item.studentName} - ${item.className} - ${item.mobileNumber}</option>`).join("")}
          </select>
        </label>
        <label>Payment Date<input id="collect-date" type="date" value="${new Date().toISOString().slice(0, 10)}" /></label>
        <label>Amount<input id="collect-amount" type="number" min="1" /></label>
        <label>Mode
          <select id="collect-mode" onchange="toggleModeFields()">
            <option value="Cash">Cash</option>
            <option value="UPI">UPI</option>
          </select>
        </label>
        <label id="upi-ref-wrap">UPI Ref<input id="collect-upi-ref" /></label>
        <label id="upi-in-wrap">UPI Received In<input id="collect-upi-in" placeholder="School account or Partner name" /></label>
      </div>
      <button class="primary" onclick="handleCollectFees()">Create Receipt</button>
      <div class="muted">Default allocation uses oldest unpaid instalments first. Manual allocation is supported by the backend payload, and can be extended in this UI later.</div>
    </div>
  `;
}

function renderReceipts() {
  const detail = state.selectedReceipt;
  return `
    <div class="panel stack">
      <h3>Receipts</h3>
      <div class="inline-form">
        <input id="receipt-filter-student" placeholder="Student name" />
        <select id="receipt-filter-mode">
          <option value="">All Modes</option>
          <option value="Cash">Cash</option>
          <option value="UPI">UPI</option>
        </select>
        <select id="receipt-filter-status">
          <option value="">All Statuses</option>
          <option value="Valid">Valid</option>
          <option value="Cancelled">Cancelled</option>
        </select>
        <button class="secondary" onclick="handleFilterReceipts()">Filter</button>
      </div>
      ${renderTable(
        ["Receipt No", "Date", "Student", "Mode", "Amount", "Status", "Action"],
        state.receipts.map(item => [
          item["Receipt Number"],
          item["Receipt Date"],
          item["Student Name"],
          item["Payment Mode"],
          formatCurrency(item["Amount"]),
          item["Status"],
          `<div class="actions-row">
            <button class="secondary" onclick="handleOpenReceipt('${item["Receipt ID"]}')">View</button>
            <button class="secondary" onclick="handlePrintReceipt('${item["Receipt ID"]}')">Print</button>
            ${item["Status"] === "Valid" ? `<button class="danger" onclick="handleCancelReceipt('${item["Receipt ID"]}')">Cancel</button>` : ""}
          </div>`
        ])
      )}
      ${detail ? renderReceiptPanel(detail) : ""}
    </div>
  `;
}

function renderReceiptPanel(detail) {
  return `
    <div class="detail-panel stack">
      <h3>Receipt Detail</h3>
      <div class="pill mono">${detail.receipt["Receipt Number"]}</div>
      ${renderTable(
        ["Field", "Value"],
        [
          ["Student", detail.receipt["Student Name"]],
          ["Date", detail.receipt["Receipt Date"]],
          ["Amount", formatCurrency(detail.receipt["Amount"])],
          ["Mode", detail.receipt["Payment Mode"]],
          ["UPI Ref", detail.receipt["UPI Reference"]],
          ["Status", detail.receipt["Status"]],
          ["Due On Receipt Date", formatCurrency(detail.receipt["Due As Of Receipt Date"])],
          ["Overall Remaining", formatCurrency(detail.receipt["Overall Remaining Balance"])]
        ]
      )}
      ${renderTable(
        ["Fee Head", "Allocated Amount", "Status"],
        detail.allocations.map(item => [
          item["Fee Head"],
          formatCurrency(item["Allocated Amount"]),
          item["Status"]
        ])
      )}
    </div>
  `;
}

function renderDueReport() {
  return `
    <div class="panel">
      <h3>Due Report</h3>
      <div class="inline-form">
        <input id="due-date" type="date" value="${new Date().toISOString().slice(0, 10)}" />
        <select id="due-active-only">
          <option value="true">Active Only</option>
          <option value="false">All Students</option>
        </select>
        <input id="due-min" type="number" min="0" placeholder="Min Due" />
        <input id="due-max" type="number" min="0" placeholder="Max Due" />
        <button class="secondary" onclick="handleFilterDueReport()">Filter</button>
      </div>
      ${renderTable(
        ["Class", "Student", "Mobile", "Assigned", "Paid", "Overall Due", "Payable", "Due"],
        state.dueReport.map(item => [
          item.className,
          item.studentName,
          item.mobile,
          formatCurrency(item.totalAssigned),
          formatCurrency(item.totalPaid),
          formatCurrency(item.overallDue),
          formatCurrency(item.payableAsOfSelectedDate),
          formatCurrency(item.dueAsOfSelectedDate)
        ])
      )}
    </div>
  `;
}

function renderExpenses() {
  const categories = safe(state, "bootstrap.categories", []);
  const role = safe(state, "bootstrap.role", "");
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
          <label>Paid By<input id="expense-paid-by" placeholder="School Cash / School Bank / Partner" /></label>
          <label>Reference<input id="expense-ref" /></label>
          <label>Description / Remarks<textarea id="expense-remarks"></textarea></label>
        </div>
        <button class="primary" onclick="handleAddExpense()">Save Expense</button>
      </div>
      <div class="panel">
        <h3>Expense Register</h3>
        <div class="inline-form">
          <select id="expense-filter-status">
            <option value="">All Statuses</option>
            <option value="Paid">Paid</option>
            <option value="Expected">Expected</option>
            <option value="Archived">Archived</option>
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
      </div>
    </div>
  `;
}

function renderHandover() {
  const cashReceipts = state.receipts.filter(item => item["Payment Mode"] === "Cash" && item["Status"] === "Valid");
  const recipients = ["School"].concat(safe(state, "bootstrap.partners", []).map(item => item["Partner Name"]));
  if (!cashReceipts.length) {
    return `
      <div class="panel stack">
        <h3>Cash Handover</h3>
        <div class="muted">No active cash receipts are available for handover.</div>
      </div>
    `;
  }
  return `
    <div class="panel stack">
      <h3>Cash Handover</h3>
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
    </div>
  `;
}

function renderAnalytics() {
  if (state.loading.active && state.loading.view === "analytics") {
    return renderTimedLoading("analytics", "Calculating academic-year fee metrics.");
  }
  if (!state.analytics) return `<div class="panel">Loading...</div>`;
  const feeHeadBreakdown = Array.isArray(state.analytics.feeHeadBreakdown) ? state.analytics.feeHeadBreakdown : [];
  const metricEntries = Object.entries(state.analytics).filter(([key]) => key !== "feeHeadBreakdown");
  return `
    <div class="grid">
      <div class="panel">
        <div class="inline-form">
          <input id="analytics-date" type="date" value="${new Date().toISOString().slice(0, 10)}" />
          <select id="analytics-mode">
            <option value="">All Modes</option>
            <option value="Cash">Cash</option>
            <option value="UPI">UPI</option>
          </select>
          <input id="analytics-student" placeholder="Student name" />
          <button class="secondary" onclick="handleFilterAnalytics()">Filter</button>
        </div>
      </div>
      ${renderCards([
        { label: "Active Students", value: state.analytics.activeStudents, kind: "number" },
        { label: "Total Fees Assigned", value: state.analytics.totalFeesAssigned, kind: "currency" },
        { label: "Total Collected", value: state.analytics.totalFeesCollected, kind: "currency" },
        { label: "Due As Of Date", value: state.analytics.feesDueAsOfDate, kind: "currency" }
      ])}
      <div class="panel">
        ${renderTable(
          ["Metric", "Value"],
          metricEntries.map(([key, value]) => [
            key,
            key === "activeStudents"
              ? formatValue(value, "number")
              : key === "duePercentage"
                ? `${Number(value || 0).toFixed(2)}%`
                : typeof value === "number"
                  ? formatCurrency(value)
                  : value
          ])
        )}
      </div>
      ${feeHeadBreakdown.length ? `
        <div class="panel">
          <h3>Fee Head Breakdown</h3>
          ${renderTable(
            ["Fee Head", "Assigned", "Payable", "Collected", "Due"],
            feeHeadBreakdown.map(item => [
              item.feeHead,
              formatCurrency(item.assigned),
              formatCurrency(item.payableAsOfDate),
              formatCurrency(item.collected),
              formatCurrency(item.dueAsOfDate)
            ])
          )}
        </div>
      ` : ""}
    </div>
  `;
}

function renderFinances() {
  if (state.loading.active && state.loading.view === "finances") {
    return renderTimedLoading("finances", "Preparing projected income, expenses, and current position.");
  }
  return `
    <div class="panel">
      <h3>Finances</h3>
      ${renderTable(
        ["Metric", "Value"],
        Object.entries(state.finances || {}).map(([key, value]) => [key, typeof value === "number" ? formatCurrency(value) : value])
      )}
    </div>
  `;
}

function renderPartners() {
  if (state.loading.active && state.loading.view === "partners") {
    return renderTimedLoading("partner accounts", "Compiling partner collections, expenses, and contribution balances.");
  }
  return `
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
  `;
}

function renderLogs() {
  if (state.loading.active && state.loading.view === "logs") {
    return renderTimedLoading("logs", "Loading the full audit trail and action history.");
  }
  return `
    <div class="panel">
      <h3>Logs</h3>
      <div class="inline-form">
        <input id="logs-login-id" placeholder="Login ID" />
        <input id="logs-action" placeholder="Action" />
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
    </div>
  `;
}

function renderSetup() {
  const partners = safe(state, "bootstrap.partners", []);
  const categories = safe(state, "bootstrap.categories", []);
  const feeHeads = safe(state, "bootstrap.feeHeads", []);
  const schoolName = safe(state, "bootstrap.schoolName", "");
  const academicYear = safe(state, "bootstrap.academicYear", "");
  const partnerOptions = partners.map(item => `<div class="pill">${item["Partner Name"]} - ${item["Share Percentage"]}%</div>`).join("");
  const categoryOptions = categories.map(item => `<div class="pill">${item["Category Name"]}</div>`).join("");
  const feeHeadOptions = feeHeads.map(item => `<div class="pill">${item.headName}</div>`).join("");
  const partnerLines = partners.map(item => `${item["Partner Name"]},${item["Share Percentage"]}`).join("\n");
  const canSchedule = feeHeads.length > 0;
  return `
    <div class="grid">
      <div class="panel stack">
        <h3>Basic Settings</h3>
        <label>School Name<input id="setup-school-name" value="${schoolName}" /></label>
        <label>Academic Year<input id="setup-year" value="${academicYear}" /></label>
        <button class="primary" onclick="handleSaveSettings()">Save Settings</button>
      </div>
      <div class="panel stack">
        <h3>Add Class</h3>
        <div class="form-grid">
          <label>Class Name<input id="setup-class-name" /></label>
        </div>
        <button class="primary" onclick="handleSaveClass()">Add Class</button>
      </div>
      <div class="panel stack">
        <h3>Add Fee Head</h3>
        <label>Fee Head Name<input id="setup-fee-head-name" placeholder="Tuition / Books / Van / Exam Fee" /></label>
        <button class="primary" onclick="handleSaveFeeHead()">Add Fee Head</button>
        <div>${feeHeadOptions || '<span class="muted">No fee heads yet</span>'}</div>
      </div>
      <div class="panel stack">
        <h3>Add Schedule Date</h3>
        ${canSchedule ? `
          <div class="form-grid">
            <label>Fee Head
              <select id="setup-schedule-head">
                ${feeHeads.map(item => `<option>${item.headName}</option>`).join("")}
              </select>
            </label>
            <label>Due Date<input id="setup-schedule-date" type="date" /></label>
            <label>No. of Instalments<input id="setup-schedule-count" type="number" min="1" max="24" value="1" /></label>
          </div>
          <div class="muted">If you enter more than 1 instalment, monthly due dates will be created starting from the selected date.</div>
          <button class="primary" onclick="handleSaveSchedule()">Add Schedule</button>
        ` : `<div class="muted">Create at least one fee head first, then add schedule dates for it.</div>`}
      </div>
      <div class="panel stack">
        <h3>Add Expense Category</h3>
        <label>Category Name<input id="setup-category-name" /></label>
        <button class="primary" onclick="handleSaveCategory()">Add Category</button>
        <div>${categoryOptions || '<span class="muted">No categories yet</span>'}</div>
      </div>
      <div class="panel stack">
        <h3>Partner Share Set</h3>
        <label>Partners and shares
          <textarea id="setup-partner-lines" placeholder="Partner A,60&#10;Partner B,40">${partnerLines}</textarea>
        </label>
        <button class="primary" onclick="handleSavePartner()">Save Partner Set</button>
        <div class="muted">Partner shares must total exactly 100% in each save request.</div>
        <div>${partnerOptions || '<span class="muted">No partners yet</span>'}</div>
      </div>
    </div>
  `;
}

function renderMain() {
  const schoolName = safe(state, "bootstrap.schoolName", "School Fee Management");
  const academicYear = safe(state, "bootstrap.academicYear", "");
  const userId = safe(state, "bootstrap.userId", "");
  const role = safe(state, "bootstrap.role", "");
  const contentMap = {
    dashboard: renderDashboard,
    students: renderStudents,
    collect: renderCollectFees,
    receipts: renderReceipts,
    "due-report": renderDueReport,
    expenses: renderExpenses,
    handover: renderHandover,
    analytics: renderAnalytics,
    finances: renderFinances,
    partners: renderPartners,
    logs: renderLogs,
    setup: renderSetup
  };
  const activeRenderer = contentMap[state.view] || renderDashboard;
  return `
    <div class="shell">
      <aside class="sidebar">
        <div class="sidebar-top">
          <div class="eyebrow">Academic Operations</div>
          <div class="brand">${schoolName}</div>
          <div class="subtle">${academicYear}</div>
          <div class="user-chip">${userId} · ${role}</div>
        </div>
        <div class="menu">
          ${visibleMenu().map(([key, label]) => `<button class="${state.view === key ? "active" : ""}" onclick="switchView('${key}')">${label}</button>`).join("")}
        </div>
      </aside>
      <main class="content">
        <div class="toolbar">
          <div class="toolbar-copy">
            <div class="eyebrow">Live Overview</div>
            <div class="brand">School Fee Management</div>
            <div class="muted">Counter-first fee operations with reports separated from daily rush work.</div>
          </div>
          <div class="actions">
            <button class="secondary" onclick="handleChangePassword()">Change Password</button>
            <button class="secondary" onclick="exportCurrentView()">Download CSV</button>
            <button class="danger" onclick="handleLogout()">Logout</button>
          </div>
        </div>
        ${state.message ? `<div class="success">${state.message}</div>` : ""}
        ${state.error ? `<div class="error">${state.error}</div>` : ""}
        ${activeRenderer()}
      </main>
    </div>
  `;
}

function render() {
  qs("#app").innerHTML = state.token && state.bootstrap ? renderMain() : renderLogin();
  bindStudentClassFee();
  toggleModeFields();
}

function bindStudentClassFee() {
  return;
}

async function handleLogin() {
  try {
    const apiUrl = getApiUrl();
    localStorage.setItem("feeApiUrl", apiUrl);
    const result = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "login",
        payload: {
          userId: qs("#login-user").value,
          password: qs("#login-password").value
        }
      })
    }).then(res => res.json());
    if (!result.success) throw new Error(result.error);
    state.token = result.data.token;
    localStorage.setItem("feeToken", state.token);
    markStale(["dashboard", "students", "receipts", "expenses", "dueReport", "analytics", "finances", "partners", "logs", "setup"]);
    setBootstrap({
      schoolName: result.data.schoolName,
      academicYear: result.data.academicYear,
      role: result.data.role,
      userId: result.data.userId
    });
    await loadViewData("dashboard");
    setMessage("Login successful");
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

async function switchView(view) {
  try {
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
    const feeAssignments = Array.from(document.querySelectorAll(".student-fee-head"))
      .map(input => ({
        head: input.dataset.head,
        amount: Number(input.value || 0)
      }))
      .filter(item => item.amount > 0);
    await api("addStudent", {
      studentName: qs("#student-name").value.trim(),
      classId: qs("#student-class").value,
      mobileNumber: qs("#student-mobile").value.trim(),
      feeAssignments,
      status: qs("#student-status").value,
      joinedDate: qs("#student-joined").value
    });
    state.students = await api("listStudents");
    markFresh(["students"]);
    markStale(["dashboard", "dueReport", "analytics", "finances", "setup"]);
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
    setMessage("Student status updated");
  } catch (error) {
    setMessage(error.message, true);
  }
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
    setMessage("Fee reassigned");
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function handleCollectFees() {
  try {
    const payload = {
      studentId: qs("#collect-student").value,
      paymentDate: qs("#collect-date").value,
      amount: Number(qs("#collect-amount").value),
      paymentMode: qs("#collect-mode").value,
      upiReference: qs("#collect-upi-ref")?.value || "",
      upiReceivedIn: qs("#collect-upi-in")?.value || ""
    };
    const result = await api("collectFees", payload);
    state.receipts = await api("listReceipts");
    state.students = await api("listStudents");
    markFresh(["receipts", "students"]);
    markStale(["dashboard", "dueReport", "analytics", "finances", "partners", "logs"]);
    setMessage(`Receipt created: ${result.receiptNumber}`);
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function handleCancelReceipt(receiptId) {
  const reason = prompt("Cancellation reason");
  if (!reason) return;
  try {
    await api("cancelReceipt", { receiptId, reason });
    state.receipts = await api("listReceipts");
    markFresh(["receipts"]);
    markStale(["dashboard", "students", "dueReport", "analytics", "finances", "partners", "logs"]);
    if (state.selectedReceipt && state.selectedReceipt.receipt["Receipt ID"] === receiptId) {
      state.selectedReceipt = await api("getReceipt", { receiptId });
    }
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

async function handlePrintReceipt(receiptId) {
  try {
    const detail = await api("getReceipt", { receiptId });
    const allocationsHtml = detail.allocations.map(item => `<tr><td>${item["Fee Head"]}</td><td>${formatCurrency(item["Allocated Amount"])}</td></tr>`).join("");
    const receiptBlock = (copyLabel) => `
      <div style="height:48%;border:1px solid #444;padding:16px;margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <h2 style="margin:0">${state.bootstrap.schoolName}</h2>
          <strong>${copyLabel}</strong>
        </div>
        <p>Academic Year: ${state.bootstrap.academicYear}</p>
        <p>Receipt No: ${detail.receipt["Receipt Number"]}</p>
        <p>Date: ${detail.receipt["Receipt Date"]}</p>
        <p>Student: ${detail.receipt["Student Name"]} (${detail.receipt["Class Name"]})</p>
        <p>Mobile: ${detail.receipt["Mobile Number"]}</p>
        <p>Mode: ${detail.receipt["Payment Mode"]}${detail.receipt["UPI Reference"] ? ` | UPI Ref: ${detail.receipt["UPI Reference"]}` : ""}</p>
        <table border="1" cellspacing="0" cellpadding="8" width="100%"><tr><th>Head</th><th>Amount</th></tr>${allocationsHtml}</table>
        <p>Total: ${formatCurrency(detail.receipt["Amount"])}</p>
        <p>Due as of receipt date: ${formatCurrency(detail.receipt["Due As Of Receipt Date"])}</p>
        <p>Overall remaining: ${formatCurrency(detail.receipt["Overall Remaining Balance"])}</p>
        <p>Collected by: ${detail.receipt["Collected By"]}</p>
        <div style="margin-top:24px">Authorised Signature: __________________</div>
      </div>`;
    const html = `
      <html><head><title>${detail.receipt["Receipt Number"]}</title></head>
      <body style="font-family:Arial;padding:18px">${receiptBlock("Parent Copy")}${receiptBlock("Office Copy")}</body></html>`;
    const win = window.open("", "_blank");
    win.document.write(html);
    win.document.close();
    win.print();
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function handleAddExpense() {
  try {
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
    setMessage("Expense saved");
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function handleArchiveExpense(expenseId) {
  const reason = prompt("Archive reason");
  if (!reason) return;
  try {
    await api("archiveExpense", { expenseId, reason });
    state.expenses = await api("listExpenses");
    markFresh(["expenses"]);
    markStale(["finances", "partners", "logs"]);
    setMessage("Expense archived");
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function handleCreateHandover() {
  try {
    await api("createCashHandover", {
      recipient: qs("#handover-recipient").value.trim(),
      handoverDate: qs("#handover-date").value,
      remarks: qs("#handover-remarks").value.trim(),
      allocations: [{
        receiptId: qs("#handover-receipt").value,
        amount: Number(qs("#handover-amount").value)
      }]
    });
    state.receipts = await api("listReceipts");
    markFresh(["receipts"]);
    markStale(["partners", "logs"]);
    setMessage("Cash handover saved");
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function handleSaveSettings() {
  try {
    await api("saveBasicSettings", { schoolName: qs("#setup-school-name").value.trim() });
    await api("setAcademicYear", { academicYear: qs("#setup-year").value.trim() });
    setBootstrap(await api("getBootstrap"));
    markFresh(["setup"]);
    markStale(["dashboard", "students", "receipts", "expenses", "dueReport", "analytics", "finances", "partners", "logs"]);
    setMessage("Settings updated");
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function handleSaveClass() {
  try {
    await api("saveClassSetup", {
      classes: [{
        className: qs("#setup-class-name").value.trim()
      }]
    });
    setBootstrap(await api("getBootstrap"));
    markFresh(["setup"]);
    markStale(["students", "dashboard"]);
    setMessage("Class added");
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function handleSaveFeeHead() {
  try {
    await api("saveFeeHeads", {
      heads: [qs("#setup-fee-head-name").value.trim()]
    });
    setBootstrap(await api("getBootstrap"));
    markFresh(["setup"]);
    markStale(["students", "dueReport", "dashboard"]);
    setMessage("Fee head added");
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function handleSaveSchedule() {
  try {
    await api("saveSchedules", {
      schedules: [{
        feeHead: qs("#setup-schedule-head").value,
        dueDate: qs("#setup-schedule-date").value,
        instalmentCount: Number(qs("#setup-schedule-count").value || 1)
      }]
    });
    setBootstrap(await api("getBootstrap"));
    markFresh(["setup"]);
    markStale(["students", "dueReport", "dashboard"]);
    setMessage("Schedule added");
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function handleSaveCategory() {
  try {
    await api("saveExpenseCategories", {
      categories: [qs("#setup-category-name").value.trim()]
    });
    setBootstrap(await api("getBootstrap"));
    markFresh(["setup"]);
    setMessage("Category added");
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function handleSavePartner() {
  try {
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
    setMessage("Partner set saved");
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function handleFilterReceipts() {
  try {
    state.receipts = await api("listReceipts", {
      studentName: qs("#receipt-filter-student").value.trim(),
      paymentMode: qs("#receipt-filter-mode").value,
      status: qs("#receipt-filter-status").value
    });
    setMessage("Receipts filtered");
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function handleFilterExpenses() {
  try {
    state.expenses = await api("listExpenses", {
      status: qs("#expense-filter-status").value
    });
    setMessage("Expenses filtered");
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function handleFilterDueReport() {
  try {
    state.dueReport = await api("getDueReport", {
      asOnDate: qs("#due-date").value,
      activeOnly: qs("#due-active-only").value === "true",
      minimumDueAmount: qs("#due-min").value,
      maximumDueAmount: qs("#due-max").value
    });
    setMessage("Due report filtered");
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function handleFilterAnalytics() {
  try {
    state.analytics = await api("getAnalytics", {
      asOfDate: qs("#analytics-date").value,
      paymentMode: qs("#analytics-mode").value,
      studentName: qs("#analytics-student").value.trim()
    });
    setMessage("Analytics filtered");
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function handleFilterLogs() {
  try {
    state.logs = await api("listLogs", {
      loginId: qs("#logs-login-id").value.trim(),
      actionName: qs("#logs-action").value.trim()
    });
    setMessage("Logs filtered");
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
    await api("changePassword", { currentPassword, newPassword });
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
  if (state.view === "partners") rows = state.partners;
  if (state.view === "partners") headers = ["partnerName", "sharePercentage", "shortfallResponsibility", "projectedProfitShare", "expensesDonePersonally", "feesCollectionsReceived", "netContribution", "amountStillRequired", "excessContribution"];
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
  const csv = [headers.join(",")].concat(rows.map(row => headers.map(key => JSON.stringify(safeCell(row[key]))).join(","))).join("\n");
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


