// render.js - DOM rendering, UI handlers, and event wiring

let currentEditingScrewIndex = -1;
let hideCollected = false;

function renderScrews() {
    const grid = document.getElementById('screwGrid');
    if (!grid) return;
    grid.innerHTML = '';
    screwsData.forEach((screw, index) => {
        if (hideCollected && collectedScrews[screw.id]) return;
        const card = document.createElement('div');
        card.className = `screw-card ${collectedScrews[screw.id] ? 'collected' : ''}`;
        const youtubeUrl = `${YOUTUBE_BASE_URL}?t=${timestampToSeconds(screw.timestamp)}`;
        const notesHtml = screw.notes ? `<div class="screw-notes">${escapeHtml(screw.notes)}</div>` : '';
        card.innerHTML = `
            <div class="screw-header">
                <div class="checkbox-wrapper">
                    <input type="checkbox" id="screw-${screw.id}" ${collectedScrews[screw.id] ? 'checked' : ''} onchange="toggleScrew(${screw.id})">
                    <div class="checkbox-custom"></div>
                </div>
                <span class="screw-number">#${screw.id}</span>
            </div>
            <div class="screw-title">${escapeHtml(screw.title)}</div>
            ${notesHtml}
            <div class="screw-actions">
                <a href="${youtubeUrl}" target="_blank" class="screw-link">Watch @ ${screw.timestamp}</a>
                <button class="btn" data-viewmap-id="${screw.id}">View map</button>
                <button class="edit-btn" data-edit-index="${index}">Edit</button>
            </div>
        `;
        grid.appendChild(card);
        // attach listeners to the newly created buttons to avoid inline onclick issues
        const viewBtn = card.querySelector('button[data-viewmap-id]');
        if (viewBtn) {
            console.log('Attaching view map listener for screw', viewBtn.getAttribute('data-viewmap-id'));
            viewBtn.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); console.log('View map clicked for', this.getAttribute('data-viewmap-id')); openPreviewModal(this.getAttribute('data-viewmap-id')); });
        }
        const editBtn = card.querySelector('button[data-edit-index]');
        if (editBtn) {
            console.debug('Attaching edit listener for index', editBtn.getAttribute('data-edit-index'));
            editBtn.addEventListener('click', function (e) { e.preventDefault(); openEditScrew(Number(this.getAttribute('data-edit-index'))); });
        }
    });
}

