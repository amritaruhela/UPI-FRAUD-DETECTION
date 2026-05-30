/* ── app.js ──────────────────────────────────────────────────────────────── */

// ── State ──────────────────────────────────────────────────────────────────
let allHistory = [];
let doughnutChart = null;
let lineChart = null;
let barChart = null;
let batchFile = null;
let riskScoreHistory = [];
let currentUser = null;

// ── Navigation ─────────────────────────────────────────────────────────────
function showSection(name) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
 
  const targetSection = document.getElementById('section-' + name);
  const targetNav = document.getElementById('nav-' + name);
 
  if (targetSection) targetSection.classList.add('active');
  if (targetNav) targetNav.classList.add('active');
 
  const titles = {
    home: 'Overview Home',
    analyzer: 'Fraud Analyzer',
    dashboard: 'Dashboard',
    history: 'Transaction History',
    batch: 'Batch Analysis',
    help: 'Help & Support'
  };
  document.getElementById('page-title').textContent = titles[name] || 'UPI Shield';
 
  // Refresh section data
  if (name === 'dashboard') refreshDashboard();
  if (name === 'history') loadHistory();
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

// ── Quick Scenarios (Adjusted for Dual Balance & Removed Receiver Bal) ─────
const SCENARIOS = {
  legit: {
    amount: 1200,
    transaction_type: 'P2M',
    sender_upi: 'rahul@okaxis',
    receiver_upi: 'zomato@paytm',
    sender_balance_before: 45000,
    sender_balance_after: 43800,
    hour: 13,
    tx_count: 2
  },
  suspicious: {
    amount: 98000,
    transaction_type: 'TRANSFER',
    sender_upi: 'unknown123@ybl',
    receiver_upi: 'anon456@upi',
    sender_balance_before: 100000,
    sender_balance_after: 100000, // No balance drop despite 98K transfer! Anomaly!
    hour: 3,
    tx_count: 14
  },
  night: {
    amount: 25000,
    transaction_type: 'P2P',
    sender_upi: 'priya@sbi',
    receiver_upi: 'rohan@hdfc',
    sender_balance_before: 30000,
    sender_balance_after: 5000,
    hour: 2,
    tx_count: 5
  },
  highvalue: {
    amount: 490000,
    transaction_type: 'TRANSFER',
    sender_upi: 'corp@okicici',
    receiver_upi: 'vendor@ybl',
    sender_balance_before: 500000,
    sender_balance_after: 10000,
    hour: 14,
    tx_count: 8
  }
};

function fillScenario(key) {
  const s = SCENARIOS[key];
  document.getElementById('amount').value = s.amount;
  document.getElementById('transaction_type').value = s.transaction_type;
  document.getElementById('sender_upi').value = s.sender_upi;
  document.getElementById('receiver_upi').value = s.receiver_upi;
  document.getElementById('sender_balance_before').value = s.sender_balance_before;
  document.getElementById('sender_balance_after').value = s.sender_balance_after;
  document.getElementById('hour').value = s.hour;
  document.getElementById('tx_count').value = s.tx_count;
 
  showToast(`Loaded preset scenario: ${key.toUpperCase()}`, 'success');
}

// ── Auto Calculate Balance After ──────────────────────────────────────────
function autoCalculateAfterBalance() {
  const amountVal = parseFloat(document.getElementById('amount').value) || 0;
  const balBeforeVal = parseFloat(document.getElementById('sender_balance_before').value) || 0;
 
  if (balBeforeVal > 0) {
    const calculatedAfter = Math.max(0, balBeforeVal - amountVal);
    document.getElementById('sender_balance_after').value = calculatedAfter;
  }
}

// ── Authentication Modals & Handlers ──────────────────────────────────────
function openAuthModal(mode = 'login') {
  document.getElementById('auth-modal').style.display = 'flex';
  switchAuthTab(mode);
}

function closeAuthModal() {
  document.getElementById('auth-modal').style.display = 'none';
}

function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.auth-form-wrap').forEach(form => form.style.display = 'none');
 
  if (tab === 'login') {
    document.getElementById('auth-tab-login').classList.add('active');
    document.getElementById('auth-login-wrap').style.display = 'block';
  } else {
    document.getElementById('auth-tab-register').classList.add('active');
    document.getElementById('auth-register-wrap').style.display = 'block';
  }
}

async function checkUserSession() {
  try {
    const res = await fetch('/api/auth/me');
    const data = await res.json();
    if (data.logged_in) {
      updateAuthUI(data.user);
    } else {
      updateAuthUI(null);
    }
  } catch (err) {
    updateAuthUI(null);
  }
}

