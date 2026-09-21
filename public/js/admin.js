/**
 * Student Lost & Found - Admin Portal JavaScript
 * Secure session handling, claims management, and item moderation
 */

const ADMIN_TOKEN_KEY = 'lostfound_admin_token';
let currentAdminTab = 'overview';

document.addEventListener('DOMContentLoaded', () => {
  checkAdminAuth();

  const loginForm = document.getElementById('adminLoginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', handleAdminLogin);
  }

  const logoutBtn = document.getElementById('adminLogoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', handleAdminLogout);
  }

  // Admin tabs navigation
  const tabButtons = document.querySelectorAll('.admin-tab-btn');
  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const tabName = btn.getAttribute('data-tab');
      switchAdminTab(tabName);
    });
  });

  // Filters
  const itemTypeFilter = document.getElementById('adminItemTypeFilter');
  const itemStatusFilter = document.getElementById('adminItemStatusFilter');
  const itemSearch = document.getElementById('adminItemSearch');
  const claimStatusFilter = document.getElementById('adminClaimStatusFilter');

  if (itemTypeFilter) itemTypeFilter.addEventListener('change', loadAdminItems);
  if (itemStatusFilter) itemStatusFilter.addEventListener('change', loadAdminItems);
  if (itemSearch) {
    let debounce;
    itemSearch.addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(loadAdminItems, 250);
    });
  }
  if (claimStatusFilter) claimStatusFilter.addEventListener('change', loadAdminClaims);
});

function getAdminToken() {
  return localStorage.getItem(ADMIN_TOKEN_KEY);
}

function setAdminToken(token) {
  if (token) localStorage.setItem(ADMIN_TOKEN_KEY, token);
  else localStorage.removeItem(ADMIN_TOKEN_KEY);
}

async function checkAdminAuth() {
  const token = getAdminToken();
  const authSection = document.getElementById('adminAuthSection');
  const dashboardSection = document.getElementById('adminDashboardSection');

  if (!token) {
    if (authSection) authSection.style.display = 'block';
    if (dashboardSection) dashboardSection.style.display = 'none';
    return;
  }

  try {
    const res = await fetch('/api/admin/verify', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();

    if (res.ok && data.success) {
      if (authSection) authSection.style.display = 'none';
      if (dashboardSection) dashboardSection.style.display = 'block';
      loadAdminOverview();
      loadAdminItems();
      loadAdminClaims();
    } else {
      setAdminToken(null);
      if (authSection) authSection.style.display = 'block';
      if (dashboardSection) dashboardSection.style.display = 'none';
    }
  } catch (err) {
    console.error('Admin auth check failed:', err);
    setAdminToken(null);
    if (authSection) authSection.style.display = 'block';
    if (dashboardSection) dashboardSection.style.display = 'none';
  }
}

async function handleAdminLogin(e) {
  e.preventDefault();
  const form = e.target;
  const submitBtn = form.querySelector('button[type="submit"]');
  const email = form.querySelector('[name="email"]')?.value.trim();
  const password = form.querySelector('[name="password"]')?.value;

  if (!email || !password) {
    showToast('Please enter both email and password.', 'error');
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Verifying...';
  }

  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Authentication failed');
    }

    setAdminToken(data.token);
    showToast('Admin login successful!', 'success');
    form.reset();
    checkAdminAuth();
  } catch (err) {
    console.error('Login error:', err);
    showToast(err.message || 'Invalid email or password.', 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Sign In to Admin Portal';
    }
  }
}

