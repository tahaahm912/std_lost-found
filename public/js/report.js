/**
 * Student Lost & Found - Item Report Submission JavaScript
 * Handles validation, image upload preview, and AJAX submission
 */

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('reportForm');
  if (!form) return;

  const reportType = form.getAttribute('data-type') || 'lost';

  // Set default date to today
  const dateInput = document.getElementById('item_date');
  if (dateInput && !dateInput.value) {
    const today = new Date().toISOString().split('T')[0];
    dateInput.value = today;
    dateInput.max = today; // Cannot report something lost in the future
  }

  // Setup Image Drag & Drop and Preview
  setupImageUploader();

  // Form submission
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await handleFormSubmission(form, reportType);
  });
});

function setupImageUploader() {
  const dropZone = document.getElementById('imageDropZone');
  const fileInput = document.getElementById('imageFile');
  const previewWrapper = document.getElementById('imagePreviewWrapper');
  const previewThumb = document.getElementById('previewThumb');
  const removeBtn = document.getElementById('removeImageBtn');

  if (!dropZone || !fileInput) return;

  // Drag over / leave effects
  ['dragenter', 'dragover'].forEach((eventName) => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach((eventName) => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove('dragover');
    });
  });

  dropZone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files && files.length > 0) {
      fileInput.files = files;
      handleFileSelected(files[0]);
    }
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files.length > 0) {
      handleFileSelected(fileInput.files[0]);
    }
  });

  if (removeBtn) {
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      fileInput.value = '';
      if (previewWrapper) previewWrapper.style.display = 'none';
    });
  }

  function handleFileSelected(file) {
    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      showToast('Image file size must be less than 5MB.', 'error');
      fileInput.value = '';
      if (previewWrapper) previewWrapper.style.display = 'none';
      return;
    }

    // Validate type
    if (!file.type.match(/^image\/(jpeg|png|webp|gif)$/i)) {
      showToast('Please select a valid image file (JPG, PNG, WEBP, GIF).', 'error');
      fileInput.value = '';
      if (previewWrapper) previewWrapper.style.display = 'none';
      return;
    }

    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => {
      if (previewThumb) previewThumb.src = e.target.result;
      if (previewWrapper) previewWrapper.style.display = 'flex';
    };
    reader.readAsDataURL(file);
  }
}

async function handleFormSubmission(form, reportType) {
  const submitBtn = form.querySelector('button[type="submit"]');
  const originalBtnText = submitBtn ? submitBtn.innerHTML : 'Submit Report';

  // Basic Validation
  const name = form.querySelector('[name="name"]')?.value.trim();
  const category = form.querySelector('[name="category"]')?.value.trim();
  const description = form.querySelector('[name="description"]')?.value.trim();
  const color = form.querySelector('[name="color"]')?.value.trim();
  const location = form.querySelector('[name="location"]')?.value.trim();
  const itemDate = form.querySelector('[name="item_date"]')?.value.trim();

  // Contact fields (can be reporter_* or finder_* or contact_*)
  const contactName = (form.querySelector('[name="contact_name"]') || form.querySelector('[name="finder_name"]') || form.querySelector('[name="reporter_name"]'))?.value.trim();
  const contactEmail = (form.querySelector('[name="contact_email"]') || form.querySelector('[name="finder_email"]') || form.querySelector('[name="reporter_email"]'))?.value.trim();

  if (!name || !category || !description || !color || !location || !itemDate || !contactName || !contactEmail) {
    showToast('Please fill out all required fields marked with *', 'error');
    return;
  }

  if (!contactEmail.includes('@') || !contactEmail.includes('.')) {
    showToast('Please enter a valid email address.', 'error');
    return;
  }

  // Set loading state
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '⏳ Submitting report...';
  }

  try {
    const formData = new FormData(form);
    const endpoint = reportType === 'lost' ? '/api/items/lost' : '/api/items/found';

    const res = await fetch(endpoint, {
      method: 'POST',
      body: formData
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to submit report');
    }

    // Display Success Screen
    displaySuccessScreen(data, reportType);
    showToast('Report submitted successfully!', 'success');
  } catch (err) {
    console.error('Submission error:', err);
    showToast(err.message || 'Submission failed. Please try again.', 'error');
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtnText;
    }
  }
}

function displaySuccessScreen(data, reportType) {
  const formCard = document.getElementById('formCard');
  const successCard = document.getElementById('successCard');

  if (!formCard || !successCard) return;

  formCard.style.display = 'none';
  successCard.style.display = 'block';

  // Fill report data
  const reportIdEl = document.getElementById('successReportId');
  const itemNameEl = document.getElementById('successItemName');
  const viewReportLink = document.getElementById('viewReportLink');
  const matchesSection = document.getElementById('successMatchesSection');
  const matchesList = document.getElementById('successMatchesList');

  if (reportIdEl) reportIdEl.textContent = data.report_id;
  if (itemNameEl) itemNameEl.textContent = data.item ? data.item.name : 'Reported Item';
  if (viewReportLink) {
    viewReportLink.href = `/item.html?id=${data.report_id}`;
  }

  // Render possible matches if found!
  if (data.possibleMatches && data.possibleMatches.length > 0) {
    if (matchesSection) matchesSection.style.display = 'block';
    if (matchesList) {
      matchesList.innerHTML = data.possibleMatches.map((match) => {
        const icon = getCategoryIcon(match.category);
        return `
          <div class="match-item-card">
            <div style="display: flex; align-items: center; gap: 0.75rem;">
              <span style="font-size: 1.5rem;">${icon}</span>
              <div>
                <h4 style="font-size: 0.95rem; font-weight: 700; margin-bottom: 0.2rem;">${escapeHtml(match.name)}</h4>
                <div style="font-size: 0.8rem; color: var(--text-muted);">
                  📍 ${escapeHtml(match.location)} • 📅 ${formatDate(match.item_date)}
                </div>
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 0.75rem;">
              <span class="match-score-badge">⚡ ${match.match_score}% Match</span>
              <a href="/item.html?id=${match.report_id || match.id}" class="btn btn-secondary btn-sm" target="_blank">
                Compare →
              </a>
            </div>
          </div>
        `;
      }).join('');
    }
  } else {
    if (matchesSection) matchesSection.style.display = 'none';
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}
