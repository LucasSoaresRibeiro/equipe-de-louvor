/**
 * Cliente HTTP e mapeamento API eIgreja → formato interno do editor (SongLib-like).
 */

function buildEigrejaPublicHeaders(cfg) {
    const headers = { Accept: 'application/json' };
    if (cfg.syncApiKey) {
        headers['x-eigreja-api-key'] = cfg.syncApiKey;
    }
    return headers;
}

function buildEigrejaApiUrl(cfg, pathAfterSlug) {
    const slug = cfg.churchSlug;
    if (!slug) {
        throw new Error('Configure o slug da igreja (churchSlug em eigreja-config.js ou ?church= na URL).');
    }
    const base = cfg.apiBase || 'https://eigreja.com/api/public/v1';
    const segment = pathAfterSlug.replace(/^\/+/, '');
    return `${base}/${encodeURIComponent(slug)}/${segment}`;
}

async function fetchPublicJson(url, cfg) {
    const res = await fetch(url, {
        method: 'GET',
        headers: buildEigrejaPublicHeaders(cfg),
        credentials: 'omit',
        mode: 'cors'
    });
    let body = null;
    const text = await res.text();
    try {
        body = text ? JSON.parse(text) : null;
    } catch (e) {
        body = null;
    }
    if (!res.ok) {
        const msgFromBody = body && (body.error || body.message);
        let msg = msgFromBody || `Erro HTTP ${res.status}`;
        if (res.status === 401) {
            msg = 'Chave de API inválida ou ausente (401). Verifique EIGREJA_SYNC_API_KEY / ?syncKey=.';
        } else if (res.status === 404) {
            msg = 'Igreja não encontrada ou rota inválida (404). Verifique o slug (?church=).';
        } else if (res.status === 0 || res.type === 'opaque') {
            msg = 'Falha de rede ou CORS. Abra o DevTools → Network e confira o domínio da API.';
        }
        const err = new Error(msg);
        err.status = res.status;
        err.body = body;
        throw err;
    }
    return body;
}

function eigrejaLinkEntryUrl(entry) {
    if (!entry || typeof entry !== 'object') return '';
    const u = entry.url != null ? String(entry.url).trim() : '';
    if (u) return u;
    const h = entry.href != null ? String(entry.href).trim() : '';
    return h || '';
}

/**
 * Catálogo: cada item em `songs` inclui `links` na própria música.
 * Detalhe GET /musicas/{id}: `links` vem no JSON raiz ao lado de `song`.
 */
function eigrejaMusicaResponseToApiSong(body) {
    if (!body || typeof body !== 'object') return null;
    const song = body.song != null ? body.song : body;
    if (!song || typeof song !== 'object') return null;
    const topLinks = body.links;
    const hasSongLinks = Array.isArray(song.links) && song.links.length > 0;
    if (!hasSongLinks && Array.isArray(topLinks) && topLinks.length > 0) {
        return Object.assign({}, song, { links: topLinks });
    }
    return song;
}

function linksToUrlString(links) {
    if (!links || !Array.isArray(links) || links.length === 0) return '';
    const urls = links.map(l => eigrejaLinkEntryUrl(l)).filter(Boolean);
    return urls.join('|');
}

function mapEigrejaSongToEditorSong(apiSong) {
    const id = String(apiSong.id != null ? apiSong.id : '');
    const title = apiSong.titulo != null ? String(apiSong.titulo) : '';
    let author = apiSong.artista != null ? String(apiSong.artista) : '';
    if (apiSong.interprete) {
        const interp = String(apiSong.interprete).trim();
        if (interp) {
            author = author ? `${author} (${interp})` : interp;
        }
    }
    const key = apiSong.tom != null ? String(apiSong.tom) : '';
    const time_sig = apiSong.compasso != null ? String(apiSong.compasso) : '';

    let chord_chart = '';
    const src = apiSong.chordChartSource;
    if (src && src.type === 'text' && typeof src.value === 'string') {
        chord_chart = src.value;
    } else {
        chord_chart =
            '[Cifra indisponível neste formato no editor — use o tipo texto no eIgreja ou abra o anexo no site.]';
    }

    const url = linksToUrlString(apiSong.links);

    const song = {
        id,
        title,
        author,
        key,
        time_sig,
        chord_chart,
        url,
        key_original: key,
        chord_chart_original: chord_chart,
        key_accumulation: 0
    };
    return song;
}