function updateAuthUI(user) {
  const triggerBtn = document.getElementById('btn-login-trigger');
  const profilePill = document.getElementById('user-profile-pill');
  const userText = document.getElementById('logged-username');
 
  if (user) {
    currentUser = user;
    triggerBtn.style.display = 'none';
    profilePill.style.display = 'inline-flex';
    userText.textContent = user.username;
  } else {
    currentUser = null;
    triggerBtn.style.display = 'inline-flex';
    profilePill.style.display = 'none';
  }
 
  // Refresh data based on logged-in or guest status
  updateTopBar();
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  const userVal = document.getElementById('login-username').value;
  const passVal = document.getElementById('login-password').value;
 
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: userVal, password: passVal })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
   
    showToast(`Signed in successfully as ${data.user.username}!`, 'success');
    updateAuthUI(data.user);
    closeAuthModal();
    // Clear forms
    document.getElementById('login-username').value = '';
    document.getElementById('login-password').value = '';
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleSignupSubmit(e) {
  e.preventDefault();
  const userVal = document.getElementById('register-username').value;
  const passVal = document.getElementById('register-password').value;
 
  try {
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: userVal, password: passVal })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
   
    showToast(`Registered and signed in successfully as ${data.user.username}!`, 'success');
    updateAuthUI(data.user);
    closeAuthModal();
    // Clear forms
    document.getElementById('register-username').value = '';
    document.getElementById('register-password').value = '';
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleLogout() {
  try {
    const res = await fetch('/api/auth/logout', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast('Logged out successfully', 'success');
      updateAuthUI(null);
      // Reset view to Home
      showSection('home');
    }
  } catch (err) {
    showToast('Failed to sign out', 'error');
  }
}

// ── Help & FAQ Support Ticket ──────────────────────────────────────────────
function toggleFaq(btn) {
  const faqItem = btn.parentElement;
  const isOpen = faqItem.classList.contains('open');
 
  // Close all other FAQs
  document.querySelectorAll('.faq-item').forEach(item => {
    item.classList.remove('open');
    item.querySelector('.faq-answer').style.display = 'none';
  });
 
  if (!isOpen) {
    faqItem.classList.add('open');
    faqItem.querySelector('.faq-answer').style.display = 'block';
  }
}

