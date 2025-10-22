// JSON Assistant: guided UI to help fill missing timestamps/notes
(function () {
    // Create modal markup
    const assistantModal = document.createElement('div');
    assistantModal.className = 'modal assistant-modal';
    assistantModal.id = 'assistantModal';
    assistantModal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2>JSON Assistant</h2>
                <button class="close-btn" id="closeAssistant">&times;</button>
            </div>
            <div id="assistantBody">
                <p class="notice-line">This helper walks you through screws that are missing a timestamp (or notes). Use it only if your JSON isn't fully complete.</p>
                <div id="assistantControls" style="margin-top: 15px;"></div>
                <div style="margin-top: 20px; display:flex; gap:10px;">
                    <button class="btn" id="assistantPrev">Previous</button>
                    <button class="btn" id="assistantNext">Next</button>
                    <button class="btn btn-danger" id="assistantReset">Reset JSON</button>
                    <button class="btn" id="assistantDone">Done</button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(assistantModal);

    // State
    let missingList = [];
    let idx = 0;

    function findMissing() {
        missingList = (screwsData || []).filter(s => !s.timestamp || String(s.timestamp).trim() === '' || String(s.timestamp) === '0:00');
    }

    function showAssistant() {
        // Ensure settings modal remains visible underneath; assistant modal sits above
        findMissing();
        idx = 0;
        renderCurrent();
        assistantModal.classList.add('active');
    }

    function closeAssistant() {
        assistantModal.classList.remove('active');
    }

    function renderCurrent() {
        const container = document.getElementById('assistantControls');
        container.innerHTML = '';

        if (!missingList.length) {
            container.innerHTML = '<div class="notice-line">No missing timestamps detected — your JSON looks complete. You can still review entries below.</div>';
            return;
        }

        const screw = missingList[idx];

        const html = document.createElement('div');
        html.innerHTML = `
            <div style="margin-bottom:10px;"><strong>Screw #${screw.id}</strong></div>
            <div class="input-group">
                <label>Timestamp (HH:MM:SS or MM:SS)</label>
                <input type="text" id="assistantTimestamp" placeholder="e.g. 1:23 or 0:45 or 1:02:30" value="${screw.timestamp || ''}">
                <div class="help-text">Hours optional — enter familiar YouTube-style timestamps.</div>
            </div>
            <div class="input-group">
                <label>Notes (optional)</label>
                <textarea id="assistantNotes" rows="3" placeholder="Add notes to help later...">${screw.notes || ''}</textarea>
            </div>
            <div class="help-text">${idx + 1} of ${missingList.length} — use Next to save and continue, or Done to exit.</div>
        `;

        container.appendChild(html);
    }

    function saveCurrent() {
        if (!missingList.length) return;
        const screw = missingList[idx];
        const ts = document.getElementById('assistantTimestamp').value.trim();
        const notes = document.getElementById('assistantNotes').value;
        // Basic validation: allow empty notes, require timestamp to match simple pattern or be empty
        const tsOk = ts === '' || /^\d{1,2}(:\d{2}){1,2}$/.test(ts);
        if (!tsOk) {
            // Use inline modal message instead of alert
            if (typeof showModalMessage === 'function') {
                showModalMessage('settingsModalMessage', 'error', 'Please enter a timestamp in MM:SS or H:MM:SS format, or leave blank.');
                setTimeout(() => { if (typeof clearModalMessage === 'function') clearModalMessage('settingsModalMessage'); }, 2500);
            } else {
                alert('Please enter a timestamp in MM:SS or H:MM:SS format, or leave blank.');
            }
            return false;
        }

        // Update main screwsData structure
        const globalScrew = screwsData.find(s => s.id === screw.id);
        if (globalScrew) {
            if (ts !== '') globalScrew.timestamp = ts;
            if (notes !== undefined) globalScrew.notes = notes;
            try { localStorage.setItem('screwsData', JSON.stringify(screwsData)); } catch (e) {}
            // Refresh main UI so edits are immediately visible
            if (typeof renderScrews === 'function') renderScrews();
            if (typeof updateStats === 'function') updateStats();
        }

        return true;
    }

    // Controls
    document.getElementById('openAssistantBtn').addEventListener('click', function () {
        showAssistant();
    });

    document.getElementById('closeAssistant').addEventListener('click', function () {
        closeAssistant();
    });

    document.getElementById('assistantNext').addEventListener('click', function () {
        if (!missingList.length) return;
        if (!saveCurrent()) return;
        if (idx < missingList.length - 1) {
            idx++;
            renderCurrent();
        } else {
            // finished
            findMissing();
            if (missingList.length === 0) {
                if (typeof showModalMessage === 'function') {
                    showModalMessage('settingsModalMessage', 'success', 'All done! No more missing timestamps.');
                    setTimeout(() => { if (typeof clearModalMessage === 'function') clearModalMessage('settingsModalMessage'); }, 2000);
                } else {
                    alert('All done! No more missing timestamps.');
                }
                closeAssistant();
            } else {
                // refresh list (some items might still be missing) and clamp idx
                idx = Math.min(idx, missingList.length - 1);
                renderCurrent();
            }
        }
    });

    document.getElementById('assistantPrev').addEventListener('click', function () {
        if (!missingList.length) return;
        if (idx > 0) {
            idx--;
            renderCurrent();
        }
    });

    document.getElementById('assistantDone').addEventListener('click', function () {
        // save current before leaving
        saveCurrent();
        closeAssistant();
    });

    document.getElementById('assistantReset').addEventListener('click', async function () {
        const ok = (typeof showConfirm === 'function') ? await showConfirm('Reset JSON to default generated dataset? This will overwrite your current screws data in localStorage.', 'Reset JSON') : confirm('Reset JSON to default generated dataset? This will overwrite your current screws data in localStorage.');
        if (!ok) return;
        // regenerate default data same as script.js logic
        const data = [];
        for (let i = 1; i <= 100; i++) {
            data.push({ id: i, title: `Colorful Screw ${i}`, timestamp: '0:00', notes: '' });
        }
    screwsData = data;
    try { localStorage.setItem('screwsData', JSON.stringify(data)); } catch (e) {}
        if (typeof showModalMessage === 'function') {
            showModalMessage('settingsModalMessage', 'success', 'JSON reset to the default generated dataset.');
            setTimeout(() => { if (typeof clearModalMessage === 'function') clearModalMessage('settingsModalMessage'); }, 1800);
        } else {
            alert('JSON reset to the default generated dataset.');
        }
        // refresh lists
        findMissing();
        idx = 0;
        renderCurrent();
        // also update UI outside assistant
        if (typeof renderScrews === 'function') renderScrews();
        if (typeof updateStats === 'function') updateStats();
    });

    // Close assistant when clicking outside content area
    assistantModal.addEventListener('click', function (e) {
        if (e.target === assistantModal) closeAssistant();
    });

})();