function parseScheduleSongs(schedule) {
    const raw = schedule.songs;
    if (Array.isArray(raw) && raw.length > 0) {
        return raw.map(slot => ({
            song_id: String(slot.songId != null ? slot.songId : slot.song_id),
            key: slot.key != null ? String(slot.key) : '',
            notes: slot.notes != null ? String(slot.notes) : '',
            songTitulo: slot.songTitulo != null ? String(slot.songTitulo) : ''
        }));
    }
    const items = schedule.items;
    if (!Array.isArray(items)) return [];
    return items
        .filter(it => it && (it.type === 'song' || it.type === 'musica'))
        .map(it => ({
            song_id: String(it.songId != null ? it.songId : it.song_id),
            key: it.key != null ? String(it.key) : '',
            notes: it.notes != null ? String(it.notes) : '',
            songTitulo: it.songTitulo != null ? String(it.songTitulo) : ''
        }));
}

function parseEventDateValue(isoOrStr) {
    if (!isoOrStr) return null;
    const raw = String(isoOrStr).trim();
    if (!raw) return null;

    const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateOnly) {
        const year = Number(dateOnly[1]);
        const monthIndex = Number(dateOnly[2]) - 1;
        const day = Number(dateOnly[3]);
        return new Date(year, monthIndex, day);
    }

    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
}

function formatEventDateForUi(isoOrStr) {
    if (!isoOrStr) return '';
    const d = parseEventDateValue(isoOrStr);
    if (!d) return String(isoOrStr);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
}

function mapScheduleToSetData(schedule) {
    const eventDateIso = schedule.eventDate != null ? String(schedule.eventDate) : '';
    const songs = parseScheduleSongs(schedule);
    const title =
        schedule.name != null
            ? String(schedule.name)
            : schedule.title != null
              ? String(schedule.title)
              : '';

    // Campos opcionais (variam conforme versão/shape do payload)
    var equipeObj = schedule.equipe;
    var teamObj = schedule.team;
    var equipeNome =
        schedule.equipeNome != null
            ? String(schedule.equipeNome)
            : equipeObj && equipeObj.nome != null
              ? String(equipeObj.nome)
              : schedule.teamName != null
                ? String(schedule.teamName)
                : teamObj && teamObj.name != null
                  ? String(teamObj.name)
                  : '';

    var dirObj = schedule.dirigente;
    var dirigenteNome =
        schedule.dirigenteNome != null
            ? String(schedule.dirigenteNome)
            : dirObj && dirObj.nome != null
              ? String(dirObj.nome)
              : schedule.leaderName != null
                ? String(schedule.leaderName)
                : schedule.leader != null
                  ? String(schedule.leader)
                  : '';
    return {
        id: String(schedule.id != null ? schedule.id : ''),
        title,
        date: formatEventDateForUi(eventDateIso),
        eventDateIso,
        songs,
        notes: schedule.notes != null ? String(schedule.notes) : '',
        leader: schedule.leader != null ? String(schedule.leader) : '',
        equipeNome,
        dirigenteNome,
        is_draft: !!schedule.isDraft || !!schedule.is_draft
    };
}

/** Programação com pelo menos uma música (slot com `song_id` não vazio). */
function setDataHasSongs(setData) {
    if (!setData || !Array.isArray(setData.songs) || setData.songs.length === 0) {
        return false;
    }
    return setData.songs.some(s => s.song_id != null && String(s.song_id).trim() !== '');
}

async function fetchMusicasCatalog(cfg) {
    const url = `${buildEigrejaApiUrl(cfg, 'musicas')}?limit=${cfg.musicasLimit}`;
    return fetchPublicJson(url, cfg);
}

async function fetchMusicaById(cfg, songId) {
    const id = encodeURIComponent(String(songId));
    const url = buildEigrejaApiUrl(cfg, `musicas/${id}`);
    return fetchPublicJson(url, cfg);
}

async function fetchProgramacoes(cfg) {
    const url = `${buildEigrejaApiUrl(cfg, 'programacoes')}?limit=${cfg.programacoesLimit}`;
    return fetchPublicJson(url, cfg);
}
