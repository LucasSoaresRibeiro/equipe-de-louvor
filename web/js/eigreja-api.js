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

/** Converte data exibida DD/MM/AAAA (retorno em `sets`) para ISO AAAA-MM-DD. */
function parseBrDisplayDateToIso(brDate) {
    if (!brDate) return '';
    const s = String(brDate).trim();
    const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return '';
    return `${m[3]}-${m[2]}-${m[1]}`;
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

/**
 * Mapeia um item de `GET …/programacoes` → `sets[]` para o formato usado no editor / cards.
 * O payload público já traz título, data (DD/MM/AAAA), equipe e faixas com `song_id`.
 */
function mapApiSetToSetData(apiSet) {
    if (!apiSet || typeof apiSet !== 'object') return null;
    const rawEvent = apiSet.eventDate != null ? String(apiSet.eventDate).trim() : '';
    const eventDateIso = rawEvent || parseBrDisplayDateToIso(apiSet.date);
    const dateUi =
        apiSet.date != null && String(apiSet.date).trim()
            ? String(apiSet.date).trim()
            : formatEventDateForUi(eventDateIso);

    const songsRaw = Array.isArray(apiSet.songs) ? apiSet.songs : [];
    const songs = songsRaw
        .map((slot, idx) => {
            const sid =
                slot.song_id != null
                    ? slot.song_id
                    : slot.songId != null
                      ? slot.songId
                      : '';
            const song_id = sid != null && sid !== '' ? String(sid).trim() : '';
            return {
                song_id,
                no: slot.no != null ? String(slot.no) : String(idx + 1),
                key: slot.key != null ? String(slot.key) : '',
                notes: slot.notes != null ? String(slot.notes) : '',
                songTitulo: slot.songTitulo != null ? String(slot.songTitulo) : ''
            };
        })
        .filter(s => s.song_id);

    return {
        id: String(apiSet.id != null ? apiSet.id : ''),
        title: apiSet.title != null ? String(apiSet.title) : '',
        date: dateUi,
        eventDateIso,
        songs,
        notes: apiSet.notes != null ? String(apiSet.notes) : '',
        leader: apiSet.leader != null ? String(apiSet.leader) : '',
        equipeNome: apiSet.equipeNome != null ? String(apiSet.equipeNome) : '',
        dirigenteNome: apiSet.dirigenteNome != null ? String(apiSet.dirigenteNome) : '',
        is_draft: !!apiSet.is_draft || !!apiSet.isDraft
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