async function submitHelpTicket(e) {
  e.preventDefault();
  const loader = document.getElementById('help-loader');
  const btn = document.getElementById('help-submit-btn');
 
  loader.style.display = 'block';
  btn.style.opacity = '0.6';
 
  const payload = {
    name: document.getElementById('help-name').value,
    email: document.getElementById('help-email').value,
    category: document.getElementById('help-category').value,
    message: document.getElementById('help-message').value
  };
 
  try {
    const res = await fetch('/api/help', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
   
    showToast(data.message, 'success');
    document.getElementById('help-message').value = '';
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  } finally {
    loader.style.display = 'none';
    btn.style.opacity = '1';
  }
}

// ── Prediction ────────────────────────────────────────────────────────────
async function submitPrediction(e) {
  e.preventDefault();
  const btn = document.getElementById('submit-btn');
  btn.classList.add('loading');
  document.getElementById('btn-loader').style.display = 'block';

  const payload = {
    amount: parseFloat(document.getElementById('amount').value),
    transaction_type: document.getElementById('transaction_type').value,
    sender_upi: document.getElementById('sender_upi').value,
    receiver_upi: document.getElementById('receiver_upi').value,
    sender_balance_before: parseFloat(document.getElementById('sender_balance_before').value) || 10000,
    sender_balance_after: parseFloat(document.getElementById('sender_balance_after').value) || 5000,
    hour: parseInt(document.getElementById('hour').value) || new Date().getHours(),
    transaction_count_last_hour: parseInt(document.getElementById('tx_count').value) || 1
  };

  try {
    const res = await fetch('/api/predict', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    renderResult(data);
    updateTopBar();
   
    riskScoreHistory.push({ time: new Date().toLocaleTimeString(), score: data.fraud_probability });
    if (riskScoreHistory.length > 20) riskScoreHistory.shift();
   
    showToast(data.is_fraud ? '🚨 Anomaly detected! High Risk' : '✅ Verified Legit transaction', data.is_fraud ? 'error' : 'success');
   
    // Smooth scroll to top of Analyzer section to show result instantly
    document.getElementById('result-panel').scrollIntoView({ behavior: 'smooth', block: 'end' });
   
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  } finally {
    btn.classList.remove('loading');
    document.getElementById('btn-loader').style.display = 'none';
  }
}

// ── Render Result ──────────────────────────────────────────────────────────
function renderResult(data) {
  document.getElementById('result-idle').style.display = 'none';
  const content = document.getElementById('result-content');
  content.style.display = 'block';

  const card = document.getElementById('verdict-card');
  card.className = 'verdict-block-top verdict-card ' + (data.is_fraud ? 'fraud' : 'legit');

  // Icon + labels
  document.getElementById('verdict-icon').className = 'verdict-icon ' + (data.is_fraud ? 'fraud-icon' : 'legit-icon');
  document.getElementById('verdict-icon').textContent = data.is_fraud ? '🚨' : '✅';
  document.getElementById('verdict-label').textContent = data.is_fraud ? 'FRAUDULENT VERDICT' : 'LEGITIMATE VERDICT';
  document.getElementById('verdict-label').style.color = data.is_fraud ? '#ef4444' : '#10b981';
  document.getElementById('verdict-sublabel').textContent = data.is_fraud
    ? `${data.fraud_probability}% calculated risk index — Action Recommended`
    : `${data.legit_probability}% statistical confidence index — Clear Security State`;

  // Risk badge
  const rb = document.getElementById('risk-badge');
  rb.textContent = data.risk_level;
  rb.className = 'risk-badge ' + data.risk_level;

  // Gauge
  document.getElementById('gauge-value').textContent = data.fraud_probability + '%';
  const gf = document.getElementById('gauge-fill');
  gf.className = 'gauge-fill ' + (data.is_fraud ? 'fraud-fill' : 'legit-fill');
  setTimeout(() => { gf.style.width = data.fraud_probability + '%'; }, 50);

  // Meta
  document.getElementById('meta-txn-id').textContent = data.transaction_id || '–';
  document.getElementById('meta-model').textContent = data.model_used || 'ML Engine';
  document.getElementById('meta-confidence').textContent = data.confidence + '%';

  // Feature importance
  renderImportance(data.feature_importance_labeled);
}

function renderImportance(items) {
  const list = document.getElementById('importance-list');
  list.innerHTML = '';
  if (!items || !items.length) return;
  const max = Math.max(...items.map(i => i.importance));
 
  items.slice(0, 8).forEach((item, idx) => {
    const pct = max > 0 ? (item.importance / max * 100) : 0;
    const div = document.createElement('div');
    div.className = 'importance-item';
    div.innerHTML = `
      <span class="importance-label" title="${item.feature}">${item.feature}</span>
      <div class="importance-track"><div class="importance-bar" id="ibar-${idx}"></div></div>
      <span class="importance-pct">${(item.importance * 100).toFixed(1)}%</span>`;
    list.appendChild(div);
    setTimeout(() => { document.getElementById('ibar-' + idx).style.width = pct + '%'; }, 80 + idx * 40);
  });
}

// ── Top Bar Stats ──────────────────────────────────────────────────────────
async function updateTopBar() {
  try {
    const res = await fetch('/api/stats');
    const s = await res.json();
    document.getElementById('pill-total').textContent = s.total;
    document.getElementById('pill-rate').textContent = s.total ? s.fraud_rate + '%' : '–';
  } catch (_) {}
}

// ── History ────────────────────────────────────────────────────────────────
async function loadHistory() {
  try {
    const res = await fetch('/api/history');
    allHistory = await res.json();
    renderHistory(allHistory);
  } catch (_) {}
}

function renderHistory(data) {
  const tbody = document.getElementById('history-tbody');
  const empty = document.getElementById('empty-history');
  tbody.innerHTML = '';
  if (!data.length) { empty.classList.add('show'); return; }
  empty.classList.remove('show');
  data.forEach(t => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="mono" style="color:#6366f1;font-size:.78rem">${t.id}</td>
      <td style="color:#94a3b8;font-size:.78rem">${t.timestamp}</td>
      <td style="font-weight:700">₹${t.amount.toLocaleString()}</td>
      <td style="color:#94a3b8;font-size:.78rem">${t.sender}</td>
      <td style="color:#94a3b8;font-size:.78rem">${t.receiver}</td>
      <td><span style="padding:.2rem .6rem;background:rgba(99,102,241,.1);color:#6366f1;border-radius:6px;font-size:.72rem;font-weight:600">${t.transaction_type}</span></td>
      <td style="font-weight:700;color:${t.is_fraud ? '#ef4444' : '#10b981'}">${t.fraud_probability}%</td>
      <td><span class="status-badge ${t.is_fraud ? 'fraud' : 'legit'}">${t.is_fraud ? 'FRAUD' : 'LEGIT'}</span></td>`;
    tbody.appendChild(tr);
  });
}

function filterHistory() {
  const q = document.getElementById('history-search').value.toLowerCase();
  const f = document.getElementById('history-filter').value;
  const filtered = allHistory.filter(t => {
    const matchQ = !q || t.id.toLowerCase().includes(q) || t.sender.toLowerCase().includes(q) || t.receiver.toLowerCase().includes(q) || String(t.amount).includes(q);
    const matchF = f === 'all' || (f === 'fraud' && t.is_fraud) || (f === 'legit' && !t.is_fraud);
    return matchQ && matchF;
  });
  renderHistory(filtered);
}

// ── Dashboard Charts ───────────────────────────────────────────────────────
async function refreshDashboard() {
  try {
    const res = await fetch('/api/stats');
    const s = await res.json();
    const hist = await (await fetch('/api/history')).json();

    const empty = document.getElementById('empty-dashboard');
    const grid = document.querySelector('.dashboard-grid');

    if (!s.total) {
      empty.classList.add('show');
      grid.style.display = 'none';
      return;
    }
    empty.classList.remove('show');
    grid.style.display = 'flex';

    // KPIs
    document.getElementById('kpi-total').textContent = s.total;
    document.getElementById('kpi-fraud').textContent = s.fraud_count;
    document.getElementById('kpi-legit').textContent = s.legit_count;
    document.getElementById('kpi-amount').textContent = '₹' + formatAmount(s.total_amount);

    renderDoughnut(s.fraud_count, s.legit_count);
    renderLineChart(hist);
    renderBarChart(hist);
  } catch (_) {}
}

function renderDoughnut(fraud, legit) {
  const ctx = document.getElementById('doughnutChart').getContext('2d');
  if (doughnutChart) doughnutChart.destroy();
  doughnutChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Fraud', 'Legitimate'],
      datasets: [{
        data: [fraud, legit],
        backgroundColor: ['rgba(239,68,68,.8)', 'rgba(16,185,129,.8)'],
        borderColor: ['#ef4444', '#10b981'],
        borderWidth: 2, hoverOffset: 6
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '70%',
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#101626', titleColor: '#f8fafc', bodyColor: '#94a3b8',
          callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed} (${Math.round(ctx.parsed/(fraud+legit)*100)}%)` }
        }
      }
    }
  });
  // Legend
  const lg = document.getElementById('donut-legend');
  lg.innerHTML = `<div class="legend-item"><div class="legend-dot" style="background:#ef4444"></div>Fraud (${fraud})</div><div class="legend-item"><div class="legend-dot" style="background:#10b981"></div>Legit (${legit})</div>`;
}

