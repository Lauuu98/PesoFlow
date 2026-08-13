"use strict";

const STORAGE_KEY = "pesoflow-budget-v1";

// Firebase init (Storage upload)
const firebaseConfig = {
  apiKey: "AIzaSyANDEywloYk6rOa1yd6e-3o3EC5HWsI1DY",
  authDomain: "pesoflow-b2b90.firebaseapp.com",
  projectId: "pesoflow-b2b90",
  storageBucket: "pesoflow-b2b90.firebasestorage.app",
  messagingSenderId: "107782830363",
  appId: "1:107782830363:web:7cb3f69a16f393e4fdbbbe",
  measurementId: "G-ZPSEKLDCHP"
};

firebase.initializeApp(firebaseConfig);
const firebaseStorage = firebase.storage();
const DATA_VERSION = 1;
const SOURCE_COLORS = ["#0e6b4d", "#d39a29", "#c55840", "#4d6c8c", "#765b8f", "#4b806f", "#b45f86", "#8b6b32"];
const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

const $ = (selector) => document.querySelector(selector);
const elements = {
  totalFunds: $("#total-funds"), totalIncome: $("#total-income"), totalExpenses: $("#total-expenses"), sourceCount: $("#source-count"),
  sourcesList: $("#sources-list"), transactionsList: $("#transactions-list"), sourceFilter: $("#source-filter"), typeFilter: $("#type-filter"),
  sourceDialog: $("#source-dialog"), sourceForm: $("#source-form"), sourceId: $("#source-id"), sourceName: $("#source-name"), sourceBalance: $("#source-balance"),
  transactionDialog: $("#transaction-dialog"), transactionForm: $("#transaction-form"), transactionId: $("#transaction-id"), transactionSource: $("#transaction-source"), transactionAmount: $("#transaction-amount"), transactionDate: $("#transaction-date"), transactionNote: $("#transaction-note"), balancePreview: $("#balance-preview"),
  reassignDialog: $("#reassign-dialog"), reassignForm: $("#reassign-form"), deleteSourceId: $("#delete-source-id"), reassignTarget: $("#reassign-target"), reassignMessage: $("#reassign-message"),
  importFile: $("#import-file"), toast: $("#toast"), analyticsNet: $("#analytics-net"), analyticsNetNote: $("#analytics-net-note"), analyticsTopSource: $("#analytics-top-source"), analyticsTopNote: $("#analytics-top-note"), monthlyChart: $("#monthly-chart"), sourceBreakdown: $("#source-breakdown")
};

let state = loadState();
let toastTimer;
normalizeSourceColors();
saveState();

function defaultState() { return { version: DATA_VERSION, sources: [], transactions: [] }; }
function makeId(prefix) { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; }
function today() { return new Date().toISOString().slice(0, 10); }
function isValidDateString(value) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00`).getTime()); }
function sourceColor(source) {
  if (source && SOURCE_COLORS.includes(source.color)) return source.color;
  let hash = 0; const value = source?.id || "";
  for (let index = 0; index < value.length; index += 1) hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  return SOURCE_COLORS[Math.abs(hash) % SOURCE_COLORS.length];
}
function normalizeSourceColors() {
  const used = new Set();
  state.sources.forEach((source, index) => {
    if (!SOURCE_COLORS.includes(source.color) || used.has(source.color)) source.color = SOURCE_COLORS.find((color) => !used.has(color)) || SOURCE_COLORS[index % SOURCE_COLORS.length];
    used.add(source.color);
  });
}
function colorTint(hex, alpha = 0.1) {
  const number = Number.parseInt(hex.slice(1), 16); return `rgba(${number >> 16},${(number >> 8) & 255},${number & 255},${alpha})`;
}
function escapeHtml(value = "") { const div = document.createElement("div"); div.textContent = value; return div.innerHTML; }
function loadState() {
  try { const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)); return validateData(saved) ? saved : defaultState(); }
  catch { return defaultState(); }
}
function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function sourceBalance(sourceId, ignoredTransactionId = null) {
  const source = state.sources.find((item) => item.id === sourceId);
  if (!source) return 0;
  return state.transactions.reduce((balance, transaction) => transaction.sourceId === sourceId && transaction.id !== ignoredTransactionId ? balance + (transaction.type === "income" ? transaction.amount : -transaction.amount) : balance, source.openingBalance);
}
function showToast(message, isError = false) {
  clearTimeout(toastTimer); elements.toast.textContent = message; elements.toast.className = `toast show${isError ? " error-toast" : ""}`;
  toastTimer = setTimeout(() => { elements.toast.className = "toast"; }, 2800);
}
function formatDate(date) { return new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${date}T00:00:00`)); }

