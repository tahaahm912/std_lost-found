/**
 * Student Lost & Found - Items Listing, Search, and Filter JavaScript
 */

let allItems = [];
let currentItemType = 'all';

document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('itemsContainer');
  if (!container) return;

  currentItemType = container.getAttribute('data-item-type') || 'all';

  // Setup search & filter listeners
  const searchInput = document.getElementById('searchInput');
  const categoryFilter = document.getElementById('categoryFilter');
  const locationFilter = document.getElementById('locationFilter');
  const dateFilter = document.getElementById('dateFilter');
  const sortSelect = document.getElementById('sortSelect');
  const resetBtn = document.getElementById('resetFilters');

  if (searchInput) {
    let debounceTimer;
    searchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(fetchAndRenderItems, 250);
    });
  }

  if (categoryFilter) categoryFilter.addEventListener('change', fetchAndRenderItems);
  if (locationFilter) locationFilter.addEventListener('change', fetchAndRenderItems);
  if (dateFilter) dateFilter.addEventListener('change', fetchAndRenderItems);
  if (sortSelect) sortSelect.addEventListener('change', fetchAndRenderItems);

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      if (categoryFilter) categoryFilter.value = 'all';
      if (locationFilter) locationFilter.value = 'all';
      if (dateFilter) dateFilter.value = 'all';
      if (sortSelect) sortSelect.value = 'newest';
      fetchAndRenderItems();
    });
  }

  // Initial load
  fetchAndRenderItems();
});

async function fetchAndRenderItems() {
  const container = document.getElementById('itemsContainer');
  const countBadge = document.getElementById('itemCountBadge');
  if (!container) return;

  // Read filter values
  const search = document.getElementById('searchInput')?.value.trim() || '';
  const category = document.getElementById('categoryFilter')?.value || 'all';
  const location = document.getElementById('locationFilter')?.value || 'all';
  const dateVal = document.getElementById('dateFilter')?.value || 'all';
  const sort = document.getElementById('sortSelect')?.value || 'newest';

  container.innerHTML = `
    <div class="empty-state" style="grid-column: 1 / -1;">
      <div class="empty-icon">⏳</div>
      <div class="empty-title">Loading reports...</div>
      <p class="empty-desc">Searching the campus registry...</p>
    </div>
  `;

  try {
    const params = new URLSearchParams();
    if (currentItemType !== 'all') params.append('type', currentItemType);
    if (category !== 'all') params.append('category', category);
    if (location !== 'all') params.append('location', location);
    if (dateVal !== 'all') params.append('dateFilter', dateVal);
    if (search) params.append('search', search);
    if (sort) params.append('sort', sort);

    const res = await fetch(`/api/items?${params.toString()}`);
    const data = await res.json();

    if (!data.success) {
      throw new Error(data.error || 'Failed to fetch items');
    }

    allItems = data.items || [];

    // Populate locations dropdown if not already populated
    populateLocationDropdown(allItems);

    if (countBadge) {
      countBadge.textContent = `${allItems.length} ${allItems.length === 1 ? 'Report' : 'Reports'}`;
    }

    if (allItems.length === 0) {
      const typeLabel = currentItemType === 'lost' ? 'lost' : currentItemType === 'found' ? 'found' : '';
      container.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <div class="empty-icon">🔍</div>
          <div class="empty-title">No ${typeLabel} items found</div>
          <p class="empty-desc">There are no reports matching your current search criteria. Try adjusting your filters or submit a new report.</p>
          <div style="display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap;">
            <a href="${currentItemType === 'lost' ? '/report-lost.html' : '/report-found.html'}" class="btn btn-primary btn-sm">
              ${currentItemType === 'lost' ? '+ Report a Lost Item' : '+ Report a Found Item'}
            </a>
            <button class="btn btn-secondary btn-sm" onclick="document.getElementById('resetFilters')?.click()">Reset Filters</button>
          </div>
        </div>
      `;
      return;
    }

    // Render cards
    container.innerHTML = allItems.map(renderItemCard).join('');
  } catch (err) {
    console.error('Error loading items:', err);
    container.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <div class="empty-icon">⚠️</div>
        <div class="empty-title">Unable to load items</div>
        <p class="empty-desc">An error occurred while communicating with the database. Please refresh the page.</p>
        <button class="btn btn-secondary btn-sm" onclick="fetchAndRenderItems()">Try Again</button>
      </div>
    `;
  }
}

function renderItemCard(item) {
  const icon = getCategoryIcon(item.category);
  const formattedDate = formatDate(item.item_date);
  const statusBadge = renderStatusBadge(item.status);
  const typeBadgeClass = item.type === 'lost' ? 'lost' : 'found';
  const typeLabel = item.type === 'lost' ? 'Lost' : 'Found';

  const mediaContent = item.image
    ? `<img src="${item.image}" alt="${escapeHtml(item.name)}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\\'item-placeholder-icon\\'>${icon}</div>'">`
    : `<div class="item-placeholder-icon">${icon}</div>`;

  return `
    <article class="item-card" id="card-${item.id}">
      <div class="item-card-media">
        ${mediaContent}
        <span class="item-badge-type ${typeBadgeClass}">${typeLabel}</span>
      </div>
      <div class="item-card-body">
        <div class="item-header">
          <h3 class="item-title">${escapeHtml(item.name)}</h3>
          <span style="font-size: 0.8rem; font-weight: 600; color: var(--primary);">${icon} ${escapeHtml(item.category)}</span>
        </div>
        <div class="item-meta">
          <div class="item-meta-row">
            <span>📍</span> <strong>${escapeHtml(item.location)}</strong>
          </div>
          <div class="item-meta-row">
            <span>📅</span> <span>${formattedDate}</span>
            <span style="margin: 0 4px;">•</span>
            <span>🎨</span> <span>${escapeHtml(item.color)}</span>
          </div>
        </div>
        <p class="item-desc-snippet">${escapeHtml(item.description)}</p>
        <div class="item-card-footer">
          <div>${statusBadge}</div>
          <a href="/item.html?id=${item.report_id || item.id}" class="btn btn-secondary btn-sm">
            View Details →
          </a>
        </div>
      </div>
    </article>
  `;
}

function populateLocationDropdown(items) {
  const select = document.getElementById('locationFilter');
  if (!select || select.dataset.populated === 'true') return;

  const currentVal = select.value;
  const locations = new Set();
  items.forEach((item) => {
    if (item.location) locations.add(item.location.trim());
  });

  const sortedLocations = Array.from(locations).sort();
  // Keep the first "All Locations" option
  select.innerHTML = '<option value="all">All Locations</option>';
  sortedLocations.forEach((loc) => {
    const opt = document.createElement('option');
    opt.value = loc;
    opt.textContent = loc;
    select.appendChild(opt);
  });

  select.value = currentVal;
  select.dataset.populated = 'true';
}
