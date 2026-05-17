/**
 * Configuração da API pública eIgreja (slug, base URL, chave opcional, URL de partilha).
 * Prioridade: query string (?church= / ?slug=, ?apiBase=, ?syncKey=, ?publicAppUrl=) → constantes abaixo.
 */
const EIGREJA_DEFAULTS = {
    /** Slug da igreja (ex.: o mesmo de https://eigreja.com/{slug}/...) */
    churchSlug: 'ibm',
    apiBase: 'https://eigreja.com/api/public/v1',
    // apiBase: 'http://localhost:9003/api/public/v1',
    /** Chave opcional (mesmo valor que EIGREJA_PUBLIC_SYNC_API_KEY no servidor) */
    syncApiKey: 'eig_B_4iJz1KHBYy276UatapMOADy1kj4zyK',
    /** Origem usada em links de partilha (WhatsApp, etc.); vazio = derivar da página atual */
    publicAppUrl: '',
    musicasLimit: 500,
    programacoesLimit: 300
};

function getEigrejaPublicConfig() {
    const q = new URLSearchParams(window.location.search);
    const slug =
        q.get('church') ||
        q.get('slug') ||
        EIGREJA_DEFAULTS.churchSlug;
    const apiBase = (q.get('apiBase') || EIGREJA_DEFAULTS.apiBase || '').replace(/\/+$/, '');
    const syncApiKey = q.get('syncKey') || EIGREJA_DEFAULTS.syncApiKey || '';
    let publicAppUrl = q.get('publicAppUrl') || EIGREJA_DEFAULTS.publicAppUrl || '';
    if (!publicAppUrl && typeof window !== 'undefined' && window.location) {
        publicAppUrl = `${window.location.origin}${window.location.pathname}`;
    }
    const musicasLimit = Math.min(
        500,
        Math.max(1, parseInt(q.get('musicasLimit') || String(EIGREJA_DEFAULTS.musicasLimit), 10) || EIGREJA_DEFAULTS.musicasLimit)
    );
    const programacoesLimit = Math.min(
        300,
        Math.max(1, parseInt(q.get('programacoesLimit') || String(EIGREJA_DEFAULTS.programacoesLimit), 10) || EIGREJA_DEFAULTS.programacoesLimit)
    );
    return {
        churchSlug: slug,
        apiBase,
        syncApiKey: syncApiKey.trim(),
        publicAppUrl: publicAppUrl.replace(/\/+$/, ''),
        musicasLimit,
        programacoesLimit
    };
}

function getPublicShareUrlForSong(songId) {
    const base = getEigrejaPublicConfig().publicAppUrl || `${window.location.origin}${window.location.pathname}`;
    const u = new URL(base, window.location.href);
    u.searchParams.set('songs', String(songId));
    return u.toString();
}