function render() {
  const totalIncome = state.transactions.filter((t) => t.type === "income").reduce((sum, t) => sum + t.amount, 0);
  const totalExpenses = state.transactions.filter((t) => t.type === "expense").reduce((sum, t) => sum + t.amount, 0);
  const totalFunds = state.sources.reduce((sum, source) => sum + sourceBalance(source.id), 0);
  elements.totalFunds.textContent = peso.format(totalFunds); elements.totalIncome.textContent = peso.format(totalIncome); elements.totalExpenses.textContent = peso.format(totalExpenses);
  elements.sourceCount.textContent = `Across ${state.sources.length} account${state.sources.length === 1 ? "" : "s"}`;
  renderSourceOptions(); renderSources(); renderTransactions(); renderAnalytics();
}

function renderSourceOptions() {
  const selectedFilter = elements.sourceFilter.value || "all";
  const options = state.sources.map((source) => `<option value="${source.id}">${escapeHtml(source.name)}</option>`).join("");
  elements.sourceFilter.innerHTML = `<option value="all">All accounts</option>${options}`;
  elements.sourceFilter.value = state.sources.some((source) => source.id === selectedFilter) ? selectedFilter : "all";
  const transactionSelection = elements.transactionSource.value;
  elements.transactionSource.innerHTML = state.sources.length ? `<option value="">Choose an account</option>${options}` : `<option value="">No accounts yet</option>`;
  if (state.sources.some((source) => source.id === transactionSelection)) elements.transactionSource.value = transactionSelection;
}

function renderSources() {
  if (!state.sources.length) {
    elements.sourcesList.innerHTML = `<div class="empty-state"><strong>Add your first account</strong><p>Start with cash, a bank account, or an e-wallet.</p><button class="btn btn-small btn-primary" data-action="add-source">Add account</button></div>`; return;
  }
  elements.sourcesList.innerHTML = state.sources.map((source) => { const color = sourceColor(source); return `<article class="source-card" style="--source-color:${color};--source-tint:${colorTint(color)}">
    <div class="source-top"><span class="source-dot" style="background:${color}"></span><div class="source-info"><div class="source-name">${escapeHtml(source.name)}</div><div class="source-opening">Opened with ${peso.format(source.openingBalance)}</div></div>
    <div class="source-actions"><button class="icon-btn" data-action="edit-source" data-id="${source.id}" aria-label="Edit ${escapeHtml(source.name)}">✎</button><button class="icon-btn" data-action="delete-source" data-id="${source.id}" aria-label="Delete ${escapeHtml(source.name)}">×</button></div></div>
    <strong class="source-balance">${peso.format(sourceBalance(source.id))}</strong></article>`; }).join("");
}

