/* ===================================================
   Health Prediction App — Frontend Logic
   =================================================== */

const API = {
  patients: '/api/patients',
  stats: '/api/stats',
  patient: (id) => `/api/patients/${id}`
};

// ── State ──────────────────────────────────────────
let allPatients = [];
let editingId = null;
let deletingId = null;

// ── DOM Refs ───────────────────────────────────────
const loadingOverlay = document.getElementById('loadingOverlay');
const patientTableBody = document.getElementById('patientTableBody');
const searchInput = document.getElementById('searchInput');
const patientCountBadge = document.getElementById('patientCountBadge');

// ── Loading helpers ────────────────────────────────
function showLoading() { loadingOverlay.classList.add('active'); }
function hideLoading() { loadingOverlay.classList.remove('active'); }

// ── Toast notifications ────────────────────────────
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', warning: 'fa-triangle-exclamation', info: 'fa-circle-info' };
  const toast = document.createElement('div');
  toast.className = `toast-custom ${type}`;
  toast.innerHTML = `
    <i class="fa-solid ${icons[type] || icons.info} toast-icon"></i>
    <span class="toast-message">${message}</span>
    <button class="toast-close" onclick="removeToast(this.parentElement)"><i class="fa-solid fa-xmark"></i></button>
  `;
  container.appendChild(toast);
  setTimeout(() => removeToast(toast), 4500);
}

function removeToast(el) {
  if (!el || !el.parentElement) return;
  el.classList.add('removing');
  setTimeout(() => el.remove(), 300);
}

// ── API helpers ────────────────────────────────────
async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const data = await res.json();
  if (!res.ok) throw data;
  return data;
}

// ── Stats ──────────────────────────────────────────
async function loadStats() {
  try {
    const stats = await apiFetch(API.stats);
    document.getElementById('statTotal').textContent = stats.total;
    document.getElementById('statGlucose').textContent = stats.avg_glucose || '—';
    document.getElementById('statHaemoglobin').textContent = stats.avg_haemoglobin || '—';
    document.getElementById('statCholesterol').textContent = stats.avg_cholesterol || '—';
  } catch (e) {
    console.error('Stats error:', e);
  }
}

// ── Health status extraction ───────────────────────
function extractStatus(remarks) {
  if (!remarks) return 'unknown';
  const r = remarks.toLowerCase();
  if (r.includes('critical')) return 'critical';
  if (r.includes('at risk') || r.includes('atrisk')) return 'at-risk';
  if (r.includes('healthy') || r.includes('normal')) return 'healthy';
  return 'unknown';
}

function statusBadge(remarks) {
  const status = extractStatus(remarks);
  const map = {
    healthy:  { cls: 'badge-healthy',  icon: 'fa-circle-check',    label: 'Healthy'  },
    'at-risk':{ cls: 'badge-at-risk',  icon: 'fa-triangle-exclamation', label: 'At Risk' },
    critical: { cls: 'badge-critical', icon: 'fa-circle-xmark',    label: 'Critical' },
    unknown:  { cls: 'badge-unknown',  icon: 'fa-circle-question', label: 'Unknown'  }
  };
  const { cls, icon, label } = map[status] || map.unknown;
  return `<span class="badge-health ${cls}"><i class="fa-solid ${icon}"></i>${label}</span>`;
}

// ── Blood value colouring ──────────────────────────
function glucoseClass(v)      { return v > 126 ? 'danger' : v > 100 ? 'warning' : 'normal'; }
function haemoglobinClass(v)  { return v < 12  ? 'danger' : v < 13.5 ? 'warning' : 'normal'; }
function cholesterolClass(v)  { return v > 240 ? 'danger' : v > 200  ? 'warning' : 'normal'; }

// ── Age calculation ────────────────────────────────
function calcAge(dob) {
  const d = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
  return age;
}

function formatDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── Render table ───────────────────────────────────
function renderTable(patients) {
  if (!patients.length) {
    patientTableBody.innerHTML = `
      <tr><td colspan="9">
        <div class="empty-state">
          <div class="empty-state-icon"><i class="fa-solid fa-user-slash"></i></div>
          <h5>No patients found</h5>
          <p>Add your first patient record using the button above.</p>
        </div>
      </td></tr>`;
    patientCountBadge.textContent = '0 records';
    return;
  }

  patientCountBadge.textContent = `${patients.length} record${patients.length !== 1 ? 's' : ''}`;

  patientTableBody.innerHTML = patients.map((p, i) => `
    <tr class="fade-in" style="animation-delay:${i * 0.04}s">
      <td>
        <div class="patient-name">${escHtml(p.full_name)}</div>
        <div class="patient-email">${escHtml(p.email)}</div>
      </td>
      <td>${formatDate(p.date_of_birth)} <span class="text-muted" style="font-size:0.75rem">(${calcAge(p.date_of_birth)}y)</span></td>
      <td><span class="blood-value ${glucoseClass(p.glucose)}">${p.glucose}</span></td>
      <td><span class="blood-value ${haemoglobinClass(p.haemoglobin)}">${p.haemoglobin}</span></td>
      <td><span class="blood-value ${cholesterolClass(p.cholesterol)}">${p.cholesterol}</span></td>
      <td>${statusBadge(p.remarks)}</td>
      <td>
        <div class="d-flex gap-2 flex-wrap">
          <button class="btn-glass" onclick="viewPatient(${p.id})" title="View Details">
            <i class="fa-solid fa-eye"></i>
          </button>
          <button class="btn-glass" onclick="openEditModal(${p.id})" title="Edit">
            <i class="fa-solid fa-pen-to-square"></i>
          </button>
          <button class="btn-danger-glass" onclick="confirmDelete(${p.id}, '${escHtml(p.full_name)}')" title="Delete">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </td>
    </tr>`).join('');
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