function renderLineChart(hist) {
  const ctx = document.getElementById('lineChart').getContext('2d');
  if (lineChart) lineChart.destroy();
  const data = hist.slice().reverse().slice(-15);
  lineChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.map((_, i) => '#' + (i + 1)),
      datasets: [{
        label: 'Fraud Risk %', data: data.map(t => t.fraud_probability),
        borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,.1)',
        fill: true, tension: .4, pointRadius: 4, pointBackgroundColor: data.map(t => t.is_fraud ? '#ef4444' : '#10b981')
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        x: { grid: { color: 'rgba(255,255,255,.05)' }, ticks: { color: '#94a3b8', font: { size: 11 } } },
        y: { min: 0, max: 100, grid: { color: 'rgba(255,255,255,.05)' }, ticks: { color: '#94a3b8', font: { size: 11 }, callback: v => v + '%' } }
      },
      plugins: { legend: { display: false }, tooltip: { backgroundColor: '#101626', titleColor: '#f8fafc', bodyColor: '#94a3b8' } }
    }
  });
}

function renderBarChart(hist) {
  const ctx = document.getElementById('barChart').getContext('2d');
  if (barChart) barChart.destroy();
  const buckets = { '<1K': 0, '1K-10K': 0, '10K-50K': 0, '50K-1L': 0, '>1L': 0 };
  hist.forEach(t => {
    if (t.amount < 1000) buckets['<1K']++;
    else if (t.amount < 10000) buckets['1K-10K']++;
    else if (t.amount < 50000) buckets['10K-50K']++;
    else if (t.amount < 100000) buckets['50K-1L']++;
    else buckets['>1L']++;
  });
  barChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: Object.keys(buckets),
      datasets: [{
        label: 'Transactions', data: Object.values(buckets),
        backgroundColor: ['rgba(99,102,241,.7)', 'rgba(6,182,212,.7)', 'rgba(16,185,129,.7)', 'rgba(245,158,11,.7)', 'rgba(239,68,68,.7)'],
        borderRadius: 7, borderSkipped: false
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        x: { grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 11 } } },
        y: { grid: { color: 'rgba(255,255,255,.05)' }, ticks: { color: '#94a3b8', font: { size: 11 }, stepSize: 1 } }
      },
      plugins: { legend: { display: false }, tooltip: { backgroundColor: '#101626', titleColor: '#f8fafc', bodyColor: '#94a3b8' } }
    }
  });
}

