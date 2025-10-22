// import.js - import flows and summary modal

// Expects normalizeImportedData, screwsData, and localStorage to be available from data.js

function importFromFile() {
    const input = document.getElementById('importFileInput');
    if (!input.files || !input.files[0]) {
        showModalMessage('importModalMessage', 'error', 'Please select a file first.');
        return;
    }
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const parsed = JSON.parse(e.target.result);
            // Accept either an array or an object wrapper (normalizeImportedData will handle wrappers)
            if (parsed && (Array.isArray(parsed) || typeof parsed === 'object')) {
                clearModalMessage('importModalMessage');
                showImportSummary(parsed, { source: 'file' });
            } else {
                showModalMessage('importModalMessage', 'error', 'Invalid JSON format: expected an array or object containing screws.');
            }
        } catch (err) {
            showModalMessage('importModalMessage', 'error', 'Error parsing JSON: ' + err.message);
        }
    };
    reader.readAsText(file);
}

function importData() {
    const json = prompt('Paste your JSON data:');
    if (json) {
        try {
            const data = JSON.parse(json);
            if (Array.isArray(data)) {
                showImportSummary(data, { source: 'paste' });
            } else {
                showModalMessage('settingsModalMessage', 'error', 'Invalid JSON format! Expected an array of screws.');
            }
        } catch (e) {
            showModalMessage('settingsModalMessage', 'error', 'Invalid JSON data: ' + e.message);
        }
    }
}

function importFromPaste() {
    const ta = document.getElementById('importPasteTextarea');
    if (!ta) {
        showModalMessage('importModalMessage', 'error', 'Paste area not found.');
        return;
    }
    const text = ta.value.trim();
    if (!text) {
        showModalMessage('importModalMessage', 'error', 'Please paste JSON into the textarea first.');
        return;
    }
    try {
        const parsed = JSON.parse(text);
        clearModalMessage('importModalMessage');
        showImportSummary(parsed, { source: 'paste' });
    } catch (err) {
        showModalMessage('importModalMessage', 'error', 'Error parsing JSON: ' + err.message);
    }
}

function showImportSummary(rawData, meta) {
    // capture previous data so a cancel can restore everything (including previews)
    meta = meta || {};
    meta.previousData = meta.previousData || (Array.isArray(screwsData) ? JSON.parse(JSON.stringify(screwsData)) : []);

    const data = normalizeImportedData(rawData || []);
    const total = data.length;
    let withTs = 0;
    let withNotes = 0;
    data.forEach(s => {
        if (s.timestamp && String(s.timestamp).trim() !== '' && String(s.timestamp) !== '0:00') withTs++;
        if (s.notes && String(s.notes).trim() !== '') withNotes++;
    });

    document.getElementById('summaryTotal').textContent = total;
    document.getElementById('summaryTimestamps').textContent = withTs;
    document.getElementById('summaryNotes').textContent = withNotes;

    // show a small summary; indicate whether a preview is embedded
    const preview = data.slice(0, 3).map(s => ({ id: s.id, title: s.title, timestamp: s.timestamp || '', notes: s.notes || '', preview: s.preview ? '[embedded]' : '' }));
    document.getElementById('summaryPreview').textContent = JSON.stringify(preview, null, 2);

    document.getElementById('importSummaryModal').classList.add('active');

    const confirmBtn = document.getElementById('confirmImportBtn');
    const cancelBtn = document.getElementById('cancelImportBtn');

    async function doConfirm() {
        // Use the already-normalized data so timestamps/notes mapped from different
        // input field names (time, timecode, note, description, etc.) are preserved.
        try {
            // Merge with existing screwsData to preserve any locally stored previews
            const existing = Array.isArray(screwsData) ? screwsData : [];
            screwsData = data.map(s => {
                const found = existing.find(e => e.id === s.id) || {};
                return {
                    id: s.id,
                    title: s.title,
                    timestamp: s.timestamp || '0:00',
                    notes: s.notes || '',
                    // Preserve existing preview if incoming item lacks one; accept incoming preview (including large base64 data URLs)
                    preview: (s.preview && s.preview !== '') ? s.preview : (found.preview || '')
                };
            });
            // Proactively move any embedded data URL previews into IndexedDB and replace with idb:<id> markers
            for (const item of screwsData) {
                if (item.preview && String(item.preview).startsWith('data:')) {
                    try {
                        await window.savePreviewToIDB(item.id, item.preview);
                        item.preview = `idb:${item.id}`;
                    } catch (idbe) {
                        console.error('Failed to save preview to IDB for', item.id, idbe);
                        // leave preview inline as fallback
                    }
                }
            }
            try {
                localStorage.setItem('screwsData', JSON.stringify(screwsData));
            } catch (e) {
                console.error('Failed to save screwsData to localStorage after IDB offload', e);
            }
        } catch (e) {
            // fallback: if something unexpected happens, keep existing screwsData
            console.error('Error applying import:', e);
        }

        renderScrews();
        updateStats();
        document.getElementById('importSummaryModal').classList.remove('active');
        const importModal = document.getElementById('importModal');
        if (importModal) importModal.classList.remove('active');
        confirmBtn.removeEventListener('click', doConfirm);
        cancelBtn.removeEventListener('click', doCancel);
        showModalMessage('importSummaryMessage', 'success', 'Import applied successfully.');
        setTimeout(() => clearModalMessage('importSummaryMessage'), 1500);
    }

    function doCancel() {
        if (meta && meta.previousData) {
            // restore full previous state including preview fields
            screwsData = meta.previousData.map(s => ({ id: s.id, title: s.title, timestamp: s.timestamp, notes: s.notes || '', preview: s.preview || '' }));
            try { localStorage.setItem('screwsData', JSON.stringify(screwsData)); } catch (e) {}
            renderScrews();
            updateStats();
        }
        document.getElementById('importSummaryModal').classList.remove('active');
        confirmBtn.removeEventListener('click', doConfirm);
        cancelBtn.removeEventListener('click', doCancel);
    }

    confirmBtn.addEventListener('click', doConfirm);
    cancelBtn.addEventListener('click', doCancel);
}
