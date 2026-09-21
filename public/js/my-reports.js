/**
 * Student Lost & Found - My Reports Self-Service Lookup JavaScript
 */

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('myReportsForm');
  const input = document.getElementById('myReportQuery');
  const container = document.getElementById('myReportsResults');

  // Check URL params for query (e.g. ?query=alex.rivera@student.campus.edu)
  const urlParams = new URLSearchParams(window.location.search);
  const initialQuery = urlParams.get('query') || urlParams.get('email') || urlParams.get('id');

  if (initialQuery && input) {
    input.value = initialQuery;
    performLookup(initialQuery);
  }

  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const query = input.value.trim();
      if (!query) {
        showToast('Please enter an email address or Report ID.', 'error');
        return;
      }
      performLookup(query);
    });
  }
});

async function performLookup(query) {
  const container = document.getElementById('myReportsResults');
  const countBadge = document.getElementById('resultsCountBadge');
  if (!container) return;

  container.innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">⏳</div>
      <div class="empty-title">Searching reports...</div>
      <p class="empty-desc">Finding records associated with "${escapeHtml(query)}"...</p>
    </div>
  `;

  try {
    const res = await fetch(`/api/reports/my?query=${encodeURIComponent(query)}`);
    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to locate reports');
    }

    const reports = data.reports || [];

    if (countBadge) {
      countBadge.textContent = `${reports.length} ${reports.length === 1 ? 'Report Found' : 'Reports Found'}`;
      countBadge.style.display = 'inline-block';
    }

    if (reports.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🔍</div>
          <div class="empty-title">No matching reports found</div>
          <p class="empty-desc">No lost or found items were found matching "${escapeHtml(query)}". Please verify your university email or report ID format (e.g. LOST-123456 or FOUND-123456).</p>
          <div style="display: flex; gap: 1rem; justify-content: center;">
            <a href="/report-lost.html" class="btn btn-primary btn-sm">Report Lost Item</a>
            <a href="/report-found.html" class="btn btn-secondary btn-sm">Report Found Item</a>
          </div>
        </div>
      `;
      return;
    }

    container.innerHTML = reports.map(renderMyReportCard).join('');
  } catch (err) {
    console.error('My reports lookup error:', err);
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <div class="empty-title">Lookup Failed</div>
        <p class="empty-desc">${escapeHtml(err.message || 'Unable to retrieve your reports at this time.')}</p>
      </div>
    `;
  }
}

function renderMyReportCard(report) {
  const icon = getCategoryIcon(report.category);
  const formattedDate = formatDate(report.item_date);
  const statusBadge = renderStatusBadge(report.status);
  const isLost = report.type === 'lost';
  const typeBadgeClass = isLost ? 'lost' : 'found';

  // Matches list
  let matchesHtml = '';
  if (report.matches && report.matches.length > 0) {
    matchesHtml = `
      <div style="margin-top: 1.25rem; background-color: #fffbeb; border: 1px solid #fde68a; border-radius: var(--radius-md); padding: 1rem;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem;">
          <span style="font-weight: 700; color: #92400e; font-size: 0.9rem;">
            ⚡ ${report.matches.length} Potential ${report.matches.length === 1 ? 'Match' : 'Matches'} Detected
          </span>
        </div>
        <div style="display: flex; flex-direction: column; gap: 0.5rem;">
          ${report.matches.slice(0, 3).map((m) => `
            <div style="display: flex; justify-content: space-between; align-items: center; background: white; padding: 0.5rem 0.75rem; border-radius: var(--radius-sm); border: 1px solid #fef3c7;">
              <span style="font-size: 0.85rem; font-weight: 600;">${getCategoryIcon(m.category)} ${escapeHtml(m.name)} (📍 ${escapeHtml(m.location)})</span>
              <div style="display: flex; align-items: center; gap: 0.5rem;">
                <span class="match-score-badge">${m.match_score}% Match</span>
                <a href="/item.html?id=${m.report_id || m.id}" class="btn btn-secondary btn-sm" style="padding: 0.2rem 0.5rem; font-size: 0.75rem;" target="_blank">View →</a>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // Claims list
  let claimsHtml = '';
  if (report.claims && report.claims.length > 0) {
    claimsHtml = `
      <div style="margin-top: 1rem; background-color: var(--primary-light); border: 1px solid #bfdbfe; border-radius: var(--radius-md); padding: 1rem;">
        <span style="font-weight: 700; color: #1e40af; font-size: 0.9rem;">
          📋 ${report.claims.length} Ownership Claim(s) Filed on This Item
        </span>
        <div style="display: flex; flex-direction: column; gap: 0.5rem; margin-top: 0.5rem;">
          ${report.claims.map((c) => `
            <div style="display: flex; justify-content: space-between; align-items: center; background: white; padding: 0.5rem 0.75rem; border-radius: var(--radius-sm); border: 1px solid #dbeafe;">
              <div style="font-size: 0.85rem;">
                <strong>Claimant:</strong> ${escapeHtml(c.claimant_name)} • <em>"${escapeHtml(c.explanation.slice(0, 60))}..."</em>
              </div>
              <div>
                <span class="status-badge ${c.status.toLowerCase()}">${c.status}</span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  return `
    <div class="stat-card" style="display: block; margin-bottom: 1.5rem; border-left: 4px solid var(--primary);">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap;">
        <div>
          <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.35rem;">
            <span class="item-badge-type ${typeBadgeClass}">${isLost ? 'Lost Item' : 'Found Item'}</span>
            ${statusBadge}
            <span style="font-weight: 700; color: var(--primary); font-size: 0.95rem;">${escapeHtml(report.report_id)}</span>
          </div>
          <h3 style="font-size: 1.25rem; font-weight: 700; color: var(--text-main); margin-bottom: 0.25rem;">
            ${icon} ${escapeHtml(report.name)}
          </h3>
          <div style="font-size: 0.85rem; color: var(--text-muted);">
            📍 ${escapeHtml(report.location)} • 📅 ${formattedDate} • 🎨 ${escapeHtml(report.color)}
          </div>
        </div>

        <div style="text-align: right;">
          <a href="/item.html?id=${report.report_id || report.id}" class="btn btn-secondary btn-sm">
            View Full Report →
          </a>
        </div>
      </div>

      <p style="margin-top: 0.75rem; font-size: 0.9rem; color: var(--text-muted); line-height: 1.5; background: var(--bg-page); padding: 0.75rem; border-radius: var(--radius-sm);">
        ${escapeHtml(report.description)}
      </p>

      ${matchesHtml}
      ${claimsHtml}
    </div>
  `;
}