async function openPreviewModal(screwId) {
    console.log('openPreviewModal called with', screwId);
    try {
        const modal = document.getElementById('previewModal');
        const img = document.getElementById('previewImage');
        const msg = document.getElementById('previewMessage');
        if (!modal) { console.error('previewModal element not found'); return; }
        if (!img) { console.error('previewImage element not found'); return; }
        if (!msg) { console.error('previewMessage element not found'); return; }
        // Ensure the modal is a top-level child of body so z-index stacking works
        if (modal.parentElement !== document.body) {
            document.body.appendChild(modal);
        }
        // force it above other modals
        modal.style.zIndex = 999999;
    // IDs may be numbers or strings depending on import; compare as strings to be robust
    const screw = screwsData.find(s => String(s.id) === String(screwId));
    if (!screw) {
        msg.textContent = 'Screw not found.';
        img.style.display = 'none';
        modal.classList.add('active');
        return;
    }
    const openInTabBtn = document.getElementById('openPreviewInTab');
    if (openInTabBtn) { openInTabBtn.style.display = 'none'; openInTabBtn.onclick = null; }

    // If preview is stored in IDB (marker idb:<id>), retrieve it
    let previewVal = screw.preview;
    if (typeof previewVal === 'string' && previewVal.startsWith('idb:')) {
        const id = previewVal.split(':')[1];
        try {
            const fetched = await window.getPreviewFromIDB(Number(id));
            if (fetched) {
                previewVal = fetched;
                console.log('Loaded preview from IDB for screw', id);
            } else {
                previewVal = '';
            }
        } catch (e) {
            console.error('Error retrieving preview from IDB for', id, e);
            previewVal = '';
        }
    }

    if (previewVal && String(previewVal).trim() !== '') {
            // Accept either a full data URL or raw base64 (without prefix). Normalize to data URL.
            let previewVal = String(screw.preview).trim();
            if (!previewVal.startsWith('data:')) {
                // assume png if not specified
                if (/^[A-Za-z0-9+/=\s]+$/.test(previewVal.replace(/\s+/g, '')) && previewVal.length > 100) {
                    previewVal = 'data:image/png;base64,' + previewVal.replace(/\s+/g, '');
                    console.log('Normalized raw base64 preview to data URL for screw', screwId);
                }
            }
            img.src = previewVal;
            img.style.display = 'block';
            msg.style.display = 'none';
            // handle image load error
            img.onerror = function (ev) {
                console.error('Failed to load preview image for screw', screwId, ev);
                img.style.display = 'none';
                msg.textContent = 'Preview failed to load. Check console for errors.';
                msg.style.display = 'block';
            };
            // enable open-in-tab button when available
            if (openInTabBtn) {
                openInTabBtn.style.display = 'inline-block';
                openInTabBtn.onclick = function (e) {
                    e.preventDefault();
                    // If it's a data URL, convert to a blob and open an object URL instead
                    try {
                        if (previewVal.startsWith('data:')) {
                            // Parse data URL: data:[<mediatype>][;base64],<data>
                            const comma = previewVal.indexOf(',');
                            const meta = previewVal.substring(5, comma);
                            const isBase64 = meta.indexOf(';base64') !== -1;
                            const mime = meta.split(';')[0] || 'image/png';
                            const dataPart = previewVal.substring(comma + 1);
                            if (isBase64) {
                                const binary = atob(dataPart.replace(/\s+/g, ''));
                                const len = binary.length;
                                const arr = new Uint8Array(len);
                                for (let i = 0; i < len; i++) arr[i] = binary.charCodeAt(i);
                                const blob = new Blob([arr], { type: mime });
                                const objUrl = URL.createObjectURL(blob);
                                const win = window.open(objUrl, '_blank');
                                // Revoke after a short delay to allow the new tab to load
                                setTimeout(() => { try { URL.revokeObjectURL(objUrl); } catch (e) {} }, 30000);
                                if (!win) console.warn('Popup blocked when opening preview image.');
                            } else {
                                // not base64 — try opening directly
                                window.open(previewVal, '_blank');
                            }
                        } else {
                            // Normal URL
                            const win = window.open(previewVal, '_blank');
                            if (!win) console.warn('Popup blocked when opening preview image URL.');
                        }
                    } catch (err) {
                        console.error('Error opening preview in new tab:', err);
                        showToast('Could not open preview in new tab. See console.', 'error');
                    }
                };
            }
        } else {
            img.src = '';
            img.style.display = 'none';
            msg.textContent = 'No preview available for this screw.';
            msg.style.display = 'block';
            if (openInTabBtn) { openInTabBtn.style.display = 'none'; openInTabBtn.onclick = null; }
        }
        modal.classList.add('active');
    } catch (e) {
        console.error('Error in openPreviewModal:', e);
        showToast('Error opening Map modal. See console.', 'error');
    }
}

