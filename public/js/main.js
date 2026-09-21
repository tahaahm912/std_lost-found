/**
 * Student Lost & Found - Main Utility and Navigation JavaScript
 */

// Mobile Navigation Toggle
document.addEventListener('DOMContentLoaded', () => {
  const navToggle = document.getElementById('navToggle');
  const mainNav = document.getElementById('mainNav');

  if (navToggle && mainNav) {
    navToggle.addEventListener('click', () => {
      mainNav.classList.toggle('open');
      const isOpen = mainNav.classList.contains('open');
      navToggle.setAttribute('aria-expanded', isOpen);
    });
  }

  // Highlight active nav item
  const currentPath = window.location.pathname;
  const navLinks = document.querySelectorAll('.nav-link');
  navLinks.forEach((link) => {
    const href = link.getAttribute('href');
    if (href === currentPath || (currentPath.endsWith(href) && href !== '/')) {
      link.classList.add('active');
    }
  });

  // Check if there are public stats on this page
  if (document.getElementById('statTotalLost')) {
    loadPublicStats();
  }
});

// Category Icons Mapping
const CATEGORY_ICONS = {
  'Electronics': '📱',
  'Wallet/Purse': '👛',
  'ID/Card': '🪪',
  'Keys': '🔑',
  'Books/Notes': '📚',
  'Clothing': '👕',
  'Accessories': '🕶️',
  'Documents': '📄',
  'Bags': '🎒',
  'Other': '📦'
};

function getCategoryIcon(cat) {
  return CATEGORY_ICONS[cat] || '📦';
}

// Format Date string
function formatDate(dateStr) {
  if (!dateStr) return 'Unknown date';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch (e) {
    return dateStr;
  }
}

// Escape HTML for XSS prevention
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Toast Notifications
function showToast(message, type = 'success') {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let icon = '✓';
  if (type === 'error') icon = '✕';
  if (type === 'info') icon = 'ℹ';

  toast.innerHTML = `<span><strong>${icon}</strong></span> <span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  // Trigger animation
  setTimeout(() => toast.classList.add('show'), 10);

  // Auto remove
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Render Status Badge
function renderStatusBadge(status) {
  let badgeClass = 'active';
  let label = status || 'Active';

  if (status === 'Possible Match') {
    badgeClass = 'match';
    label = '⚡ Possible Match';
  } else if (status === 'Claimed') {
    badgeClass = 'claimed';
    label = '🔒 Claimed';
  } else if (status === 'Returned' || status === 'Found/Returned') {
    badgeClass = 'returned';
    label = '✓ Returned';
  } else if (status === 'Rejected') {
    badgeClass = 'rejected';
    label = '✕ Rejected';
  } else {
    label = '● Active';
  }

  return `<span class="status-badge ${badgeClass}">${label}</span>`;
}

// Load Public Stats
async function loadPublicStats() {
  try {
    const res = await fetch('/api/stats');
    const data = await res.json();
    if (data.success) {
      const { stats } = data;
      const elLost = document.getElementById('statTotalLost');
      const elFound = document.getElementById('statTotalFound');
      const elReturned = document.getElementById('statTotalReturned');
      const elActive = document.getElementById('statActiveReports');

      if (elLost) elLost.textContent = stats.totalLost;
      if (elFound) elFound.textContent = stats.totalFound;
      if (elReturned) elReturned.textContent = stats.returnedItems;
      if (elActive) elActive.textContent = stats.activeReports;
    }
  } catch (err) {
    console.warn('Could not load statistics:', err);
  }
}
