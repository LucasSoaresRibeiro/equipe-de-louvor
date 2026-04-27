// Cache for loaded song data (by string id)
const songsCache = {};

// Function to toggle between pages
function initSetNavigation() {
    const songsLink = document.getElementById('songsLink');
    const setsLink = document.getElementById('setsLink');

    if (songsLink) {
        songsLink.addEventListener('click', function (e) {
            e.preventDefault();
            updateAppVisibility('landing');
        });
    }

    if (setsLink) {
        setsLink.addEventListener('click', function (e) {
            e.preventDefault();
            updateAppVisibility('sets');
        });
    }
}

/**
 * Garante que cada id em allSongs exista (fetch GET /musicas/{id} se necessário).
 */
async function ensureSongsLoadedForQueue(ids) {
    for (const raw of ids) {
        const id = String(raw);
        if (!allSongs.some(s => String(s.id) === id)) {
            await loadSongDataForSet(id);
        }
    }
}

// Function to load song data: cache → allSongs → API
async function loadSongDataForSet(songId) {
    const id = String(songId);
    const existing = allSongs.find(s => String(s.id) === id);
    if (existing) {
        songsCache[id] = existing;
        return existing;
    }
    if (songsCache[id]) {
        return songsCache[id];
    }

    try {
        const cfg = getEigrejaPublicConfig();
        const body = await fetchMusicaById(cfg, id);
        const apiSong = eigrejaMusicaResponseToApiSong(body);
        if (!apiSong) {
            console.error('Resposta sem música para ID:', id);
            return null;
        }
        const songData = mapEigrejaSongToEditorSong(apiSong);
        songsCache[id] = songData;
        if (!allSongs.some(s => String(s.id) === id)) {
            allSongs.push(songData);
        }
        return songData;
    } catch (error) {
        console.error(`Error loading song data for ID ${id}:`, error);
        return null;
    }
}

// Function to load all sets from API pública
async function loadAllSets() {
    const setsContainer = document.getElementById('setsContainer');
    if (!setsContainer) return;

    setsContainer.innerHTML = '<p>Carregando repertórios...</p>';
    setList.length = 0;

    try {
        const cfg = getEigrejaPublicConfig();
        const body = await fetchProgramacoes(cfg);
        const schedules = body && Array.isArray(body.schedules) ? body.schedules : [];

        if (schedules.length === 0) {
            setsContainer.innerHTML = '<p>Nenhuma programação pública encontrada.</p>';
            return;
        }

        setsContainer.innerHTML = '';

        for (const schedule of schedules) {
            const setData = mapScheduleToSetData(schedule);
            if (!setData.id) continue;
            if (!setDataHasSongs(setData)) continue;
            setList.push({
                data: setData,
                fileName: setData.id
            });
        }

        if (setList.length === 0) {
            setsContainer.innerHTML =
                '<p>Nenhum repertório com músicas encontrado (programações vazias foram ocultadas).</p>';
            return;
        }

        setList.sort((a, b) => {
            const isoA = a.data.eventDateIso || '';
            const isoB = b.data.eventDateIso || '';
            const dA = isoA ? parseEventDateValue(isoA) : null;
            const dB = isoB ? parseEventDateValue(isoB) : null;
            const tA = dA ? dA.getTime() : 0;
            const tB = dB ? dB.getTime() : 0;
            return tB - tA;
        });

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const isTodayOrFuture = (set) => {
            const iso = set && set.data ? set.data.eventDateIso : '';
            if (!iso) return false;
            const d = parseEventDateValue(iso);
            if (!d) return false;
            return d.getTime() >= todayStart.getTime();
        };

        const upcomingSets = [];
        const pastSets = [];

        for (const set of setList) {
            if (isTodayOrFuture(set)) upcomingSets.push(set);
            else pastSets.push(set);
        }

        for (const set of upcomingSets) {
            await displaySetCard(setsContainer, set.data, set.fileName);
        }

        if (pastSets.length > 0) {
            const showMoreWrap = document.createElement('div');
            showMoreWrap.className = 'sets-show-more';

            const showMoreBtn = document.createElement('button');
            showMoreBtn.type = 'button';
            showMoreBtn.className = 'show-more-sets-button';
            showMoreBtn.textContent = 'Exibir mais';

            showMoreBtn.addEventListener('click', async () => {
                showMoreBtn.disabled = true;
                showMoreBtn.textContent = 'Carregando...';
                for (const set of pastSets) {
                    await displaySetCard(setsContainer, set.data, set.fileName);
                }
                showMoreWrap.remove();
            });

            showMoreWrap.appendChild(showMoreBtn);
            setsContainer.appendChild(showMoreWrap);
        }
    } catch (error) {
        console.error('Error loading sets:', error);
        setsContainer.innerHTML = `<p>Não foi possível carregar as programações. ${error.message || ''}</p>`;
    }
}

// Function to open a song in the main view
function openSong(songId) {
    updateAppVisibility('song');

    const url = new URL(window.location);
    url.searchParams.set('songs', String(songId));
    window.history.pushState({}, '', url);

    if (typeof handleUrlChange === 'function') {
        void handleUrlChange();
    }
}

// Function to load all songs in a set
function loadAllSongsInSet(setData) {
    if (!setData.songs || setData.songs.length === 0) {
        alert('This set has no songs to load.');
        return;
    }

    updateAppVisibility('song');

    const url = new URL(window.location);
    url.searchParams.delete('songs');
    url.searchParams.set('set', setData.id);

    window.history.pushState({}, '', url);

    if (typeof handleUrlChange === 'function') {
        void handleUrlChange();
    }
}

