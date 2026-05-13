let allSongs = [];
let chordsVisible = true;
let currentSongData = null;
let originalKey = null; // Store original key for reset functionality
let currentSongIndex = 0;
let songsList = [];
let setList = [];

/**
 * Updates the application's visibility states based on the current view.
 * Centralizes all page visibility logic in one function.
 * 
 * @param {string} view - The view to display ('landing', 'song', 'sets')
 * @param {Object} options - Additional options for the view
 */
function updateAppVisibility(view, options = {}) {
    const landingPage = document.getElementById('landingPage');
    const songContent = document.getElementById('songContent');
    const setsPage = document.getElementById('setsPage');
    const navControls = document.querySelector('.nav-controls');
    const navMenu = document.querySelector('.nav-menu');
    const songsLink = document.getElementById('songsLink');
    const setsLink = document.getElementById('setsLink');
    const logoContainer = document.querySelector('.logo-container');
    
    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.value = '';
    
    // Close YouTube modal if open
    const modal = document.getElementById('youtubeModal');
    if (modal) {
        modal.style.display = 'none';
        const container = document.getElementById('youtube-container');
        if (container) container.innerHTML = '';
        if (typeof restoreYoutubeModalFilters === 'function') {
            restoreYoutubeModalFilters();
        }
    }
    
    // Update visibility based on view
    switch(view) {
        case 'landing':
            if (landingPage) landingPage.style.display = 'flex';
            if (songContent) songContent.innerHTML = '';
            if (setsPage) setsPage.style.display = 'none';
            if (navMenu) navMenu.style.display = 'flex';
            if (navControls) navControls.style.display = 'none';
            if (songsLink) songsLink.classList.add('active');
            if (setsLink) setsLink.classList.remove('active');
            if (logoContainer) logoContainer.style.display = 'flex';
            break;
            
        case 'song':
            if (landingPage) landingPage.style.display = 'none';
            if (setsPage) setsPage.style.display = 'none';
            if (navMenu) navMenu.style.display = 'none';
            if (navControls) navControls.style.display = 'flex';
            if (logoContainer) logoContainer.style.display = 'none';
            break;
            
        case 'sets':
            if (landingPage) landingPage.style.display = 'none';
            if (songContent) songContent.innerHTML = '';
            if (setsPage) setsPage.style.display = 'flex';
            if (navMenu) navMenu.style.display = 'flex';
            if (navControls) navControls.style.display = 'none';
            if (setsLink) setsLink.classList.add('active');
            if (songsLink) songsLink.classList.remove('active');
            if (logoContainer) logoContainer.style.display = 'flex';
            break;
            
        default:
            console.error('Unknown view:', view);
    }
}

async function loadAllSongs() {
    try {
        const cfg = getEigrejaPublicConfig();
        const body = await fetchMusicasCatalog(cfg);
        const list = body && Array.isArray(body.songs) ? body.songs : [];
        allSongs = list.map(mapEigrejaSongToEditorSong);
        setupSearch();
    } catch (error) {
        console.error('Error loading songs:', error);
        throw error;
    }
}

function normalizeText(text) {
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
        .replace(/[^a-z0-9\s]/g, '') // Remove special characters
        .replace(/\s+/g, ' ') // Normalize spaces
        .trim();
}

function setupSearch() {
    const searchInput = document.getElementById('searchInput');

    // Initialize global chord visibility from URL
    const urlParams = new URLSearchParams(window.location.search);
    chordsVisible = urlParams.get('chords') !== 'false';

    const logo = document.querySelector('.logo');
    if (logo) {
        logo.style.cursor = 'pointer';
        logo.addEventListener('click', () => {
            updateAppVisibility('landing');

            const url = new URL(window.location);
            url.searchParams.delete('songs');
            window.history.pushState({}, '', url);

            displaySongsTable(allSongs);
        });
    }

    if (!searchInput) {
        return;
    }

    displaySongsTable(allSongs);

    searchInput.addEventListener('input', () => {
        const query = normalizeText(searchInput.value);
        
        // Filter songs based on search query
        const filteredSongs = allSongs.filter(song => 
            normalizeText(song.title).includes(query) ||
            normalizeText(song.author || '').includes(query) ||
            (song.chord_chart && normalizeText(song.chord_chart).includes(query))
        );
        
        displaySongsTable(filteredSongs);
    });
}

