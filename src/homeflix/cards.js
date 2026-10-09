import { node, action, iconAction, safeImage, empty } from './ui';

let context;
const cardItems = new WeakMap();
const dateText = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
export function configureCards(options) {
    context?.close();
    const controller = new AbortController(), cache = new Map(), queue = [];
    let busy = 0, timer, nextStart = 0;
    const current = { ...options, close() { controller.abort(); observer.disconnect(); clearTimeout(timer); document.removeEventListener('homeflix:watchlist', refresh); if (context === current) context = undefined; } };
    function refresh() { document.querySelectorAll('.hf-card-watchlist').forEach(button => updateBookmark(button, cardItems.get(button), current)); }
    async function drain() {
        if (controller.signal.aborted || busy >= 2 || !queue.length) return;
        if (Date.now() < nextStart) { clearTimeout(timer); timer = setTimeout(drain, nextStart - Date.now()); return; }
        const { card, item } = queue.shift();
        if (!card.isConnected) { timer = setTimeout(drain, 0); return; }
        busy++; nextStart = Date.now() + 1300;
        try {
            const key = `${item.library ? 'jf' : item.type}:${item.jellyfinId || item.id || item.tmdbId}`;
            if (!cache.has(key)) { if (cache.size >= 120) cache.delete(cache.keys().next().value); cache.set(key, options.metadata(item, controller.signal)); }
            const metadata = await cache.get(key);
            if (!controller.signal.aborted && card.isConnected) updateCardMetadata(card, { ...item, ...metadata });
        } catch { /* Artwork and native metadata remain usable during enrichment outages. */ }
        finally { busy--; if (!controller.signal.aborted) timer = setTimeout(drain, 1200); }
    }
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);
        queue.push({ card: entry.target, item: cardItems.get(entry.target) }); drain();
    }), { threshold: .1 });
    current.observe = card => observer.observe(card);
    context = current; document.addEventListener('homeflix:watchlist', refresh);
    return current.close;
}
function updateBookmark(button, item, owner) {
    const saved = !!owner?.isSaved?.(item);
    button.setAttribute('aria-pressed', String(saved));
    const label = `${saved ? 'Remove from' : 'Add to'} My List: ${item.title}`;
    button.setAttribute('aria-label', label); button.title = label;
}
export function updateCardMetadata(card, item) {
    const meta = card.querySelector('.hf-card-meta');
    meta.replaceChildren();
    if (item.rating) meta.append(node('span', 'hf-card-rating', `Rating ${Number(item.rating).toFixed(1)}`));
    meta.append(node('span', 'hf-card-year', item.year || ''));
    const facts = card.querySelector('.hf-card-facts'); facts.replaceChildren();
    const uploaded = dateText(item.uploaded || item.raw?.DateCreated);
    const origin = (item.origin || (item.raw?.ProductionLocations || []).join(', ')).replace(/^Origin:\s*/i, '').replace(/\s*\|\s*Language:.*$/i, '');
    const language = item.originalLanguage || '';
    let languageName = language;
    try { if (/^[a-z]{2,3}$/i.test(language)) languageName = new Intl.DisplayNames(['en'], { type: 'language' }).of(language.toLowerCase()); } catch { /* Keep the verified language code. */ }
    const rows = [item.episodeLabel, uploaded ? `Uploaded: ${uploaded}` : '', [origin ? `Origin: ${origin}` : '', languageName ? `Language: ${languageName}` : ''].filter(Boolean).join(' | '), item.genres?.length ? `Genre: ${item.genres.join(', ')}` : ''];
    rows.filter(Boolean).forEach(value => facts.append(node('p', '', value)));
    const badge = card.querySelector('.hf-card-status'); badge.textContent = item.library ? 'In the library' : /^(Pending|Processing|Requested)$/i.test(item.availability || '') ? item.availability : item.canRequest ? 'By request' : item.availability || 'Coming soon';
    badge.classList.toggle('hf-card-status-library', !!item.library);
}

export function mediaCard(item, details, landscape = false) {
    const card = node('article',`hf-card${landscape ? ' hf-card-wide' : ''}`);
    const cover = action('',() => details(item),'hf-cover'); cover.setAttribute('aria-label',`Details for ${item.title}`);
    cover.append(node('span','hf-cover-fallback',item.title));
    const src = safeImage(landscape ? item.backdrop || item.poster : item.poster);
    if (src) { const img = node('img'); img.src = src; img.alt = ''; img.loading = 'lazy'; img.addEventListener('error',() => img.remove(),{once:true}); cover.append(img); }
    cover.append(node('span','hf-cover-action','View details'));
    if (item.progress) { const track = node('span','hf-progress'); const bar = node('span'); bar.style.width = `${Math.min(100,item.progress)}%`; track.append(bar); cover.append(track); }
    const visual = node('div', 'hf-card-artwork', cover, node('span', 'hf-card-status'));
    if (context?.toggleList) {
        const owner = context;
        const bookmark = iconAction('', () => { if (context !== owner) return; owner.toggleList(item); }, 'bookmark', 'hf-card-watchlist');
        cardItems.set(bookmark, item); updateBookmark(bookmark, item, owner); visual.append(bookmark);
    }
    const meta=node('p','hf-card-meta');
    card.append(visual,meta,action(item.title,() => details(item),'hf-card-title'),node('div','hf-card-facts'));
    updateCardMetadata(card, item); cardItems.set(card, item);
    if (!landscape && context?.metadata) context.observe(card);
    if (!item.library && item.availability) card.append(node('span','hf-availability',item.availability));
    return card;
}
export function mediaGrid(items, details, rail = false, landscape = false) {
    const grid = node('div',`${rail ? 'hf-rail' : 'hf-grid'}${landscape ? ' hf-wide-grid' : ''}`);
    items.forEach(item => grid.append(mediaCard(item,details,landscape)));
    if (!items.length) grid.append(empty('No titles here yet.')); return grid;
}
export function mediaSection(title, items, details, all, landscape = false) {
    const section = node('section','hf-section'); const rail = mediaGrid(items,details,true,landscape);
    const tools = node('div','hf-section-tools');
    if (all) tools.append(action('View all',all,'hf-text-button'));
    const left = iconAction(`Previous ${title}`,() => rail.scrollBy({left:-rail.clientWidth * 0.8,behavior:'smooth'}),'chevron','hf-previous');
    tools.append(left,iconAction(`Next ${title}`,() => rail.scrollBy({left:rail.clientWidth * 0.8,behavior:'smooth'}),'chevron'));
    section.append(node('div','hf-section-heading',node('h2','',title),tools),rail); return section;
}
