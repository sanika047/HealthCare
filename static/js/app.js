/* ===== HEALTH PREDICTION APP - MAIN JS ===== */
'use strict';

const API = '/api';
let allPatients = [];
let editingId = null;
let deletingId = null;

/* ===== DOM HELPERS ===== */
const $ = id => document.getElementById(id);
const show = el => { if (el) { el.classList.add('active'); } };
const hide = el => { if (el) { el.classList.remove('active'); } };

/* ===== INIT ===== */
document.addEventListener('DOMContentLoaded', () => {
  loadPatients();
  loadStats();
  bindEvents();
});

function bindEvents() {
  $('searchInput').addEventListener('input', filterTable);
  $('addPatientBtn').addEventListener('click', openAddModal);
  $('formModal').addEventListener('click', e => { if (e.target === $('formModal')) closeFormModal(); });
  $('viewModal').addEventListener('click', e => { if (e.target === $('viewModal')) closeViewModal(); });
  $('deleteModal').addEventListener('click', e => { if (e.target === $('deleteModal')) closeDeleteModal(); });
  $('patientForm').addEventListener('submit', handleFormSubmit);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeFormModal(); closeViewModal(); closeDeleteModal(); }
  });
}

/* ===== API CALLS ===== */
async function loadPatients() {
  try {
    const res = await fetch(`${API}/patients`);
    allPatients = await res.json();
    renderTable(allPatients);
  } catch (err) {
    showToast('Failed to load patient records.', 'error');
  }
}

async function loadStats() {
  try {
    const res = await fetch(`${API}/stats`);
    const data = await res.json();
    $('statTotal').textContent = data.total;
    $('statGlucose').textContent = data.avg_glucose || '—';
    $('statHaemoglobin').textContent = data.avg_haemoglobin || '—';
    $('statCholesterol').textContent = data.avg_cholesterol || '—';
  } catch (err) { /* silent */ }
}