// Function to display songs in a table
function displaySongsTable(songs) {
    const songsTableBody = document.getElementById('songsTableBody');
    const noResults = document.getElementById('noResults');
    if (!songsTableBody) {
        return;
    }

    // Clear existing table content
    songsTableBody.innerHTML = '';
    
    if (songs.length === 0) {
        if (noResults) noResults.style.display = 'block';
        return;
    }

    if (noResults) noResults.style.display = 'none';
    
    // Sort songs alphabetically by title
    const sortedSongs = songs.slice().sort((a, b) => {
        return a.title.localeCompare(b.title, 'pt-BR');
    });
    
    // Add each song to the table
    sortedSongs.forEach(song => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${song.title}</td>
            <td>${song.author || '-'}</td>
            <td>${song.key || '-'}</td>
        `;
        
        // Add click event to open the song
        row.addEventListener('click', () => {
            currentSongData = song;
            createSongContent(song);
            // Update URL with song ID
            const url = new URL(window.location);
            url.searchParams.set('songs', song.id);
            // A LINHA ABAIXO FOI REMOVIDA
            // url.searchParams.set('chords', 'true'); 
            window.history.pushState({}, '', url);
            void handleUrlChange();
        });
        
        songsTableBody.appendChild(row);
    });
}

// Function to handle URL changes and reload application state
async function handleUrlChange() {
    const urlParams = new URLSearchParams(window.location.search);
    const songsParam = urlParams.get('songs');
    const setParam = urlParams.get('set'); // Adicionamos a leitura do parâmetro 'set'
    const keysParam = urlParams.get('keys');
    chordsVisible = urlParams.get('chords') !== 'false'; // Update global state

    // Repertório na URL: com ou sem ?songs= (música atual ao abrir a partir do card)
    if (setParam) {
        const set = setList.find(s => String(s.data.id) === String(setParam));
        if (set) {
            songsList = set.data.songs.map(song => song.song_id.toString());
            if (songsParam) {
                const targetId = songsParam.split(',')[0];
                const idx = songsList.findIndex(id => String(id) === String(targetId));
                currentSongIndex = idx >= 0 ? idx : 0;
            } else {
                currentSongIndex = 0;
            }
            updateAppVisibility('song');
        } else {
            songsList = [];
            updateAppVisibility('landing');
        }
    } else if (songsParam) {
        songsList = songsParam.split(',');
        const keysList = keysParam ? keysParam.split(',') : [];
        currentSongIndex = 0;
        // Store original keys for each song
        songsList.forEach((songId, index) => {
            const song = allSongs.find(s => String(s.id) === String(songId));
            if (song && keysList[index]) {
                song.requested_key = keysList[index];
            }
        });
        // Update visibility for song view
        updateAppVisibility('song');
    }
    // Se não houver parâmetros, exibe a página inicial
    else {
        songsList = [];
        currentSongIndex = 0;
        // Update visibility for landing view
        updateAppVisibility('landing');
    }

    // Se houver músicas na lista (carregadas de um repertório ou da URL), exibe a primeira
    if (songsList.length > 0 && typeof ensureSongsLoadedForQueue === 'function') {
        await ensureSongsLoadedForQueue(songsList);
    }
    if (songsList.length > 0) {
        updateKeyAccumulationForSet(songsList);
        const song = allSongs.find(s => String(s.id) === String(songsList[currentSongIndex]));
        if (song) {
            currentSongData = song;
            createSongContent(currentSongData);
            // Update chord visibility after content is created
            document.querySelectorAll('.chords').forEach(chord => {
                chord.style.display = chordsVisible ? 'block' : 'none';
            });
            // Update lyrics compact class
            document.querySelectorAll('.lyrics').forEach(lyric => {
                lyric.classList.toggle('compact-lyrics', !chordsVisible);
            });
        }
    }
}

function addSongNavigation() {
    const songContent = document.getElementById('songContent');
    const header = songContent.querySelector('header') || songContent.querySelector('h1').parentElement;

    // Create set container
    const setContainer = document.createElement('div');
    setContainer.className ='set-header';
    setContainer.style.gap = '10px';
    setContainer.style.width = '100%';
    setContainer.style.marginTop = '20px';

    // Add set name if a set is loaded
    const url = new URL(window.location);
    const setId = url.searchParams.get('set');
    if (setId && setList) {
        const set = setList.find(s => String(s.data.id) === String(setId));
        if (set) {
            setContainer.innerHTML = `<div class="set-title">${set.data.title}</div><div class="set-date">${set.data.date}</div>`;
        }
    }

    // Create navigation container
    const navContainer = document.createElement('div');
    navContainer.className = 'song-navigation';
    navContainer.innerHTML = `
        <button id="prevSong" ${currentSongIndex === 0 ? 'disabled' : ''}>&lt; Anterior</button>
        <span>${currentSongIndex + 1} / ${songsList.length}</span>
        <button id="nextSong" ${currentSongIndex === songsList.length - 1 ? 'disabled' : ''}>Próxima &gt;</button>
    `;

    // Helper function to update URL with current song and key
    const updateUrlWithKey = (song) => {
        const url = new URL(window.location);
        if (url.searchParams.get('set')) {
            url.searchParams.set('songs', String(song.id));
        }
        const currentKeys = url.searchParams.get('keys') ? url.searchParams.get('keys').split(',') : [];
        if (song.requested_key) {
            currentKeys[currentSongIndex] = song.requested_key;
            url.searchParams.set('keys', currentKeys.join(','));
        }
        window.history.pushState({}, '', url);
    };

    // Add navigation event listeners
    navContainer.querySelector('#prevSong').addEventListener('click', () => {
        if (currentSongIndex > 0) {
            currentSongIndex--;
            const song = allSongs.find(s => String(s.id) === String(songsList[currentSongIndex]));
            if (song) {
                // Close YouTube modal if open
                const modal = document.getElementById('youtubeModal');
                if (modal) {
                    modal.style.display = 'none';
                    const container = document.getElementById('youtube-container');
                    if (container) container.innerHTML = '';
                    if (typeof restoreYoutubeModalFilters === 'function') {
                        restoreYoutubeModalFilters();
                    }
                }
                currentSongData = song;
                createSongContent(currentSongData);
                updateUrlWithKey(currentSongData);
                // Update chord visibility after content is created
                document.querySelectorAll('.chords').forEach(chord => {
                    chord.style.display = chordsVisible ? 'block' : 'none';
                });
                // Update lyrics compact class
                document.querySelectorAll('.lyrics').forEach(lyric => {
                    lyric.classList.toggle('compact-lyrics', !chordsVisible);
                });
                // Update toggle button text
                const toggleChordsBtn = document.getElementById('toggleChords');
                if (toggleChordsBtn) {
                    toggleChordsBtn.innerHTML = `<i class="fas fa-guitar"></i>${chordsVisible ? 'Ocultar' : 'Mostrar'} Acordes`;
                }
            }
        }
    });

    navContainer.querySelector('#nextSong').addEventListener('click', () => {
        if (currentSongIndex < songsList.length - 1) {
            currentSongIndex++;
            const song = allSongs.find(s => String(s.id) === String(songsList[currentSongIndex]));
            if (song) {
                // Close YouTube modal if open
                const modal = document.getElementById('youtubeModal');
                if (modal) {
                    modal.style.display = 'none';
                    const container = document.getElementById('youtube-container');
                    if (container) container.innerHTML = '';
                    if (typeof restoreYoutubeModalFilters === 'function') {
                        restoreYoutubeModalFilters();
                    }
                }
                currentSongData = song;
                createSongContent(currentSongData);
                updateUrlWithKey(currentSongData);
                // Update chord visibility after content is created
                document.querySelectorAll('.chords').forEach(chord => {
                    chord.style.display = chordsVisible ? 'block' : 'none';
                });
                // Update lyrics compact class
                document.querySelectorAll('.lyrics').forEach(lyric => {
                    lyric.classList.toggle('compact-lyrics', !chordsVisible);
                });
                // Update toggle button text
                const toggleChordsBtn = document.getElementById('toggleChords');
                if (toggleChordsBtn) {
                    toggleChordsBtn.innerHTML = `<i class="fas fa-guitar"></i>${chordsVisible ? 'Ocultar' : 'Mostrar'} Acordes`;
                }
            }
        }
    });

    // Insert navigation after the header
    if (songsList.length > 1) {
        header.insertAdjacentElement('beforebegin', setContainer);
        header.insertAdjacentElement('beforebegin', navContainer);
    }
}

// Add event listeners for URL changes; inicialização em song_manager.js (loadSongData + loadAllSets + handleUrlChange)
window.addEventListener('popstate', () => {
    void handleUrlChange();
});