async function handleAdminLogout() {
  const token = getAdminToken();
  if (token) {
    try {
      await fetch('/api/admin/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (e) {
      // Ignored
    }
  }
  setAdminToken(null);
  showToast('Logged out of Admin Portal.', 'info');
  checkAdminAuth();
}

function switchAdminTab(tabName) {
  currentAdminTab = tabName;
  const sections = ['overview', 'items', 'claims'];
  sections.forEach((sec) => {
    const el = document.getElementById(`tabSection-${sec}`);
    if (el) el.style.display = sec === tabName ? 'block' : 'none';
  });

  if (tabName === 'overview') loadAdminOverview();
  else if (tabName === 'items') loadAdminItems();
  else if (tabName === 'claims') loadAdminClaims();
}

async function loadAdminOverview() {
  const token = getAdminToken();
  if (!token) return;

  try {
    const res = await fetch('/api/admin/stats', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();

    if (data.success && data.stats) {
      const s = data.stats;
      document.getElementById('admStatLost').textContent = s.totalLost;
      document.getElementById('admStatFound').textContent = s.totalFound;
      document.getElementById('admStatActive').textContent = s.activeReports;
      document.getElementById('admStatReturned').textContent = s.returnedItems;
      document.getElementById('admStatPendingClaims').textContent = s.pendingClaims;
      document.getElementById('admStatMatches').textContent = s.totalMatches;

      // Render category breakdown
      const catBox = document.getElementById('adminCategoryBreakdown');
      if (catBox && s.categoryStats) {
        catBox.innerHTML = s.categoryStats.map((c) => {
          const icon = getCategoryIcon(c.category);
          return `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.6rem 0; border-bottom: 1px solid var(--border);">
              <span>${icon} <strong>${escapeHtml(c.category)}</strong></span>
              <span class="status-badge" style="background-color: var(--primary-light); color: var(--primary); font-weight: 700;">
                ${c.count} items
              </span>
            </div>
          `;
        }).join('');
      }
    }
  } catch (err) {
    console.error('Error loading admin overview:', err);
  }
}

async function loadAdminItems() {
  const token = getAdminToken();
  const tableBody = document.getElementById('adminItemsTableBody');
  if (!token || !tableBody) return;

  const type = document.getElementById('adminItemTypeFilter')?.value || 'all';
  const status = document.getElementById('adminItemStatusFilter')?.value || 'all';
  const search = document.getElementById('adminItemSearch')?.value.trim() || '';

  tableBody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 2rem;">Loading items...</td></tr>`;

  try {
    const params = new URLSearchParams();
    if (type !== 'all') params.append('type', type);
    if (status !== 'all') params.append('status', status);
    if (search) params.append('search', search);

    const res = await fetch(`/api/admin/items?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();

    if (!data.success || !data.items) {
      throw new Error(data.error || 'Failed to fetch items');
    }

    if (data.items.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 2rem; color: var(--text-muted);">No reports found matching the criteria.</td></tr>`;
      return;
    }

    tableBody.innerHTML = data.items.map((item) => {
      const icon = getCategoryIcon(item.category);
      const isLost = item.type === 'lost';
      return `
        <tr id="admin-row-${item.id}">
          <td>
            <strong>${escapeHtml(item.report_id)}</strong>
            <div style="font-size: 0.75rem; color: var(--text-subtle);">${formatDate(item.created_at)}</div>
          </td>
          <td>
            <span class="item-badge-type ${isLost ? 'lost' : 'found'}" style="font-size: 0.7rem; padding: 0.2rem 0.5rem;">
              ${isLost ? 'Lost' : 'Found'}
            </span>
          </td>
          <td>
            <div style="font-weight: 600; color: var(--text-main);">${escapeHtml(item.name)}</div>
            <div style="font-size: 0.8rem; color: var(--text-muted);">${icon} ${escapeHtml(item.category)} • 🎨 ${escapeHtml(item.color)}</div>
          </td>
          <td>
            <div style="font-size: 0.85rem;">📍 ${escapeHtml(item.location)}</div>
            <div style="font-size: 0.75rem; color: var(--text-subtle);">Date: ${formatDate(item.item_date)}</div>
          </td>
          <td>
            <div style="font-size: 0.85rem; font-weight: 600;">${escapeHtml(item.reporter_name)}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">✉️ ${escapeHtml(item.reporter_email)}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">📞 ${escapeHtml(item.reporter_phone || 'N/A')}</div>
          </td>
          <td>
            <select class="form-select form-select-sm" style="font-size: 0.8rem; padding: 0.3rem 0.5rem; width: auto;" onchange="updateItemStatus(${item.id}, this.value)">
              <option value="Active" ${item.status === 'Active' ? 'selected' : ''}>Active</option>
              <option value="Possible Match" ${item.status === 'Possible Match' ? 'selected' : ''}>Possible Match</option>
              <option value="Claimed" ${item.status === 'Claimed' ? 'selected' : ''}>Claimed</option>
              <option value="Found/Returned" ${item.status === 'Found/Returned' ? 'selected' : ''}>Found/Returned</option>
              <option value="Returned" ${item.status === 'Returned' ? 'selected' : ''}>Returned</option>
            </select>
          </td>
          <td style="white-space: nowrap;">
            <a href="/item.html?id=${item.report_id}" class="btn btn-secondary btn-sm" target="_blank" style="padding: 0.25rem 0.6rem; font-size: 0.75rem;">
              View
            </a>
            <button class="btn btn-danger btn-sm" style="padding: 0.25rem 0.6rem; font-size: 0.75rem; margin-left: 0.3rem;" onclick="deleteItemAsAdmin(${item.id}, '${escapeHtml(item.name)}')">
              Delete
            </button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Error in loadAdminItems:', err);
    tableBody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--status-rejected-text); padding: 2rem;">Error loading items.</td></tr>`;
  }
}

async function updateItemStatus(itemId, newStatus) {
  const token = getAdminToken();
  if (!token) return;

  try {
    const res = await fetch(`/api/items/${itemId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ status: newStatus })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to update status');
    }

    showToast(`Status updated to "${newStatus}"`, 'success');
  } catch (err) {
    console.error('Status update error:', err);
    showToast(err.message || 'Failed to update status', 'error');
    loadAdminItems();
  }
}

async function deleteItemAsAdmin(itemId, itemName) {
  if (!confirm(`Are you sure you want to permanently delete "${itemName}"? This action cannot be undone.`)) {
    return;
  }

  const token = getAdminToken();
  if (!token) return;

  try {
    const res = await fetch(`/api/items/${itemId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to delete item');
    }

    showToast('Report deleted successfully', 'success');
    loadAdminItems();
    loadAdminOverview();
  } catch (err) {
    console.error('Delete item error:', err);
    showToast(err.message || 'Failed to delete report', 'error');
  }
}

async function loadAdminClaims() {
  const token = getAdminToken();
  const container = document.getElementById('adminClaimsContainer');
  if (!token || !container) return;

  const status = document.getElementById('adminClaimStatusFilter')?.value || 'all';

  container.innerHTML = `<div class="empty-state"><div class="empty-title">Loading claims...</div></div>`;

  try {
    const params = new URLSearchParams();
    if (status !== 'all') params.append('status', status);

    const res = await fetch(`/api/admin/claims?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();

    if (!data.success || !data.claims) {
      throw new Error(data.error || 'Failed to fetch claims');
    }

    if (data.claims.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">✓</div>
          <div class="empty-title">No claims found</div>
          <p class="empty-desc">There are no ownership claims matching your current filter.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = data.claims.map((claim) => {
      const isPending = claim.status === 'Pending';
      return `
        <div class="stat-card" style="display: block; margin-bottom: 1.25rem;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
            <div>
              <span class="status-badge ${claim.status.toLowerCase()}">${claim.status}</span>
              <span style="font-size: 0.8rem; color: var(--text-muted); margin-left: 0.5rem;">
                Filed on: ${formatDate(claim.created_at)}
              </span>
            </div>
            <div>
              <a href="/item.html?id=${claim.item_report_id || claim.item_id}" class="btn btn-secondary btn-sm" target="_blank">
                View Item: ${escapeHtml(claim.item_name)} (${claim.item_report_id}) →
              </a>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1.5fr; gap: 1.5rem; margin-top: 1rem;">
            <div style="background-color: var(--bg-page); padding: 1rem; border-radius: var(--radius-sm); border: 1px solid var(--border);">
              <h4 style="font-size: 0.9rem; font-weight: 700; color: var(--primary); margin-bottom: 0.5rem;">Claimant Details</h4>
              <p style="font-size: 0.9rem; font-weight: 600;">${escapeHtml(claim.claimant_name)}</p>
              <p style="font-size: 0.85rem; color: var(--text-muted);">✉️ ${escapeHtml(claim.claimant_email)}</p>
              <p style="font-size: 0.85rem; color: var(--text-muted);">📞 ${escapeHtml(claim.claimant_phone)}</p>
            </div>

            <div style="background-color: var(--bg-page); padding: 1rem; border-radius: var(--radius-sm); border: 1px solid var(--border);">
              <h4 style="font-size: 0.9rem; font-weight: 700; color: var(--primary); margin-bottom: 0.5rem;">Ownership Explanation & Proof</h4>
              <p style="font-size: 0.9rem; color: var(--text-main); margin-bottom: 0.5rem; line-height: 1.5;">
                "${escapeHtml(claim.explanation)}"
              </p>
              ${claim.proof ? `
                <div style="font-size: 0.85rem; color: var(--text-muted); border-top: 1px dashed var(--border); padding-top: 0.5rem; margin-top: 0.5rem;">
                  <strong>Identifying Proof:</strong> ${escapeHtml(claim.proof)}
                </div>
              ` : ''}
            </div>
          </div>

          ${isPending ? `
            <div style="display: flex; justify-content: flex-end; gap: 0.75rem; margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border);">
              <button class="btn btn-danger btn-sm" onclick="resolveClaim(${claim.id}, 'Rejected')">
                ✕ Reject Claim
              </button>
              <button class="btn btn-success btn-sm" onclick="resolveClaim(${claim.id}, 'Approved')">
                ✓ Approve Claim (Mark Item as Claimed)
              </button>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('Error loading claims:', err);
    container.innerHTML = `<div class="empty-state"><div class="empty-title">Failed to load claims.</div></div>`;
  }
}

async function resolveClaim(claimId, newStatus) {
  const token = getAdminToken();
  if (!token) return;

  const confirmMsg = newStatus === 'Approved'
    ? 'Approve this ownership claim? This will verify the claimant and update the item status to Claimed.'
    : 'Reject this claim?';

  if (!confirm(confirmMsg)) return;

  try {
    const res = await fetch(`/api/claims/${claimId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ status: newStatus, markItemStatus: newStatus === 'Approved' ? 'Claimed' : undefined })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to update claim');
    }

    showToast(`Claim marked as ${newStatus}`, 'success');
    loadAdminClaims();
    loadAdminOverview();
  } catch (err) {
    console.error('Error resolving claim:', err);
    showToast(err.message || 'Failed to update claim', 'error');
  }
}