/* ===== TABLE RENDER ===== */
function renderTable(patients) {
  const tbody = $('patientTableBody');
  const empty = $('emptyState');
  const tableFooter = $('tableFooter');

  if (!patients || patients.length === 0) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    tableFooter.style.display = 'none';
    return;
  }

  empty.style.display = 'none';
  tableFooter.style.display = 'flex';
  $('recordCount').textContent = `Showing ${patients.length} record${patients.length !== 1 ? 's' : ''}`;

  tbody.innerHTML = patients.map((p, i) => `
    <tr class="fade-in" style="animation-delay:${i * 0.04}s">
      <td>
        <div class="patient-name">${escHtml(p.full_name)}</div>
        <div class="patient-email">${escHtml(p.email)}</div>
      </td>
      <td>${formatDate(p.date_of_birth)}</td>
      <td>
        <div class="value-bar-wrapper">
          <span class="blood-value ${glucoseClass(p.glucose)}">${p.glucose}</span>
          <div class="value-bar"><div class="value-bar-fill" style="width:${Math.min(p.glucose/200*100,100)}%;background:${glucoseColor(p.glucose)}"></div></div>
        </div>
      </td>
      <td>
        <div class="value-bar-wrapper">
          <span class="blood-value ${haemoglobinClass(p.haemoglobin)}">${p.haemoglobin}</span>
          <div class="value-bar"><div class="value-bar-fill" style="width:${Math.min(p.haemoglobin/20*100,100)}%;background:${haemoglobinColor(p.haemoglobin)}"></div></div>
        </div>
      </td>
      <td>
        <div class="value-bar-wrapper">
          <span class="blood-value ${cholesterolClass(p.cholesterol)}">${p.cholesterol}</span>
          <div class="value-bar"><div class="value-bar-fill" style="width:${Math.min(p.cholesterol/300*100,100)}%;background:${cholesterolColor(p.cholesterol)}"></div></div>
        </div>
      </td>
      <td>${getStatusBadge(p.remarks)}</td>
      <td>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn-outline-glow" onclick="viewPatient(${p.id})" title="View Details">
            <i class="fas fa-eye"></i> View
          </button>
          <button class="btn-edit-glow" onclick="editPatient(${p.id})" title="Edit">
            <i class="fas fa-pen"></i> Edit
          </button>
          <button class="btn-danger-glow" onclick="confirmDelete(${p.id}, '${escHtml(p.full_name)}')" title="Delete">
            <i class="fas fa-trash"></i> Delete
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

/* ===== SEARCH / FILTER ===== */
function filterTable() {
  const q = $('searchInput').value.toLowerCase().trim();
  if (!q) { renderTable(allPatients); return; }
  const filtered = allPatients.filter(p =>
    p.full_name.toLowerCase().includes(q) ||
    p.email.toLowerCase().includes(q) ||
    (p.remarks || '').toLowerCase().includes(q)
  );
  renderTable(filtered);
}

/* ===== MODALS ===== */
function openAddModal() {
  editingId = null;
  $('modalTitle').innerHTML = '<i class="fas fa-user-plus"></i> Add New Patient';
  $('patientForm').reset();
  clearFormErrors();
  show($('formModal'));
}

function closeFormModal() {
  hide($('formModal'));
  $('patientForm').reset();
  clearFormErrors();
  editingId = null;
}

function closeViewModal() { hide($('viewModal')); }
function closeDeleteModal() { hide($('deleteModal')); deletingId = null; }

async function viewPatient(id) {
  const p = allPatients.find(x => x.id === id);
  if (!p) return;

  $('viewName').textContent = p.full_name;
  $('viewEmail').textContent = p.email;
  $('viewDob').textContent = formatDate(p.date_of_birth);
  $('viewAge').textContent = calcAge(p.date_of_birth) + ' years';
  $('viewGlucose').innerHTML = `<span class="${glucoseClass(p.glucose)}">${p.glucose} mg/dL</span>`;
  $('viewHaemoglobin').innerHTML = `<span class="${haemoglobinClass(p.haemoglobin)}">${p.haemoglobin} g/dL</span>`;
  $('viewCholesterol').innerHTML = `<span class="${cholesterolClass(p.cholesterol)}">${p.cholesterol} mg/dL</span>`;
  $('viewRemarks').textContent = p.remarks || 'No remarks available.';
  $('viewStatus').innerHTML = getStatusBadge(p.remarks);
  $('viewCreated').textContent = formatDateTime(p.created_at);

  show($('viewModal'));
}

async function editPatient(id) {
  const p = allPatients.find(x => x.id === id);
  if (!p) return;

  editingId = id;
  $('modalTitle').innerHTML = '<i class="fas fa-pen"></i> Edit Patient Record';
  $('fieldName').value = p.full_name;
  $('fieldDob').value = p.date_of_birth;
  $('fieldEmail').value = p.email;
  $('fieldGlucose').value = p.glucose;
  $('fieldHaemoglobin').value = p.haemoglobin;
  $('fieldCholesterol').value = p.cholesterol;
  clearFormErrors();
  show($('formModal'));
}

function confirmDelete(id, name) {
  deletingId = id;
  $('deletePatientName').textContent = name;
  show($('deleteModal'));
}

async function deletePatient() {
  if (!deletingId) return;
  showLoading('Deleting record...');
  try {
    const res = await fetch(`${API}/patients/${deletingId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error();
    closeDeleteModal();
    await loadPatients();
    await loadStats();
    showToast('Patient record deleted successfully.', 'success');
  } catch {
    showToast('Failed to delete record. Please try again.', 'error');
  } finally {
    hideLoading();
  }
}

