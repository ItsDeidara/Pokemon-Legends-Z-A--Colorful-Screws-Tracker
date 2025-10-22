// dataLoader.js
// Standalone helper: attempt to load /data/data.json when no local data exists.
// Shows toast notifications on success/failure. Designed to be dropped in and integrated later.

(function () {
    // Configuration
    // Try multiple path variants so loading works from file://, nested paths, or server root
    const TRY_PATHS = [
        './data/data.json',
        'data/data.json',
        '/data/data.json'
    ];
    const TOAST_TIMEOUT = 4000;

    // Simple toast helper that injects a toast area into the body if missing
    function ensureToastContainer() {
        let container = document.getElementById('dl-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'dl-toast-container';
            container.style.position = 'fixed';
            container.style.right = '16px';
            container.style.bottom = '16px';
            container.style.zIndex = 99999;
            document.body.appendChild(container);
        }
        return container;
    }

    function showToast(message, type) {
        const container = ensureToastContainer();
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
        setTimeout(() => { try { container.removeChild(el); } catch (e) {} }, TOAST_TIMEOUT);
    }

    // Public: try to fetch the data file and return parsed JSON, or throw.
    async function tryLoadDataJson(options = {}) {
        // options: { onlyIfNoLocal: true }
        if (options.onlyIfNoLocal) {
            const ls = localStorage.getItem('screwsData');
            if (ls) return null; // nothing done
        }
        // Try multiple candidate paths and return the first successful parse
        let lastError = null;
        const logs = [];
        for (const path of TRY_PATHS) {
            try {
                const attemptMsg = `[DataLoader] Attempting to fetch ${path}`;
                console.log(attemptMsg);
                logs.push(attemptMsg);
                const resp = await fetch(path, { cache: 'no-cache' });
                if (!resp.ok) throw new Error('HTTP ' + resp.status + ' for ' + path);
                const text = await resp.text();
                let data;
                try { data = JSON.parse(text); } catch (err) { throw new Error('Invalid JSON at ' + path); }

                const isArray = Array.isArray(data);
                const isLikely = isArray || (data && typeof data === 'object');
                if (!isLikely) throw new Error('Unexpected JSON shape at ' + path);

                const successMsg = `[DataLoader] Successfully loaded ${path}`;
                console.log(successMsg);
                logs.push(successMsg);
                showToast('Loaded data.json from ' + path + ' — ready to apply', 'success');

                // If a debug receiver exists, send logs and a small sample
                try {
                    if (window.__ZA_debugLog) {
                        const sampleItems = Array.isArray(data) ? data.slice(0, 6) : [data];
                        window.__ZA_debugLog({ logs: logs.slice(), lastPath: path, sampleItems });
                    }
                } catch (e) { /* ignore */ }

                return data;
            } catch (err) {
                const failMsg = `[DataLoader] failed to load ${path}: ${err && err.message}`;
                console.warn(failMsg);
                logs.push(failMsg);
                lastError = err;
                // try next path
            }
        }

        // If we reach here, all attempts failed
        const message = lastError && lastError.message ? lastError.message : 'Unknown error';
        showToast('Failed to load data.json: ' + message, 'error');
        try { if (window.__ZA_debugLog) window.__ZA_debugLog({ logs: logs.slice(), lastPath: null, sampleItems: [] }); } catch (e) {}
        throw lastError || new Error('Failed to load data.json');
    }
    // Expose API to window so it can be integrated later
    window.DataLoader = {
        tryLoadDataJson
    };

})();