function closePreviewModal() {
    const modal = document.getElementById('previewModal');
    const img = document.getElementById('previewImage');
    const msg = document.getElementById('previewMessage');
    if (!modal) return;
    modal.classList.remove('active');
    if (img) { img.src = ''; img.style.display = 'none'; }
    if (msg) { msg.style.display = 'block'; }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function timestampToSeconds(timestamp) {
    const parts = timestamp.split(':').map(p => parseInt(p) || 0);
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return 0;
}

function parseTimestamp(timestamp) {
    const parts = timestamp.split(':').map(p => parseInt(p) || 0);
    if (parts.length === 3) return { hours: parts[0], minutes: parts[1], seconds: parts[2] };
    if (parts.length === 2) return { hours: 0, minutes: parts[0], seconds: parts[1] };
    return { hours: 0, minutes: 0, seconds: 0 };
}

function formatTimestamp(hours, minutes, seconds) {
    hours = parseInt(hours) || 0; minutes = parseInt(minutes) || 0; seconds = parseInt(seconds) || 0;
    if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function toggleScrew(id) {
    collectedScrews[id] = !collectedScrews[id];
    if (!collectedScrews[id]) delete collectedScrews[id];
    saveProgress();
    renderScrews();
    updateStats();
}

function updateStats() {
    const collected = Object.keys(collectedScrews).length;
    const total = screwsData.length;
    const percentage = total > 0 ? Math.round((collected / total) * 100) : 0;
    const collectedEl = document.getElementById('collected'); if (collectedEl) collectedEl.textContent = collected;
    const totalEl = document.getElementById('total'); if (totalEl) totalEl.textContent = total;
    const pctEl = document.getElementById('percentage'); if (pctEl) pctEl.textContent = percentage;
}

function openSettings() {
    const modal = document.getElementById('settingsModal'); if (modal) modal.classList.add('active');
    const output = document.getElementById('exportOutput'); if (output) output.value = JSON.stringify(screwsData, null, 2);
}

function closeSettings() { const modal = document.getElementById('settingsModal'); if (modal) modal.classList.remove('active'); }

function openEditScrew(index) {
    currentEditingScrewIndex = index; const screw = screwsData[index];
    document.getElementById('editScrewNumber').textContent = screw.id;
    document.getElementById('editTitle').value = screw.title;
    const time = parseTimestamp(screw.timestamp);
    document.getElementById('editHours').value = time.hours;
    document.getElementById('editMinutes').value = time.minutes;
    document.getElementById('editSeconds').value = time.seconds;
    document.getElementById('editNotes').value = screw.notes || '';
    document.getElementById('editScrewModal').classList.add('active');
}

function closeEditScrew() { document.getElementById('editScrewModal').classList.remove('active'); currentEditingScrewIndex = -1; }

function saveEditScrew() {
    if (currentEditingScrewIndex === -1) return;
    const hours = document.getElementById('editHours').value;
    const minutes = document.getElementById('editMinutes').value;
    const seconds = document.getElementById('editSeconds').value;
    screwsData[currentEditingScrewIndex].title = document.getElementById('editTitle').value;
    screwsData[currentEditingScrewIndex].timestamp = formatTimestamp(hours, minutes, seconds);
    screwsData[currentEditingScrewIndex].notes = document.getElementById('editNotes').value;
    try { localStorage.setItem('screwsData', JSON.stringify(screwsData)); } catch (e) {}
    renderScrews();
    closeEditScrew();
}

function clearProgress() {
    showConfirm('Clear all progress? This cannot be undone!', 'Clear Progress').then(ok => {
        if (!ok) return;
        collectedScrews = {}; saveProgress(); renderScrews(); updateStats();
    });
}

function toggleHideCollected() { hideCollected = document.getElementById('hideCollected').checked; renderScrews(); }

async function exportData() {
    const output = document.getElementById('exportOutput');
    // Build an exportable copy: if a preview is an IDB marker, fetch the actual data and embed it
    const safeExport = [];
    for (const s of screwsData) {
        let previewVal = s.preview || '';
        if (typeof previewVal === 'string' && previewVal.startsWith('idb:')) {
            const id = Number(previewVal.split(':')[1]);
            try {
                const fetched = await window.getPreviewFromIDB(id);
                if (fetched) previewVal = fetched;
            } catch (e) {
                console.error('Failed to fetch preview from IDB for export', id, e);
            }
        }
        safeExport.push({ id: s.id, title: s.title, timestamp: s.timestamp || '0:00', notes: s.notes || '', preview: previewVal || '' });
    }
    const jsonData = JSON.stringify(safeExport, null, 2);
    if (output) output.value = jsonData;
    const blob = new Blob([jsonData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'colorful-screws-data.json'; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}

function copyToClipboard() {
    const output = document.getElementById('exportOutput'); const jsonData = JSON.stringify(screwsData, null, 2);
    if (output) output.value = jsonData;
    navigator.clipboard.writeText(jsonData).then(() => { showModalMessage('settingsModalMessage', 'success', 'JSON copied to clipboard!'); setTimeout(() => clearModalMessage('settingsModalMessage'), 2000); }).catch(() => { document.execCommand('copy'); showModalMessage('settingsModalMessage', 'success', 'JSON copied to clipboard!'); setTimeout(() => clearModalMessage('settingsModalMessage'), 2000); });
}

// UI wrapper for hard reset: calls data.js hardResetData() and updates UI
function hardReset() {
    try {
        const result = hardResetData();
        // result contains new screwsData and collectedScrews
        if (result) {
            screwsData = result.screwsData || screwsData;
            collectedScrews = result.collectedScrews || {};
        }
    } catch (e) {
        // ignore and continue to refresh UI
    }
    try { renderScrews(); } catch (e) {}
    try { updateStats(); } catch (e) {}

    // Close settings modal if open
    const settingsModal = document.getElementById('settingsModal');
    if (settingsModal && settingsModal.classList.contains('active')) settingsModal.classList.remove('active');

    // Update export textarea if present
    const output = document.getElementById('exportOutput');
    if (output) output.value = JSON.stringify(screwsData, null, 2);

    // Show a global toast so the user sees confirmation after the modal is closed
    showToast('Hard reset complete. Dataset restored to default.', 'success');
}

// Simple global toast helper (used for short notifications)
function showToast(message, type) {
    let container = document.getElementById('global-toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'global-toast-container';
        container.style.position = 'fixed';
        container.style.right = '16px';
        container.style.top = '16px';
        container.style.zIndex = 99999;
        document.body.appendChild(container);
    }
    const el = document.createElement('div');
    el.textContent = message;
    el.style.background = type === 'error' ? '#b00020' : '#2b982b';
    el.style.color = '#fff';
    el.style.padding = '10px 14px';
    el.style.marginTop = '8px';
    el.style.borderRadius = '6px';
    el.style.boxShadow = '0 4px 10px rgba(0,0,0,0.2)';
    el.style.fontFamily = 'sans-serif';
    el.style.fontSize = '13px';
    container.appendChild(el);
    setTimeout(() => { try { container.removeChild(el); } catch (e) {} }, 3000);
}

function showModalMessage(elementId, type, text) {
    const el = document.getElementById(elementId); if (!el) return; el.className = 'modal-message ' + (type || 'info'); el.textContent = text; el.style.display = 'block';
}

function clearModalMessage(elementId) { const el = document.getElementById(elementId); if (!el) return; el.style.display = 'none'; el.textContent = ''; el.className = ''; }

function showModalHtml(elementId, html, type) { const el = document.getElementById(elementId); if (!el) return; el.className = 'modal-message ' + (type || 'info'); el.innerHTML = html; el.style.display = 'block'; }

// Wire up import modal triggers after DOM ready
document.addEventListener('DOMContentLoaded', function () {
    const openBtn = document.getElementById('openImportBtn'); if (openBtn) openBtn.addEventListener('click', function (e) { e.preventDefault(); openImportModal(); });
    const closeBtn = document.getElementById('closeImportModal'); if (closeBtn) closeBtn.addEventListener('click', function (e) { e.preventDefault(); closeImportModal(); });

    const loadBundled = document.getElementById('loadBundledDataBtn');
    if (loadBundled) {
        loadBundled.addEventListener('click', async function (e) {
            e.preventDefault();
            try {
                const res = await fetch('data/data.json');
                if (!res.ok) throw new Error('Fetch failed: ' + res.status);
                const parsed = await res.json();
                showImportSummary(parsed, { source: 'bundled' });
            } catch (err) {
                showModalMessage('settingsModalMessage', 'error', 'Could not load bundled data via fetch (file:// may be blocked). Use Import dialog or run via a local server.');
                setTimeout(() => clearModalMessage('settingsModalMessage'), 4000);
            }
        });
    }

    // File import: clicking the button should open the file picker; file input change will perform the import
    const importFileInput = document.getElementById('importFileInput');
    const importFileBtn = document.getElementById('importFromFileBtn');
    if (importFileBtn && importFileInput) {
        importFileBtn.addEventListener('click', function (e) { e.preventDefault(); importFileInput.click(); });
        importFileInput.addEventListener('change', importFromFile);
    } else if (importFileBtn) {
        // fallback: call importFromFile directly
        importFileBtn.addEventListener('click', function (e) { e.preventDefault(); importFromFile(); });
    }

    const importFromPasteBtn = document.getElementById('importFromPasteBtn'); if (importFromPasteBtn) importFromPasteBtn.addEventListener('click', function (e) { e.preventDefault(); importFromPaste(); });
    const hardResetBtn = document.getElementById('hardResetBtn'); if (hardResetBtn) hardResetBtn.addEventListener('click', async function () { const ok = await showConfirm('Hard reset will clear all screws data, progress, and data source URL from localStorage. Continue?'); if (!ok) return; hardReset(); });
    const closePreview = document.getElementById('closePreviewModal'); if (closePreview) closePreview.addEventListener('click', function (e) { e.preventDefault(); closePreviewModal(); });

    // Delegated handler as a safety-net: in case per-card listeners fail to attach,
    // handle clicks on any View map button by attribute
    const grid = document.getElementById('screwGrid');
    if (grid) {
        grid.addEventListener('click', function (e) {
            const btn = e.target && e.target.closest && e.target.closest('button[data-viewmap-id]');
            if (btn) {
                e.preventDefault();
                console.log('Delegated handler caught View map click for', btn.getAttribute('data-viewmap-id'));
                openPreviewModal(btn.getAttribute('data-viewmap-id'));
            }
        });
    }
});

function openImportModal() {
    const modal = document.getElementById('importModal'); if (!modal) return; modal.classList.add('active');
}

function closeImportModal() {
    const modal = document.getElementById('importModal'); if (!modal) return; modal.classList.remove('active');
}

// Close import summary quick handler
document.addEventListener('DOMContentLoaded', function () {
    const closeSummary = document.getElementById('closeImportSummary'); if (closeSummary) closeSummary.addEventListener('click', function (e) { e.preventDefault(); const m = document.getElementById('importSummaryModal'); if (m) m.classList.remove('active'); });
});

// showConfirm: opens the confirm modal and resolves to true if user confirms
function showConfirm(message, title) {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirmModal');
        const msg = document.getElementById('confirmModalMessage');
        const okBtn = document.getElementById('confirmModalOk');
        const cancelBtn = document.getElementById('confirmModalCancel');
        const closeBtn = document.getElementById('confirmModalClose');
        const titleEl = document.getElementById('confirmModalTitle');

        if (!modal || !msg || !okBtn || !cancelBtn) return resolve(false);

        titleEl.textContent = title || 'Confirm';
        msg.textContent = message || '';
        modal.classList.add('active');

        function cleanup(result) {
            modal.classList.remove('active');
            okBtn.removeEventListener('click', onOk);
            cancelBtn.removeEventListener('click', onCancel);
            closeBtn && closeBtn.removeEventListener('click', onCancel);
            resolve(result);
        }

        function onOk() { cleanup(true); }
        function onCancel() { cleanup(false); }

        okBtn.addEventListener('click', onOk);
        cancelBtn.addEventListener('click', onCancel);
        if (closeBtn) closeBtn.addEventListener('click', onCancel);
    });
}