// ── Batch Upload ───────────────────────────────────────────────────────────
function dragOver(e) { e.preventDefault(); document.getElementById('upload-zone').classList.add('drag-over'); }
function dragLeave() { document.getElementById('upload-zone').classList.remove('drag-over'); }
function dropFile(e) {
  e.preventDefault();
  dragLeave();
  const file = e.dataTransfer.files[0];
  if (file && file.name.endsWith('.csv')) setBatchFile(file);
  else showToast('Please upload a CSV file', 'error');
}
function handleFileSelect(e) { const f = e.target.files[0]; if (f) setBatchFile(f); }

function setBatchFile(file) {
  batchFile = file;
  const zone = document.getElementById('upload-zone');
  zone.innerHTML = `<div class="upload-icon">📄</div><div class="upload-text" style="color:#10b981">✅ ${file.name}</div><div class="upload-hint">${(file.size/1024).toFixed(1)} KB — Ready to analyze</div>`;
  document.getElementById('batch-btn').style.display = 'flex';
}

async function runBatch() {
  if (!batchFile) return;
  const btn = document.getElementById('batch-btn');
  const loader = document.getElementById('batch-loader');
  btn.disabled = true; loader.style.display = 'block';

  const form = new FormData();
  form.append('file', batchFile);

  try {
    const res = await fetch('/api/batch', { method: 'POST', body: form });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    renderBatchResults(data);
    showToast(`Batch complete: ${data.summary.fraud_detected} fraud detected`, data.summary.fraud_detected > 0 ? 'error' : 'success');
  } catch (err) {
    showToast('Batch error: ' + err.message, 'error');
  } finally {
    btn.disabled = false; loader.style.display = 'none';
  }
}

function renderBatchResults(data) {
  const card = document.getElementById('batch-results-card');
  card.style.display = 'block';
  const s = data.summary;
  document.getElementById('batch-summary').innerHTML = `
    <div class="batch-sum-item"><div class="batch-sum-val">${s.total}</div><div class="batch-sum-label">Total Rows</div></div>
    <div class="batch-sum-item"><div class="batch-sum-val" style="color:#ef4444">${s.fraud_detected}</div><div class="batch-sum-label">Fraud Detected</div></div>
    <div class="batch-sum-item"><div class="batch-sum-val" style="color:#6366f1">${s.fraud_rate}%</div><div class="batch-sum-label">Fraud Rate</div></div>`;

  const tbody = document.getElementById('batch-tbody');
  tbody.innerHTML = '';
  data.results.forEach(r => {
    const tr = document.createElement('tr');
    if (r.error) {
      tr.innerHTML = `<td>${r.row}</td><td colspan="4" style="color:#ef4444">Error: ${r.error}</td>`;
    } else {
      tr.innerHTML = `
        <td>${r.row}</td>
        <td style="font-weight:700">₹${r.amount.toLocaleString()}</td>
        <td style="font-weight:700;color:${r.is_fraud ? '#ef4444' : '#10b981'}">${r.fraud_probability}%</td>
        <td><span class="risk-badge ${r.risk_level}" style="font-size:.68rem">${r.risk_level}</span></td>
        <td><span class="status-badge ${r.is_fraud ? 'fraud' : 'legit'}">${r.is_fraud ? 'FRAUD' : 'LEGIT'}</span></td>`;
    }
    tbody.appendChild(tr);
  });
}

// ── Toast ──────────────────────────────────────────────────────────────────
function showToast(msg, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${type === 'success' ? '✅' : type === 'error' ? '🚨' : 'ℹ️'}</span><span>${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => { toast.classList.add('hiding'); setTimeout(() => toast.remove(), 300); }, 3500);
}

// ── Helpers ────────────────────────────────────────────────────────────────
function formatAmount(n) {
  if (n >= 1e7) return (n / 1e7).toFixed(1) + 'Cr';
  if (n >= 1e5) return (n / 1e5).toFixed(1) + 'L';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toFixed(0);
}

// ── Init ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Check active session on load
  checkUserSession();
 
  // Navigate to Home section by default
  showSection('home');
 
  // Set current hour as default
  document.getElementById('hour').value = new Date().getHours();
});