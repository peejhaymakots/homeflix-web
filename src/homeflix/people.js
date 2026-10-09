import { node, action, icon, iconAction, safeImage } from './ui';
import { mediaGrid } from './cards';

const personRole = ({ Type, Role }) => {
    if (['Actor', 'GuestStar'].includes(Type) && Role) return `as ${Role}`;
    if (Role && Role.toLowerCase() !== (Type || '').toLowerCase()) return Role;
    return Type === 'GuestStar' ? 'Guest star' : Type || '';
};

function portrait(client, person, className) {
    const visual = node('span', className, icon('user'));
    const tag = person.PrimaryImageTag || person.ImageTags?.Primary;
    if ((person.Id && tag) || person.profilePath) {
        const source = safeImage(person.Id && tag ? client.getImageUrl(person.Id, { type: 'Primary', tag, maxWidth: 360, quality: 90 }) : `https://image.tmdb.org/t/p/w342${person.profilePath}`);
        if (source) {
            const image = node('img');
            image.src = source; image.alt = ''; image.loading = 'lazy';
            image.addEventListener('error', () => image.remove(), { once: true });
            visual.append(image);
        }
    }
    return visual;
}

export function peopleCards({ people, client, open }) {
    const groups = []; const byId = new Map();
    (people || []).filter(person => person.Name).forEach(person => {
        const identity = person.Id ? `jf:${person.Id}` : person.tmdbId ? `tmdb:${person.tmdbId}` : '';
        const previous = identity && byId.get(identity);
        if (previous) {
            const role = personRole(person);
            if (role && !previous.roles.includes(role)) previous.roles.push(role);
            if (!previous.PrimaryImageTag && person.PrimaryImageTag) previous.PrimaryImageTag = person.PrimaryImageTag;
        } else {
            const entry = { ...person, roles: [personRole(person)].filter(Boolean) };
            groups.push(entry); if (identity) byId.set(identity, entry);
        }
    });
    if (!groups.length) return null;
    const section = node('section', 'hf-people-section');
    const rail = node('div', 'hf-people-rail'); rail.setAttribute('aria-label', 'Cast and crew');
    const scroll = direction => rail.scrollBy({ left: direction * rail.clientWidth * .8, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    const controls = node('div', 'hf-people-controls',
        iconAction('Previous cast and crew', () => scroll(-1), 'chevron', 'hf-people-previous'),
        iconAction('Next cast and crew', () => scroll(1), 'chevron'));
    section.append(node('div', 'hf-people-heading', node('h3', '', 'Cast & Crew'), controls), rail);
    groups.forEach(person => {
        const clickable = (person.Id || person.tmdbId) && open;
        const card = clickable ? action('', () => open(person), 'hf-person-card') : node('div', 'hf-person-card hf-person-card-static');
        if (clickable) card.setAttribute('aria-label', `View ${person.Name}`);
        const roles = person.roles.join(' · ');
        const role = node('span', 'hf-person-role', roles); role.title = roles;
        card.append(portrait(client, person, 'hf-person-portrait'), node('span', 'hf-person-name', person.Name), role);
        rail.append(card);
    });
    return section;
}

export function mergeEntityTitles(items) {
    const kept = [], native = new Map(), catalog = new Map();
    for (const item of [...items].sort((a, b) => Number(!!b.library) - Number(!!a.library))) {
        const jellyfinId = item.jellyfinId || (item.library ? item.id : '');
        const tmdbId = item.tmdbId || item.raw?.ProviderIds?.Tmdb || (!item.library ? item.id : '');
        const key = tmdbId ? `${item.type}:${tmdbId}` : '';
        const previous = (jellyfinId && native.get(jellyfinId)) || (key && catalog.get(key));
        if (previous) { if (!!previous.library === !!item.library) Object.assign(previous, item); continue; }
        const copy = { ...item }; kept.push(copy); if (jellyfinId) native.set(jellyfinId, copy); if (key) catalog.set(key, copy);
    }
    return kept;
}

export function createPersonDetails({ client, userId, getEntityTitles, getPersonTitles, showMedia }) {
    let current;
    const close = () => current?.close();
    function show(person) {
        close();
        const previous = document.activeElement;
        const controller = new AbortController();
        const dialog = node('dialog', 'hf-dialog hf-person-dialog'); current = dialog;
        const alive = () => current === dialog && dialog.open && !controller.signal.aborted;
        const dismiss = () => dialog.close();
        const studio = person.kind === 'studio'; dialog.dataset.kind = studio ? 'studio' : 'person';
        dialog.setAttribute('aria-label', `${person.Name} — ${studio ? 'Studio' : 'Cast & Crew'}`);
        dialog.append(node('div', 'hf-person-toolbar', action('Back to title', dismiss, 'hf-person-back', 'arrow'), iconAction(studio ? 'Close studio details' : 'Close person details', dismiss, 'close')));
        const details = node('div', 'hf-person-information', node('p', 'hf-person-kicker', studio ? 'STUDIO' : 'CAST & CREW'), node('h2', '', person.Name));
        const roles = person.roles?.join(' · ') || personRole(person);
        if (roles) details.append(node('p', 'hf-person-role', roles));
        const biography = node('p', 'hf-person-biography', studio ? 'Movies and series from this studio, in your library and available to request.' : person.Id ? 'Loading biography…' : 'Movies and series from your library and the request catalog.');
        details.append(biography);
        const header = node('header', `hf-person-header${studio ? ' hf-studio-header' : ''}`, studio ? null : portrait(client, person, 'hf-person-profile-portrait'), details);
        const list = node('div', 'hf-person-titles');
        const count = node('p', 'hf-person-count', 'Loading available titles…'); count.setAttribute('role', 'status');
        const controls = node('div', 'hf-entity-controls');
        const titles = node('section', 'hf-person-filmography', node('div', 'hf-person-titles-heading', node('h3', '', 'In your library & by request'), count), list, controls);
        dialog.append(header, titles);
        const branches = {};
        for (const source of getEntityTitles ? ['library', 'catalog'] : ['library']) {
            const branch = { items: [], pages: new Map(), failed: new Map(), page: source === 'library' ? 0 : 1, nextPage: null, loading: false, loaded: false };
            branch.notice = node('p', `hf-person-notice hf-entity-${source}-notice`); branch.notice.setAttribute('role', 'status');
            branch.more = action(source === 'library' ? 'More library titles' : 'More request titles', () => load(source, branch.nextPage), `hf-button hf-person-more hf-person-${source}-more`); branch.more.hidden = true;
            branch.retry = action(source === 'library' ? 'Retry library titles' : 'Retry request titles', () => load(source, branch.failed.values().next().value, true), `hf-button hf-person-retry hf-person-${source}-retry`); branch.retry.hidden = true;
            controls.append(node('div', 'hf-entity-branch', branch.notice, branch.retry, branch.more)); branches[source] = branch;
        }
        dialog.addEventListener('click', event => { if (event.target === dialog) dismiss(); });
        dialog.addEventListener('close', () => {
            controller.abort(); if (current === dialog) current = null; dialog.remove();
            if (previous?.isConnected) previous.focus({ preventScroll: true });
            document.dispatchEvent(new Event('homeflix:dialog'));
        });
        document.body.append(dialog); dialog.showModal(); document.dispatchEvent(new Event('homeflix:dialog'));
        // Biography is optional; an unavailable person record cannot block the authorized titles.
        if (!studio && person.Id) Promise.resolve().then(() => client.getItem(userId, person.Id)).then(raw => {
            if (!alive()) return;
            biography.textContent = raw?.Overview || 'No biography is available.';
            if (raw?.ImageTags?.Primary || raw?.PrimaryImageTag) header.firstElementChild.replaceWith(portrait(client, { ...person, ...raw }, 'hf-person-profile-portrait'));
            const facts = [raw?.PremiereDate ? `Born ${new Date(raw.PremiereDate).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}` : '', ...(raw?.ProductionLocations || [])].filter(Boolean);
            if (facts.length) details.insertBefore(node('p', 'hf-person-facts', facts.join(' · ')), biography);
        }).catch(() => { if (alive()) biography.textContent = 'No biography is available.'; });
        const records = new Map();
        function render() {
            const items = mergeEntityTitles(Object.values(branches).flatMap(branch => branch.items));
            if (items.length) {
                const previousFocus = list.contains(document.activeElement) ? document.activeElement : null;
                let grid = list.querySelector('.hf-grid');
                if (!grid) { grid = node('div', 'hf-grid'); list.append(grid); }
                const keep = new Set();
                items.forEach(item => {
                    const tmdbId = item.tmdbId || item.raw?.ProviderIds?.Tmdb || (!item.library ? item.id : '');
                    const identity = tmdbId ? `${item.type}:${tmdbId}` : `jf:${item.jellyfinId || item.id}`;
                    let record = records.get(identity);
                    if (!record) {
                        const currentItem = { ...item };
                        const card = mediaGrid([currentItem], () => showMedia(currentItem)).firstElementChild;
                        record = { item: currentItem, card }; records.set(identity, record);
                    } else {
                        const changed = record.item.title !== item.title || !!record.item.library !== !!item.library;
                        Object.assign(record.item, item);
                        if (changed) {
                            record.card.querySelector('.hf-card-title').textContent = item.title;
                            const cover = record.card.querySelector('.hf-cover'); cover.setAttribute('aria-label', `Details for ${item.title}`);
                            cover.querySelector('.hf-cover-fallback').textContent = item.title;
                            const fresh = mediaGrid([item], () => {}).firstElementChild;
                            const picture = fresh.querySelector('.hf-cover img'); cover.querySelector('img')?.remove(); if (picture) cover.append(picture);
                            record.card.querySelector('.hf-card-meta').replaceWith(fresh.querySelector('.hf-card-meta'));
                        }
                    }
                    const card = record.card; card.dataset.identity = identity; keep.add(card);
                    card.querySelector('.hf-availability')?.remove();
                    const state = item.library ? 'Play' : /^(pending|processing|requested)$/i.test(item.availability || '') ? item.availability : item.canRequest ? 'Request' : item.availability || 'Requested';
                    card.append(node('span', `hf-availability hf-entity-availability${item.library ? ' hf-entity-playable' : ''}`, state));
                    grid.append(card);
                });
                [...grid.children].filter(card => !keep.has(card)).forEach(card => card.remove());
                if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
            }
            const playable = items.filter(item => item.library).length;
            count.textContent = items.length ? `${playable} in library · ${items.length - playable} in request catalog` : Object.values(branches).some(branch => branch.loading || !branch.loaded) ? 'Loading available titles…' : 'No titles found';
        }
        async function load(source, page, retrying = false) {
            const branch = branches[source];
            if (branch.loading || page == null) return;
            const key = JSON.stringify(page);
            if (!retrying) { branch.frontier = key; branch.nextPage = null; }
            branch.page = page; branch.loading = true; branch.more.disabled = true; branch.retry.hidden = true;
            branch.notice.textContent = source === 'catalog' ? 'Checking the request catalog…' : 'Loading your library…';
            try {
                const result = getEntityTitles ? await getEntityTitles(person, { source, signal: controller.signal, page }) : await getPersonTitles(person.Id, { signal: controller.signal, page });
                if (!alive()) return;
                branch.pages.set(key, mergeEntityTitles([...(branch.pages.get(key) || []), ...(result.items || [])]));
                branch.items = mergeEntityTitles([...branch.pages.values()].flat());
                if (key === branch.frontier) branch.nextPage = result.nextPage ?? null; branch.loaded = true;
                if (result.partial) branch.failed.set(key, page); else branch.failed.delete(key);
                branch.notice.textContent = result.notice || (!branch.items.length ? branch.nextPage !== null ? 'No matching titles on this page. Continue to see more.' : source === 'library' ? 'No titles in your permitted libraries.' : 'No additional request titles found.' : '');
                branch.retry.hidden = !branch.failed.size;
                branch.more.hidden = branch.nextPage === null;
                if(source==='catalog'&&result.libraryEntityId&&branches.library&&!branches.library.loading&&branches.library.resolvedEntityId!==result.libraryEntityId){
                    branches.library.resolvedEntityId=result.libraryEntityId;person.nativeEntityId=result.libraryEntityId;load('library',0,true);
                }
            } catch (error) {
                if (!alive() || error.name === 'AbortError') return;
                branch.loaded = true; branch.failed.set(key, page); branch.retry.hidden = false; branch.more.hidden = branch.nextPage === null;
                branch.notice.textContent = error.message || (source === 'catalog' ? 'Requests is unavailable. Your library titles remain usable.' : 'Your library is unavailable. Please try again.');
            } finally { branch.loading = false; if (alive()) { branch.more.disabled = false; render(); } }
        }
        for (const [source, branch] of Object.entries(branches)) load(source, branch.page);
    }
    return { show, close };
}