function renderTransactions() {
  const type = elements.typeFilter.value; const sourceId = elements.sourceFilter.value;
  const transactions = [...state.transactions].filter((t) => (type === "all" || t.type === type) && (sourceId === "all" || t.sourceId === sourceId)).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  if (!transactions.length) {
    const filtered = state.transactions.length > 0;
    elements.transactionsList.innerHTML = `<div class="empty-state"><strong>${filtered ? "Nothing matches." : "A clean slate."}</strong><p>${filtered ? "Try changing your filters." : "Add money in or record your first expense."}</p>${!filtered ? `<button class="btn btn-small btn-primary" data-action="add-transaction">Add transaction</button>` : ""}</div>`; return;
  }
  elements.transactionsList.innerHTML = transactions.map((transaction) => {
    const source = state.sources.find((item) => item.id === transaction.sourceId);
    const label = transaction.note || (transaction.type === "income" ? "Money added" : "Expense");
    const color = source ? sourceColor(source) : "#69756f";
    return `<article class="transaction-row"><span class="transaction-mark ${transaction.type}">${transaction.type === "income" ? "+" : "−"}</span><div class="transaction-main"><div class="transaction-note">${escapeHtml(label)}</div><div class="transaction-meta"><span class="source-tag" style="color:${color};background:${colorTint(color)}"><i class="color-dot" style="background:${color}"></i>${escapeHtml(source?.name || "Unknown source")}</span> · ${formatDate(transaction.date)}</div></div><div class="transaction-amount ${transaction.type}">${transaction.type === "income" ? "+" : "−"}${peso.format(transaction.amount)}</div><div class="transaction-actions"><button class="icon-btn" data-action="edit-transaction" data-id="${transaction.id}" aria-label="Edit transaction">✎</button><button class="icon-btn" data-action="delete-transaction" data-id="${transaction.id}" aria-label="Delete transaction">×</button></div></article>`;
  }).join("");
}