// Function to display a set
async function displaySetCard(container, setData, fileName) {
    const setCard = document.createElement('div');
    setCard.className = 'set-card';

    const setHeader = document.createElement('div');
    setHeader.className = 'set-header';

    const titleElement = document.createElement('div');
    titleElement.className = 'set-title';
    titleElement.textContent = setData.title || 'Untitled Set';

    if (setData.is_draft) {
        const draftBadge = document.createElement('span');
        draftBadge.className = 'set-draft-badge';
        draftBadge.textContent = 'Rascunho';
        titleElement.appendChild(draftBadge);
    }

    const dateElement = document.createElement('div');
    dateElement.className = 'set-date';
    dateElement.textContent = setData.date || 'No date';

    setHeader.appendChild(titleElement);
    setHeader.appendChild(dateElement);
    setCard.appendChild(setHeader);

    if (setData.notes || setData.leader || setData.equipeNome || setData.dirigenteNome) {
        const infoElement = document.createElement('div');
        infoElement.className = 'set-info';

        const parts = [];
        if (setData.equipeNome) parts.push(`Equipe: ${setData.equipeNome}`);
        if (setData.dirigenteNome) parts.push(`Dirigente: ${setData.dirigenteNome}`);
        if (setData.leader && !setData.dirigenteNome) parts.push(`Líder: ${setData.leader}`);
        if (setData.notes) parts.push(`Notas: ${setData.notes}`);
        infoElement.textContent = parts.join(' | ');

        setCard.appendChild(infoElement);
    }

    if (setData.songs && setData.songs.length > 0) {
        const loadButtonContainer = document.createElement('div');
        loadButtonContainer.className = 'set-actions';

        const loadButton = document.createElement('button');
        loadButton.className = 'load-set-button';
        loadButton.innerHTML = '<i class="fas fa-music"></i> Carregar Repertório';
        loadButton.title = 'Carregar todas as músicas deste set';

        loadButton.addEventListener('click', () => {
            loadAllSongsInSet(setData);
        });

        loadButtonContainer.appendChild(loadButton);
        setCard.appendChild(loadButtonContainer);
    }

    if (setData.songs && setData.songs.length > 0) {
        const songsContainer = document.createElement('div');
        songsContainer.className = 'set-songs';

        const songPromises = setData.songs.map(song => loadSongDataForSet(song.song_id));
        const songDataList = await Promise.all(songPromises);

        setData.songs.forEach((song, index) => {
            const songElement = document.createElement('div');
            songElement.className = 'set-song';

            const songInfo = document.createElement('div');
            songInfo.className = 'set-song-info';

            const songData = songDataList[index];
            const songTitle = songData
                ? songData.title
                : song.songTitulo || `Song ID: ${song.song_id}`;

            const songLink = document.createElement('a');
            songLink.href = '#';
            songLink.className = 'song-link';
            songLink.innerHTML = `${index + 1}. ${songTitle} <span class="song-key">(Tom: ${song.key})</span>`;

            songLink.addEventListener('click', e => {
                e.preventDefault();
                openSong(song.song_id);
            });

            songInfo.appendChild(songLink);
            songElement.appendChild(songInfo);

            if (song.notes) {
                const songNotes = document.createElement('div');
                songNotes.className = 'set-song-notes';
                songNotes.textContent = song.notes;
                songElement.appendChild(songNotes);
            }

            songsContainer.appendChild(songElement);
        });

        setCard.appendChild(songsContainer);
    } else {
        const noSongs = document.createElement('p');
        noSongs.textContent = 'No songs in this set.';
        setCard.appendChild(noSongs);
    }

    setCard.dataset.fileName = fileName;

    container.appendChild(setCard);
}

// Function to listen for the back button in song view
function initBackButtonListener() {
    document.addEventListener('click', function (e) {
        if (e.target && (e.target.id === 'backToTable' || e.target.closest('#backToTable'))) {
            const url = new URL(window.location);
            if (url.searchParams.get('set')) {
                updateAppVisibility('sets');
            } else {
                updateAppVisibility('landing');
            }

            url.searchParams.delete('set');
            url.searchParams.delete('songs');
            window.history.pushState({}, '', url);
        }
    });
}

document.addEventListener('DOMContentLoaded', function () {
    initSetNavigation();
    initBackButtonListener();
});

function updateKeyAccumulationForSet(songsList) {
    const url = new URL(window.location);
    if (!url.searchParams.get('set')) {
        return;
    }

    const setId = url.searchParams.get('set');
    const set = setList.find(s => String(s.data.id) === String(setId));
    if (!set) {
        return;
    }

    for (let i = 0; i < songsList.length; i++) {
        const songId = songsList[i];
        const songData = allSongs.find(s => String(s.id) === String(songId));
        if (songData) {
            const songSetConfig = set.data.songs.find(
                s => String(s.song_id) === String(songData.id)
            );
            if (songSetConfig && songSetConfig.key && songSetConfig.key.match(/\d+/)) {
                songData['key_accumulation'] = parseInt(songSetConfig['key'].match(/\d+/)[0], 10);
                songData['chord_chart'] = transposeChordChart(
                    songData['chord_chart_original'],
                    songData['key_accumulation']
                );
                songData['key'] = transposeKeyString(
                    songData['key_original'],
                    songData['key_accumulation']
                );
            } else {
                songData['key_accumulation'] = 0;
                songData['chord_chart'] = songData['chord_chart_original'];
                songData['key'] = songData['key_original'];
            }
        }
    }
}
