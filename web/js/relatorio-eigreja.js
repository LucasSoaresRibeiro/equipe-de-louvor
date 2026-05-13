/**
 * Carrega dados do relatório a partir da API pública eIgreja (músicas + programações).
 */
async function loadRelatorioDatasetsFromEigreja() {
    const cfg = getEigrejaPublicConfig();
    const [musicBody, progBody] = await Promise.all([
        fetchMusicasCatalog(cfg),
        fetchProgramacoes(cfg)
    ]);

    const allSongsData = {};
    for (const apiSong of musicBody.songs || []) {
        const s = mapEigrejaSongToEditorSong(apiSong);
        const id = String(s.id);
        allSongsData[id] = {
            songlib_url: '',
            id,
            title: s.title,
            author: s.author,
            notes: '',
            year: '',
            key: s.key,
            ccli: '',
            copyright: '',
            time_sig: s.time_sig || '',
            tempo: '',
            feel: '',
            theme: '',
            tags: '',
            url: s.url || '',
            chord_chart: s.chord_chart || ''
        };
    }

    const allSetsData = [];
    for (const apiSet of progBody.sets || []) {
        const d = mapApiSetToSetData(apiSet);
        if (!d.id || !setDataHasSongs(d)) continue;
        allSetsData.push({
            id: d.id,
            url: '',
            title: d.title,
            notes: d.notes || '',
            date: d.date,
            leader: d.leader || '',
            is_draft: !!d.is_draft,
            songs: (d.songs || []).map((slot, idx) => ({
                song_id: slot.song_id,
                no: String(slot.no != null ? slot.no : idx + 1),
                key: slot.key || '',
                use_b: false,
                notes: slot.notes || ''
            })),
            it_rained: !!(apiSet.itRained || apiSet.it_rained)
        });
    }

    const topWordsData = buildTopWordsFromChordCharts(allSongsData);
    return { allSongsData, allSetsData, topWordsData };
}

function buildTopWordsFromChordCharts(allSongsData) {
    const counts = new Map();
    const skip = new Set([
        'E', 'A', 'O', 'DE', 'DA', 'DO', 'DOS', 'DAS', 'EM', 'OS', 'AS', 'UM', 'UMA',
        'TEM', 'SUA', 'SEU', 'QUE', 'COM', 'POR', 'NÃO', 'NA', 'NO', 'NOS', 'NAS'
    ]);
    for (const song of Object.values(allSongsData)) {
        const text = (song.chord_chart || '') + '\n' + (song.title || '');
        const words = text
            .toUpperCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^A-Z\s]/g, ' ')
            .split(/\s+/);
        for (const w of words) {
            if (w.length < 3) continue;
            if (skip.has(w)) continue;
            counts.set(w, (counts.get(w) || 0) + 1);
        }
    }
    return Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 80)
        .map(([word, c]) => [word, c]);
}