function renderAnalytics() {
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, offset) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (5 - offset), 1);
    return { key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`, label: new Intl.DateTimeFormat("en-PH", { month: "short" }).format(date), income: 0, expense: 0 };
  });
  const monthMap = new Map(months.map((month) => [month.key, month]));
  const sourceExpenses = new Map(state.sources.map((source) => [source.id, 0]));
  state.transactions.forEach((transaction) => {
    const month = monthMap.get(transaction.date.slice(0, 7));
    if (month) month[transaction.type] += transaction.amount;
    if (month && transaction.type === "expense") sourceExpenses.set(transaction.sourceId, (sourceExpenses.get(transaction.sourceId) || 0) + transaction.amount);
  });
  const periodIncome = months.reduce((sum, month) => sum + month.income, 0); const periodExpenses = months.reduce((sum, month) => sum + month.expense, 0); const net = periodIncome - periodExpenses;
  elements.analyticsNet.textContent = `${net < 0 ? "−" : net > 0 ? "+" : ""}${peso.format(Math.abs(net))}`; elements.analyticsNet.style.color = net < 0 ? "var(--coral)" : net > 0 ? "var(--green)" : "var(--ink)";
  elements.analyticsNetNote.textContent = net > 0 ? "You brought in more than you spent" : net < 0 ? "You spent more than you brought in" : "Money in and out are balanced";
  const rankedSources = state.sources.map((source) => ({ source, amount: sourceExpenses.get(source.id) || 0 })).sort((a, b) => b.amount - a.amount); const top = rankedSources[0];
  elements.analyticsTopSource.textContent = top?.amount ? top.source.name : "—"; elements.analyticsTopSource.style.color = top?.amount ? sourceColor(top.source) : "var(--ink)"; elements.analyticsTopNote.textContent = top?.amount ? `${peso.format(top.amount)} spent in the last 6 months` : "No expenses recorded in this period";
  const chartMax = Math.max(1, ...months.flatMap((month) => [month.income, month.expense]));
  elements.monthlyChart.innerHTML = months.map((month) => `<div class="month-column"><div class="bar-area" title="${month.label}: ${peso.format(month.income)} in, ${peso.format(month.expense)} out"><span class="month-bar income" style="height:${Math.max(month.income ? 3 : 0, month.income / chartMax * 100)}%"></span><span class="month-bar expense" style="height:${Math.max(month.expense ? 3 : 0, month.expense / chartMax * 100)}%"></span></div><span class="month-label">${month.label}</span></div>`).join("");
  if (!periodExpenses) { elements.sourceBreakdown.innerHTML = `<div class="analytics-empty">Add an expense to see how spending is distributed across your sources.</div>`; return; }
  elements.sourceBreakdown.innerHTML = rankedSources.filter((item) => item.amount > 0).map(({ source, amount }) => { const color = sourceColor(source); return `<div class="breakdown-row"><div class="breakdown-name"><i class="color-dot" style="background:${color}"></i><span>${escapeHtml(source.name)}</span></div><div class="breakdown-track"><div class="breakdown-fill" style="width:${amount / periodExpenses * 100}%;background:${color}"></div></div><span class="breakdown-amount">${peso.format(amount)}</span></div>`; }).join("");
}

function clearErrors(form) { form.querySelectorAll(".error").forEach((el) => { el.textContent = ""; }); form.querySelectorAll(".invalid").forEach((el) => el.classList.remove("invalid")); }
function setError(input, message) { input.classList.add("invalid"); const error = $(`#${input.id}-error`); if (error) error.textContent = message; }
function openSourceDialog(source = null) {
  elements.sourceForm.reset(); clearErrors(elements.sourceForm); elements.sourceId.value = source?.id || ""; elements.sourceName.value = source?.name || ""; elements.sourceBalance.value = source?.openingBalance ?? "";
  $("#source-dialog-title").textContent = source ? "Edit account" : "Add an account"; elements.sourceDialog.showModal(); setTimeout(() => elements.sourceName.focus(), 0);
}
function openTransactionDialog(transaction = null, defaultType = "expense") {
  if (!state.sources.length) { showToast("Add a money source first.", true); openSourceDialog(); return; }
  elements.transactionForm.reset(); clearErrors(elements.transactionForm); renderSourceOptions(); elements.transactionId.value = transaction?.id || "";
  const type = transaction?.type || defaultType; elements.transactionForm.querySelector(`[name="transaction-type"][value="${type}"]`).checked = true;
  elements.transactionSource.value = transaction?.sourceId || ""; elements.transactionAmount.value = transaction?.amount ?? ""; elements.transactionDate.value = transaction?.date || today(); elements.transactionNote.value = transaction?.note || "";
  $("#transaction-dialog-title").textContent = transaction ? "Edit transaction" : "Add transaction"; updateBalancePreview(); elements.transactionDialog.showModal();
}
function closeDialog(button) { button.closest("dialog").close(); }

elements.sourceForm.addEventListener("submit", (event) => {
  event.preventDefault(); clearErrors(elements.sourceForm); const id = elements.sourceId.value; const name = elements.sourceName.value.trim(); const openingBalance = Number(elements.sourceBalance.value); let valid = true;
  if (!name) { setError(elements.sourceName, "Enter a source name."); valid = false; }
  else if (state.sources.some((source) => source.id !== id && source.name.toLowerCase() === name.toLowerCase())) { setError(elements.sourceName, "That source name already exists."); valid = false; }
  if (!Number.isFinite(openingBalance) || openingBalance < 0) { setError(elements.sourceBalance, "Enter zero or a positive amount."); valid = false; }
  if (valid && id) {
    const currentSource = state.sources.find((item) => item.id === id);
    const transactionEffect = sourceBalance(id) - currentSource.openingBalance;
    if (openingBalance + transactionEffect < 0) { setError(elements.sourceBalance, `At least ${peso.format(-transactionEffect)} is needed to cover existing expenses.`); valid = false; }
  }
  if (!valid) return;
  if (id) { const source = state.sources.find((item) => item.id === id); source.name = name; source.openingBalance = openingBalance; }
  else state.sources.push({ id: makeId("src"), name, openingBalance, color: SOURCE_COLORS.find((color) => !state.sources.some((source) => source.color === color)) || SOURCE_COLORS[state.sources.length % SOURCE_COLORS.length], createdAt: new Date().toISOString() });
  saveState(); render(); elements.sourceDialog.close(); showToast(id ? "Source updated." : "Source added.");
});

elements.transactionForm.addEventListener("submit", (event) => {
  event.preventDefault(); clearErrors(elements.transactionForm); const id = elements.transactionId.value; const type = elements.transactionForm.querySelector('[name="transaction-type"]:checked').value; const sourceId = elements.transactionSource.value; const amount = Number(elements.transactionAmount.value); const date = elements.transactionDate.value; let valid = true;
  if (!state.sources.some((source) => source.id === sourceId)) { setError(elements.transactionSource, "Choose a valid source."); valid = false; }
  if (!Number.isFinite(amount) || amount <= 0) { setError(elements.transactionAmount, "Enter an amount greater than zero."); valid = false; }
  if (!isValidDateString(date)) { setError(elements.transactionDate, "Choose a valid date."); valid = false; }
  if (valid && type === "expense" && amount > sourceBalance(sourceId, id || null)) { setError(elements.transactionAmount, `Only ${peso.format(sourceBalance(sourceId, id || null))} is available.`); valid = false; }
  if (valid && sourceBalance(sourceId, id || null) + (type === "income" ? amount : -amount) < 0) { setError(elements.transactionAmount, "This change would overdraw the selected source."); valid = false; }
  const previous = id ? state.transactions.find((transaction) => transaction.id === id) : null;
  if (valid && previous && previous.sourceId !== sourceId && sourceBalance(previous.sourceId, id) < 0) { setError(elements.transactionSource, "Moving this transaction would overdraw its original source."); valid = false; }
  if (!valid) return;
  const record = { id: id || makeId("txn"), type, sourceId, amount, date, note: elements.transactionNote.value.trim(), createdAt: id ? state.transactions.find((t) => t.id === id).createdAt : new Date().toISOString() };
  if (id) state.transactions[state.transactions.findIndex((t) => t.id === id)] = record; else state.transactions.push(record);
  saveState(); render(); elements.transactionDialog.close(); showToast(id ? "Transaction updated." : "Transaction saved.");
});

function updateBalancePreview() {
  const sourceId = elements.transactionSource.value; if (!sourceId) { elements.balancePreview.textContent = ""; return; }
  const balance = sourceBalance(sourceId, elements.transactionId.value || null); elements.balancePreview.textContent = `Available before this transaction: ${peso.format(balance)}`;
}
elements.transactionSource.addEventListener("change", updateBalancePreview);
elements.transactionForm.querySelectorAll('[name="transaction-type"]').forEach((radio) => radio.addEventListener("change", updateBalancePreview));

function requestSourceDelete(id) {
  const source = state.sources.find((item) => item.id === id); if (!source) return;
  const count = state.transactions.filter((transaction) => transaction.sourceId === id).length;
  if (!count) { if (confirm(`Delete “${source.name}”?`)) { state.sources = state.sources.filter((item) => item.id !== id); saveState(); render(); showToast("Source deleted."); } return; }
  const transferredEffect = state.transactions.filter((transaction) => transaction.sourceId === id).reduce((sum, transaction) => sum + (transaction.type === "income" ? transaction.amount : -transaction.amount), 0);
  const alternatives = state.sources.filter((item) => item.id !== id && sourceBalance(item.id) + transferredEffect >= 0);
  if (!alternatives.length) { showToast("No other source has enough funds for this history.", true); return; }
  elements.deleteSourceId.value = id; elements.reassignMessage.textContent = `${source.name} has ${count} transaction${count === 1 ? "" : "s"}. Choose a source with enough funds to take over its history.`;
  elements.reassignTarget.innerHTML = alternatives.map((item) => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join(""); elements.reassignDialog.showModal();
}
elements.reassignForm.addEventListener("submit", (event) => {
  event.preventDefault(); const sourceId = elements.deleteSourceId.value; const targetId = elements.reassignTarget.value; if (!state.sources.some((item) => item.id === targetId)) return;
  state.transactions.forEach((transaction) => { if (transaction.sourceId === sourceId) transaction.sourceId = targetId; }); state.sources = state.sources.filter((item) => item.id !== sourceId);
  saveState(); render(); elements.reassignDialog.close(); showToast("Transactions moved and source deleted.");
});

document.addEventListener("click", (event) => {
  const button = event.target.closest("button"); if (!button) return;
  if (button.classList.contains("close-dialog")) return closeDialog(button);
  const { action, id } = button.dataset;
  if (button.id === "add-source-btn" || button.id === "quick-source-btn" || action === "add-source") openSourceDialog();
  else if (button.id === "add-transaction-btn" || action === "add-transaction") openTransactionDialog(null, "income");
  else if (button.id === "quick-expense-btn") openTransactionDialog(null, "expense");
  else if (action === "edit-source") openSourceDialog(state.sources.find((source) => source.id === id));
  else if (action === "delete-source") requestSourceDelete(id);
  else if (action === "edit-transaction") openTransactionDialog(state.transactions.find((transaction) => transaction.id === id));
  else if (action === "delete-transaction") {
    const transaction = state.transactions.find((item) => item.id === id);
    if (transaction && sourceBalance(transaction.sourceId, id) < 0) showToast("Deleting this income would overdraw its source.", true);
    else if (transaction && confirm("Delete this transaction?")) { state.transactions = state.transactions.filter((item) => item.id !== id); saveState(); render(); showToast("Transaction deleted."); }
  }
});

elements.typeFilter.addEventListener("change", renderTransactions); elements.sourceFilter.addEventListener("change", renderTransactions);
$("#export-btn").addEventListener("click", exportPdfReport);

function exportPdfReport() {
  const reportWindow = window.open("", "_blank", "width=1000,height=760");
  if (!reportWindow) { showToast("Allow pop-ups to export the PDF report.", true); return; }
  const sortedTransactions = [...state.transactions].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const totalIncome = state.transactions.filter((item) => item.type === "income").reduce((sum, item) => sum + item.amount, 0);
  const totalExpenses = state.transactions.filter((item) => item.type === "expense").reduce((sum, item) => sum + item.amount, 0);
  const totalFunds = state.sources.reduce((sum, source) => sum + sourceBalance(source.id), 0);
  const rows = sortedTransactions.length ? sortedTransactions.map((transaction) => {
    const source = state.sources.find((item) => item.id === transaction.sourceId);
    return `<tr><td>${formatDate(transaction.date)}</td><td><span class="type ${transaction.type}">${transaction.type === "income" ? "Money in" : "Expense"}</span></td><td>${escapeHtml(source?.name || "Unknown")}</td><td>${escapeHtml(transaction.note || "—")}</td><td class="amount ${transaction.type}">${transaction.type === "income" ? "+" : "−"}${peso.format(transaction.amount)}</td></tr>`;
  }).join("") : `<tr><td class="empty" colspan="5">No transactions have been recorded.</td></tr>`;
  const sourceRows = state.sources.length ? state.sources.map((source) => `<tr><td colspan="3">${escapeHtml(source.name)}</td><td colspan="2" class="amount">${peso.format(sourceBalance(source.id))}</td></tr>`).join("") : `<tr><td class="empty" colspan="5">No money sources have been added.</td></tr>`;
  reportWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>PesoFlow Transaction Report ${today()}</title><style>
    @page{size:A4;margin:16mm}*{box-sizing:border-box}body{margin:0;color:#17231e;font:12px Arial,sans-serif}header{display:flex;justify-content:space-between;align-items:end;padding-bottom:18px;border-bottom:2px solid #17231e}h1{margin:0;font:30px Georgia,serif}.brand{color:#0e6b4d;font-weight:700}.meta{text-align:right;color:#69756f;line-height:1.5}.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:22px 0}.card{padding:14px;border:1px solid #deddd3;border-radius:8px}.card span{display:block;color:#69756f;font-size:9px;text-transform:uppercase;letter-spacing:.1em}.card strong{display:block;margin-top:7px;font:20px Georgia,serif}h2{margin:25px 0 10px;font:18px Georgia,serif}table{width:100%;border-collapse:collapse}th{padding:9px 7px;border-bottom:1px solid #17231e;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.08em}td{padding:10px 7px;border-bottom:1px solid #deddd3;vertical-align:top}.amount{text-align:right;white-space:nowrap;font-weight:700}.income{color:#0e6b4d}.expense{color:#c55840}.type{font-weight:700}.empty{text-align:center;color:#69756f;padding:25px}footer{margin-top:25px;padding-top:10px;border-top:1px solid #deddd3;color:#69756f;font-size:9px}@media print{.no-print{display:none}tr{break-inside:avoid}}
  </style></head><body><header><div><div class="brand">₱ PesoFlow</div><h1>Transaction report</h1></div><div class="meta">Generated ${new Intl.DateTimeFormat("en-PH", { dateStyle: "long", timeStyle: "short" }).format(new Date())}<br>${state.transactions.length} transaction${state.transactions.length === 1 ? "" : "s"}</div></header>
  <section class="summary"><div class="card"><span>Total available</span><strong>${peso.format(totalFunds)}</strong></div><div class="card"><span>Total money in</span><strong>${peso.format(totalIncome)}</strong></div><div class="card"><span>Total money out</span><strong>${peso.format(totalExpenses)}</strong></div></section>
  <h2>All transactions</h2><table><thead><tr><th>Date</th><th>Type</th><th>Source</th><th>Note</th><th class="amount">Amount</th></tr></thead><tbody>${rows}</tbody></table>
  <h2>Current source balances</h2><table><tbody>${sourceRows}</tbody></table><footer>This report was generated from the data stored locally in PesoFlow.</footer></body></html>`);
  reportWindow.document.close();
  reportWindow.focus();
  setTimeout(() => { reportWindow.print(); }, 300);
  showToast("PDF report opened. Choose “Save as PDF” in the print window.");
}
$("#import-btn").addEventListener("click", () => { elements.importFile.value = ""; elements.importFile.click(); });
async function uploadBackupToFirebaseStorage(file) {
  // Store in: backups/<timestamp>-<original filename>
  const objectPath = `backups/${Date.now()}-${file.name}`;
  const storageRef = firebaseStorage.ref(objectPath);

  const snapshot = await storageRef.put(file);
  // Optional: download URL if you want it later
  const downloadUrl = await snapshot.ref.getDownloadURL();
  return downloadUrl;
}

elements.importFile.addEventListener("change", async () => {
  const file = elements.importFile.files[0];
  if (!file) return;

  // 1) Upload to Firebase Storage (best-effort)
  try {
    await uploadBackupToFirebaseStorage(file);
    showToast("Backup uploaded to Firebase Storage.");
  } catch (e) {
    // Don’t block local import if upload fails
    console.error("Firebase Storage upload failed:", e);
    showToast("Local import will continue, but upload to Storage failed.", true);
  }

  // 2) Keep your existing local import/replace behavior
  try {
    const imported = JSON.parse(await file.text());
    if (!validateData(imported)) throw new Error("Invalid backup");
    if (!confirm("Import this backup? Your current data will be replaced.")) return;
    state = imported;
    normalizeSourceColors();
    saveState();
    render();
    showToast("Backup imported.");
  } catch {
    showToast("This is not a valid PesoFlow backup.", true);
  }
});

function validateData(data) {
  if (!data || data.version !== DATA_VERSION || !Array.isArray(data.sources) || !Array.isArray(data.transactions)) return false;
  const ids = new Set();
  for (const source of data.sources) {
    if (!source || typeof source.id !== "string" || ids.has(source.id) || typeof source.name !== "string" || !source.name.trim() || !Number.isFinite(source.openingBalance) || source.openingBalance < 0 || typeof source.createdAt !== "string") return false;
    ids.add(source.id);
  }
  const transactionIds = new Set();
  for (const transaction of data.transactions) {
    if (!transaction || typeof transaction.id !== "string" || transactionIds.has(transaction.id) || !["income", "expense"].includes(transaction.type) || !ids.has(transaction.sourceId) || !Number.isFinite(transaction.amount) || transaction.amount <= 0 || !isValidDateString(transaction.date) || typeof transaction.note !== "string" || transaction.note.length > 100 || typeof transaction.createdAt !== "string") return false;
    transactionIds.add(transaction.id);
  }
  for (const source of data.sources) {
    const balance = data.transactions.reduce((sum, transaction) => transaction.sourceId === source.id ? sum + (transaction.type === "income" ? transaction.amount : -transaction.amount) : sum, source.openingBalance);
    if (balance < 0) return false;
  }
  return true;
}

render();
