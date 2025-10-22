// data.js - state and persistence (no DOM manipulation)

const YOUTUBE_BASE_URL = 'https://youtu.be/70mRtATTHDw';

let screwsData = [];
let collectedScrews = {};

function loadProgress() {
    const saved = localStorage.getItem('screwProgress');
    if (saved) {
        try { collectedScrews = JSON.parse(saved); } catch (e) { collectedScrews = {}; }
    }
}

function saveProgress() {
    try { localStorage.setItem('screwProgress', JSON.stringify(collectedScrews)); } catch (e) {}
}

async function loadScrewData() {
    const savedData = localStorage.getItem('screwsData');

    if (savedData) {
        try {
            const parsed = JSON.parse(savedData);
            if (Array.isArray(parsed)) {
                // ensure preview property exists on each item to preserve thumbnails
                screwsData = parsed.map(item => ({
                    id: item.id,
                    title: item.title,
                    timestamp: item.timestamp || (item.time || '0:00'),
                    notes: item.notes || '',
                    preview: item.preview || item.thumbnail || item.thumb || item.image || item.previewData || ''
                }));
            } else {
                screwsData = generateDefaultData();
            }
        } catch (e) {
            // corrupted saved data -> regenerate defaults
            screwsData = generateDefaultData();
            try { localStorage.setItem('screwsData', JSON.stringify(screwsData)); } catch (err) {}
        }
    } else {
        screwsData = generateDefaultData();
        try { localStorage.setItem('screwsData', JSON.stringify(screwsData)); } catch (err) {}
    }

    // keep interface consistent: return the loaded data
    return screwsData;
}

function normalizeImportedData(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.map(normalizeScrewItem);

    const wrapperKeys = ['screws', 'data', 'items', 'colorfulScrews', 'colorful_screws'];
    if (typeof raw === 'object') {
        for (const k of wrapperKeys) {
            if (Array.isArray(raw[k])) return raw[k].map(normalizeScrewItem);
        }

        const vals = Object.values(raw);
        if (vals.length && vals.every(v => v && (v.id || v.title || v.timestamp || v.notes))) {
            return vals.map(normalizeScrewItem);
        }
    }

    return [];
}

function normalizeScrewItem(item) {
    const id = item && (item.id || item.ID || item.index) ? Number(item.id || item.ID || item.index) : null;
    return {
        id: id || (item && item.name ? item.name : null) || null,
        title: item && (item.title || item.name) ? String(item.title || item.name) : `Colorful Screw ${id || ''}`,
        timestamp: item && item.timestamp ? String(item.timestamp) : (item && item.time ? String(item.time) : '0:00'),
        notes: item && item.notes ? String(item.notes) : '',
        // Support multiple possible preview/thumbnail field names in imported JSON
        preview: (function () {
            if (!item || typeof item !== 'object') return '';
            const keys = ['preview', 'thumbnail', 'thumb', 'image', 'previewData', 'preview_image'];
            for (const k of keys) {
                if (item[k]) return String(item[k]);
            }
            return '';
        })()
    };
}

function generateDefaultData() {
    const data = [];
    for (let i = 1; i <= 100; i++) {
        data.push({ id: i, title: `Colorful Screw ${i}`, timestamp: '0:00', notes: '', preview: '' });
    }
    return data;
}

function hardResetData() {
    try { localStorage.removeItem('screwsData'); } catch (e) {}
    try { localStorage.removeItem('screwProgress'); } catch (e) {}
    try { localStorage.removeItem('dataSourceUrl'); } catch (e) {}

    screwsData = generateDefaultData();
    try { localStorage.setItem('screwsData', JSON.stringify(screwsData)); } catch (e) {}

    collectedScrews = {};
    try { localStorage.setItem('screwProgress', JSON.stringify(collectedScrews)); } catch (e) {}

    return { screwsData, collectedScrews };
}

// IndexedDB helpers for storing large preview blobs when localStorage is too small
function openPreviewDB() {
    return new Promise((resolve, reject) => {
        if (!window.indexedDB) return reject(new Error('IndexedDB not supported'));
        const req = indexedDB.open('screwPreviews', 1);
        req.onupgradeneeded = function (ev) {
            const db = ev.target.result;
            if (!db.objectStoreNames.contains('previews')) {
                db.createObjectStore('previews', { keyPath: 'id' });
            }
        };
        req.onsuccess = function (ev) { resolve(ev.target.result); };
        req.onerror = function (ev) { reject(ev.target.error || new Error('IndexedDB open error')); };
    });
}

async function savePreviewToIDB(id, dataUrl) {
    try {
        const db = await openPreviewDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('previews', 'readwrite');
            const store = tx.objectStore('previews');
            store.put({ id: Number(id), data: dataUrl });
            tx.oncomplete = () => { db.close(); resolve(true); };
            tx.onerror = () => { db.close(); reject(tx.error || new Error('IDB write failed')); };
        });
    } catch (e) {
        console.error('savePreviewToIDB error', e);
        return false;
    }
}

async function getPreviewFromIDB(id) {
    try {
        const db = await openPreviewDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('previews', 'readonly');
            const store = tx.objectStore('previews');
            const req = store.get(Number(id));
            req.onsuccess = function (ev) { db.close(); resolve(ev.target.result ? ev.target.result.data : null); };
            req.onerror = function (ev) { db.close(); reject(ev.target.error || new Error('IDB read error')); };
        });
    } catch (e) {
        console.error('getPreviewFromIDB error', e);
        return null;
    }
}

async function removePreviewFromIDB(id) {
    try {
        const db = await openPreviewDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('previews', 'readwrite');
            const store = tx.objectStore('previews');
            store.delete(Number(id));
            tx.oncomplete = () => { db.close(); resolve(true); };
            tx.onerror = () => { db.close(); reject(tx.error || new Error('IDB delete failed')); };
        });
    } catch (e) {
        console.error('removePreviewFromIDB error', e);
        return false;
    }
}

// expose IDB helpers
window.savePreviewToIDB = savePreviewToIDB;
window.getPreviewFromIDB = getPreviewFromIDB;
window.removePreviewFromIDB = removePreviewFromIDB;