/* ===== FORM SUBMIT ===== */
async function handleFormSubmit(e) {
  e.preventDefault();
  clearFormErrors();

  const data = {
    full_name: $('fieldName').value.trim(),
    date_of_birth: $('fieldDob').value,
    email: $('fieldEmail').value.trim(),
    glucose: $('fieldGlucose').value,
    haemoglobin: $('fieldHaemoglobin').value,
    cholesterol: $('fieldCholesterol').value
  };

  showLoading(editingId ? 'Updating record & generating AI analysis...' : 'Saving record & generating AI analysis...');

  try {
    const url = editingId ? `${API}/patients/${editingId}` : `${API}/patients`;
    const method = editingId ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    const result = await res.json();

    if (!res.ok) {
      if (result.errors) {
        result.errors.forEach(err => showFormError(err));
      } else {
        showToast('An error occurred. Please try again.', 'error');
      }
      return;
    }

    closeFormModal();
    await loadPatients();
    await loadStats();
    showToast(
      editingId ? 'Patient record updated successfully.' : 'Patient added with AI health analysis.',
      'success'
    );
  } catch {
    showToast('Network error. Please check your connection.', 'error');
  } finally {
    hideLoading();
  }
}

/* ===== FORM VALIDATION DISPLAY ===== */
function showFormError(msg) {
  const errContainer = $('formErrors');
  const li = document.createElement('li');
  li.textContent = msg;
  errContainer.appendChild(li);
  $('formErrorBox').style.display = 'block';
}

function clearFormErrors() {
  $('formErrors').innerHTML = '';
  $('formErrorBox').style.display = 'none';
}

/* ===== LOADING ===== */
function showLoading(msg = 'Processing...') {
  $('loadingText').textContent = msg;
  show($('loadingOverlay'));
}

function hideLoading() {
  hide($('loadingOverlay'));
}

/* ===== TOAST ===== */
function showToast(message, type = 'info') {
  const container = $('toastContainer');
  const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <i class="fas ${icons[type]} toast-icon"></i>
    <span>${escHtml(message)}</span>
  `;
  container.appendChild(toast);
  requestAnimationFrame(() => { requestAnimationFrame(() => { toast.classList.add('show'); }); });
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 400);
  }, 3500);
}

/* ===== HELPERS ===== */
function escHtml(str) {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(String(str)));
  return d.innerHTML;
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function calcAge(dob) {
  const birth = new Date(dob + 'T00:00:00');
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

/* ===== BLOOD VALUE CLASSIFIERS ===== */
function glucoseClass(v)      { return v > 126 ? 'blood-danger' : v > 100 ? 'blood-warning' : 'blood-normal'; }
function haemoglobinClass(v)  { return v < 8   ? 'blood-danger' : v < 12  ? 'blood-warning' : 'blood-normal'; }
function cholesterolClass(v)  { return v > 240  ? 'blood-danger' : v > 200 ? 'blood-warning' : 'blood-normal'; }

function glucoseColor(v)      { return v > 126 ? '#ef4444' : v > 100 ? '#f59e0b' : '#10b981'; }
function haemoglobinColor(v)  { return v < 8   ? '#ef4444' : v < 12  ? '#f59e0b' : '#10b981'; }
function cholesterolColor(v)  { return v > 240  ? '#ef4444' : v > 200 ? '#f59e0b' : '#10b981'; }

function getStatusBadge(remarks) {
  if (!remarks) return '<span class="badge-health badge-at-risk"><i class="fas fa-clock"></i> Pending</span>';
  const r = remarks.toLowerCase();
  if (r.includes('critical'))  return '<span class="badge-health badge-critical"><i class="fas fa-exclamation-triangle"></i> Critical</span>';
  if (r.includes('at risk') || r.includes('⚠')) return '<span class="badge-health badge-at-risk"><i class="fas fa-exclamation-circle"></i> At Risk</span>';
  if (r.includes('healthy') || r.includes('✓')) return '<span class="badge-health badge-healthy"><i class="fas fa-check-circle"></i> Healthy</span>';
  return '<span class="badge-health badge-at-risk"><i class="fas fa-stethoscope"></i> Assessed</span>';
}

/* ===== DATE VALIDATION: prevent future dates ===== */
document.addEventListener('DOMContentLoaded', () => {
  const dobField = $('fieldDob');
  if (dobField) {
    const today = new Date().toISOString().split('T')[0];
    dobField.setAttribute('max', today);
  }
});
