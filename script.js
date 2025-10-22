// script.js - bootstrap

function initApp() {
    // remove any legacy dataSource key
    try { localStorage.removeItem('dataSourceUrl'); } catch (e) {}

    // load data and state
    loadProgress();

    // load existing local data or generate defaults
    loadScrewData().then(() => {
        renderScrews();
        updateStats();
    });
}

// start the app
initApp();
