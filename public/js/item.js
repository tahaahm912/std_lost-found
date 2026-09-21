/**
 * Student Lost & Found - Single Item Details, Claims & Matches JavaScript
 */

let currentItem = null;

document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const itemId = urlParams.get('id');

  if (!itemId) {
    showItemNotFound('No report ID was specified.');
    return;
  }

  loadItemDetails(itemId);
  setupClaimModal();
});

async function loadItemDetails(itemId) {
  const container = document.getElementById('itemDetailContainer');
  if (!container) return;

  try {
    const res = await fetch(`/api/items/${itemId}`);
    const data = await res.json();

    if (!data.success || !data.item) {
      showItemNotFound(data.error || 'The requested item was not found in the campus database.');
      return;
    }

    currentItem = data.item;
    renderItemDetails(currentItem);

    // Fetch and render matches
    loadItemMatches(currentItem.id || currentItem.report_id);
  } catch (err) {
    console.error('Error loading item:', err);
    showItemNotFound('Failed to connect to the database server. Please try again later.');
  }
}

function showItemNotFound(message) {
  const container = document.getElementById('itemDetailContainer');
  if (!container) return;

  container.innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">⚠️</div>
      <div class="empty-title">Report Not Found</div>
      <p class="empty-desc">${escapeHtml(message)}</p>
      <div style="display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap;">
        <a href="/lost.html" class="btn btn-primary btn-sm">Browse Lost Items</a>
        <a href="/found.html" class="btn btn-secondary btn-sm">Browse Found Items</a>
        <a href="/" class="btn btn-secondary btn-sm">Return Home</a>
      </div>
    </div>
  `;
}

function renderItemDetails(item) {
  const container = document.getElementById('itemDetailContainer');
  if (!container) return;

  const icon = getCategoryIcon(item.category);
  const formattedDate = formatDate(item.item_date);
  const statusBadge = renderStatusBadge(item.status);
  const typeLabel = item.type === 'lost' ? 'Lost Item' : 'Found Item';
  const typeBadgeClass = item.type === 'lost' ? 'lost' : 'found';

  // Set page title
  document.title = `${item.name} (${item.report_id}) | Student Lost & Found`;

  const mediaHtml = item.image
    ? `<img src="${item.image}" alt="${escapeHtml(item.name)}" onerror="this.parentElement.innerHTML='<div class=\\'item-placeholder-icon\\'>${icon}</div>'">`
    : `<div class="item-placeholder-icon" style="font-size: 5rem;">${icon}</div>`;

  const isFound = item.type === 'found';

  container.innerHTML = `
    <div style="margin-bottom: 1.5rem;">
      <a href="${isFound ? '/found.html' : '/lost.html'}" class="btn btn-secondary btn-sm" style="display: inline-flex; align-items: center; gap: 0.4rem;">
        ← Back to ${isFound ? 'Found Items' : 'Lost Items'}
      </a>
    </div>

    <div class="detail-layout">
      <!-- Media column -->
      <div>
        <div class="detail-gallery">
          ${mediaHtml}
        </div>
        <div style="margin-top: 1rem; display: flex; align-items: center; justify-content: space-between; font-size: 0.85rem; color: var(--text-muted);">
          <span>Report ID: <strong>${escapeHtml(item.report_id)}</strong></span>
          <span>Logged: ${formatDate(item.created_at)}</span>
        </div>
      </div>

      <!-- Info column -->
      <div class="detail-info-card">
        <div style="display: flex; gap: 0.5rem; align-items: center; margin-bottom: 0.75rem; flex-wrap: wrap;">
          <span class="item-badge-type ${typeBadgeClass}">${typeLabel}</span>
          ${statusBadge}
          <span style="font-size: 0.8rem; font-weight: 600; color: var(--primary);">
            ${icon} ${escapeHtml(item.category)}
          </span>
        </div>

        <h1 style="font-size: 1.75rem; font-weight: 800; color: var(--text-main); margin-bottom: 1rem; line-height: 1.25;">
          ${escapeHtml(item.name)}
        </h1>

        <div class="detail-specs-grid">
          <div class="spec-item">
            <span class="spec-label">Location ${item.type === 'lost' ? 'Lost' : 'Found'}</span>
            <span class="spec-value">📍 ${escapeHtml(item.location)}</span>
          </div>
          <div class="spec-item">
            <span class="spec-label">Date ${item.type === 'lost' ? 'Lost' : 'Found'}</span>
            <span class="spec-value">📅 ${formattedDate}</span>
          </div>
          <div class="spec-item">
            <span class="spec-label">Dominant Color</span>
            <span class="spec-value">🎨 ${escapeHtml(item.color)}</span>
          </div>
          <div class="spec-item">
            <span class="spec-label">Category</span>
            <span class="spec-value">${icon} ${escapeHtml(item.category)}</span>
          </div>
        </div>

        <div style="margin-bottom: 1.5rem;">
          <h3 style="font-size: 0.95rem; font-weight: 700; color: var(--text-main); margin-bottom: 0.5rem;">Description & Notes</h3>
          <p style="color: var(--text-muted); line-height: 1.6; background-color: var(--bg-page); padding: 1rem; border-radius: var(--radius-sm); border: 1px solid var(--border);">
            ${escapeHtml(item.description)}
          </p>
        </div>

        <!-- Privacy and Action Box -->
        <div style="background-color: var(--primary-light); border: 1px solid #bfdbfe; border-radius: var(--radius-md); padding: 1.25rem; margin-bottom: 1.5rem;">
          <div style="font-size: 0.85rem; color: #1e40af; margin-bottom: 0.75rem;">
            🔒 <strong>Student Privacy Notice:</strong> Contact details are shielded for campus security. If this item is yours or you have verified information, submit a claim below.
          </div>

          ${isFound ? `
            <button id="openClaimModalBtn" class="btn btn-primary" style="width: 100%;">
              ✋ I Think This Is My Item (Submit Claim)
            </button>
          ` : `
            <button id="openLostContactModalBtn" class="btn btn-accent" style="width: 100%;">
              💡 I Found This Item / Have Clues
            </button>
          `}
        </div>

        <div style="font-size: 0.8rem; color: var(--text-subtle); display: flex; justify-content: space-between;">
          <span>Reported by: ${escapeHtml(item.reporter_name || 'Campus Student/Staff')}</span>
          <span>Status: ${escapeHtml(item.status)}</span>
        </div>
      </div>
    </div>

    <!-- Automatic Matching Section -->
    <div class="matching-box" id="matchesContainer" style="display: none;">
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
        <div>
          <h3 style="font-size: 1.2rem; font-weight: 700; color: #92400e; display: flex; align-items: center; gap: 0.5rem;">
            ⚡ Possible Matches Found in Registry
          </h3>
          <p style="font-size: 0.875rem; color: #78350f; margin-top: 0.2rem;">
            Our automated campus matching algorithm compared category, keywords, color, location, and dates.
          </p>
        </div>
        <span class="match-score-badge" id="matchCountBadge">0 Potential Matches</span>
      </div>
      <div class="matching-list" id="matchesList"></div>
    </div>
  `;

  // Attach action button listener
  const claimBtn = document.getElementById('openClaimModalBtn');
  if (claimBtn) {
    claimBtn.addEventListener('click', () => openClaimModal(item));
  }

  const lostContactBtn = document.getElementById('openLostContactModalBtn');
  if (lostContactBtn) {
    lostContactBtn.addEventListener('click', () => openClaimModal(item, true));
  }
}

async function loadItemMatches(itemId) {
  try {
    const res = await fetch(`/api/matches/${itemId}`);
    const data = await res.json();

    const container = document.getElementById('matchesContainer');
    const list = document.getElementById('matchesList');
    const badge = document.getElementById('matchCountBadge');

    if (!container || !list) return;

    if (data.success && data.matches && data.matches.length > 0) {
      container.style.display = 'block';
      if (badge) badge.textContent = `${data.matches.length} Possible ${data.matches.length === 1 ? 'Match' : 'Matches'}`;

      list.innerHTML = data.matches.map((m) => {
        const icon = getCategoryIcon(m.category);
        return `
          <div class="match-item-card">
            <div style="display: flex; align-items: center; gap: 1rem;">
              <span style="font-size: 2rem;">${icon}</span>
              <div>
                <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.2rem;">
                  <h4 style="font-size: 1rem; font-weight: 700;">${escapeHtml(m.name)}</h4>
                  <span class="item-badge-type ${m.type === 'lost' ? 'lost' : 'found'}" style="font-size: 0.7rem; padding: 0.15rem 0.5rem;">
                    ${m.type === 'lost' ? 'Reported Lost' : 'Reported Found'}
                  </span>
                </div>
                <div style="font-size: 0.8125rem; color: var(--text-muted);">
                  📍 ${escapeHtml(m.location)} • 📅 ${formatDate(m.item_date)} • 🎨 ${escapeHtml(m.color)}
                </div>
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 1rem;">
              <div style="text-align: right;">
                <span class="match-score-badge" style="font-size: 0.85rem;">⚡ ${m.match_score}% Match</span>
              </div>
              <a href="/item.html?id=${m.report_id || m.id}" class="btn btn-secondary btn-sm" target="_blank">
                Compare →
              </a>
            </div>
          </div>
        `;
      }).join('');
    } else {
      container.style.display = 'none';
    }
  } catch (err) {
    console.warn('Failed to fetch matches:', err);
  }
}

// Modal handling
function setupClaimModal() {
  const backdrop = document.getElementById('claimModalBackdrop');
  const closeBtn = document.getElementById('closeClaimModalBtn');
  const cancelBtn = document.getElementById('cancelClaimModalBtn');
  const form = document.getElementById('claimForm');

  if (!backdrop) return;

  function closeModal() {
    backdrop.classList.remove('open');
  }

  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeModal();
  });

  if (form) {
    form.addEventListener('submit', handleClaimSubmit);
  }
}

function openClaimModal(item, isLostItemTip = false) {
  const backdrop = document.getElementById('claimModalBackdrop');
  const modalTitle = document.getElementById('claimModalTitle');
  const itemIdInput = document.getElementById('claimItemId');
  const itemInfoText = document.getElementById('claimItemInfoText');
  const explLabel = document.getElementById('claimExplanationLabel');

  if (!backdrop || !item) return;

  if (itemIdInput) itemIdInput.value = item.id;
  if (itemInfoText) {
    itemInfoText.textContent = `Filing report for: "${item.name}" (${item.report_id})`;
  }

  if (modalTitle) {
    modalTitle.textContent = isLostItemTip ? 'Submit Information or Clue' : 'Submit Ownership Claim';
  }

  if (explLabel) {
    explLabel.textContent = isLostItemTip
      ? 'Where did you find it or what details do you have? *'
      : 'Explain why this item belongs to you (provide unique details) *';
  }

  backdrop.classList.add('open');
}

async function handleClaimSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const submitBtn = form.querySelector('button[type="submit"]');
  const originalText = submitBtn ? submitBtn.innerHTML : 'Submit Claim';

  const itemId = form.querySelector('[name="item_id"]')?.value;
  const name = form.querySelector('[name="claimant_name"]')?.value.trim();
  const email = form.querySelector('[name="claimant_email"]')?.value.trim();
  const phone = form.querySelector('[name="claimant_phone"]')?.value.trim();
  const explanation = form.querySelector('[name="explanation"]')?.value.trim();
  const proof = form.querySelector('[name="proof"]')?.value.trim();

  if (!itemId || !name || !email || !phone || !explanation) {
    showToast('Please complete all required fields.', 'error');
    return;
  }

  if (explanation.length < 10) {
    showToast('Please provide a more detailed explanation (at least 10 characters).', 'error');
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = 'Submitting claim...';
  }

  try {
    const res = await fetch('/api/claims', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        item_id: Number(itemId),
        claimant_name: name,
        claimant_email: email,
        claimant_phone: phone,
        explanation,
        proof
      })
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to submit claim');
    }

    showToast('Your claim has been submitted! Campus staff will review it.', 'success');
    form.reset();
    document.getElementById('claimModalBackdrop')?.classList.remove('open');

    // Refresh item details
    if (currentItem) {
      loadItemDetails(currentItem.id || currentItem.report_id);
    }
  } catch (err) {
    console.error('Claim submission error:', err);
    showToast(err.message || 'Error submitting claim.', 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalText;
    }
  }
}
