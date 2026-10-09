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
    if (person.Id && tag) {
        const source = safeImage(client.getImageUrl(person.Id, { type: 'Primary', tag, maxWidth: 360, quality: 90 }));
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
        const previous = person.Id && byId.get(person.Id);
        if (previous) {
            const role = personRole(person);
            if (role && !previous.roles.includes(role)) previous.roles.push(role);
            if (!previous.PrimaryImageTag && person.PrimaryImageTag) previous.PrimaryImageTag = person.PrimaryImageTag;
        } else {
            const entry = { ...person, roles: [personRole(person)].filter(Boolean) };
            groups.push(entry); if (person.Id) byId.set(person.Id, entry);
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
        const card = person.Id && open ? action('', () => open(person), 'hf-person-card') : node('div', 'hf-person-card hf-person-card-static');
        if (person.Id && open) card.setAttribute('aria-label', `View ${person.Name}`);
        const roles = person.roles.join(' · ');
        const role = node('span', 'hf-person-role', roles); role.title = roles;
        card.append(portrait(client, person, 'hf-person-portrait'), node('span', 'hf-person-name', person.Name), role);
        rail.append(card);
    });
    return section;
}

export function createPersonDetails({ client, userId, getPersonTitles, showMedia }) {
    let current;
    const close = () => current?.close();
    function show(person) {
        close();
        const previous = document.activeElement;
        const controller = new AbortController();
        const dialog = node('dialog', 'hf-dialog hf-person-dialog'); current = dialog;
        const alive = () => current === dialog && dialog.open && !controller.signal.aborted;
        const dismiss = () => dialog.close();
        dialog.setAttribute('aria-label', `${person.Name} — Cast & Crew`);
        dialog.append(node('div', 'hf-person-toolbar', action('Back to title', dismiss, 'hf-person-back', 'arrow'), iconAction('Close person details', dismiss, 'close')));
        const details = node('div', 'hf-person-information', node('p', 'hf-person-kicker', 'CAST & CREW'), node('h2', '', person.Name));
        const roles = person.roles?.join(' · ') || personRole(person);
        if (roles) details.append(node('p', 'hf-person-role', roles));
        const biography = node('p', 'hf-person-biography', 'Loading biography…');
        details.append(biography);
        const header = node('header', 'hf-person-header', portrait(client, person, 'hf-person-profile-portrait'), details);
        const list = node('div', 'hf-person-titles');
        const count = node('p', 'hf-person-count', 'Loading available titles…'); count.setAttribute('role', 'status');
        const notice = node('p', 'hf-person-notice'); notice.setAttribute('role', 'status');
        const more = action('Show more', () => load(nextPage), 'hf-button hf-person-more'); more.hidden = true;
        const retry = action('Retry titles', () => load(failedPage), 'hf-button hf-person-retry'); retry.hidden = true;
        const titles = node('section', 'hf-person-filmography', node('div', 'hf-person-titles-heading', node('h3', '', 'Available in your library'), count), list, notice, retry, more);
        dialog.append(header, titles);
        let nextPage = null, failedPage = 0, loading = false;
        const seen = new Set();
        dialog.addEventListener('click', event => { if (event.target === dialog) dismiss(); });
        dialog.addEventListener('close', () => {
            controller.abort(); if (current === dialog) current = null; dialog.remove();
            if (previous?.isConnected) previous.focus({ preventScroll: true });
            document.dispatchEvent(new Event('homeflix:dialog'));
        });
        document.body.append(dialog); dialog.showModal(); document.dispatchEvent(new Event('homeflix:dialog'));
        // Biography is optional; an unavailable person record cannot block the authorized titles.
        Promise.resolve().then(() => client.getItem(userId, person.Id)).then(raw => {
            if (!alive()) return;
            biography.textContent = raw?.Overview || 'No biography is available.';
            if (raw?.ImageTags?.Primary || raw?.PrimaryImageTag) header.firstElementChild.replaceWith(portrait(client, { ...person, ...raw }, 'hf-person-profile-portrait'));
            const facts = [raw?.PremiereDate ? `Born ${new Date(raw.PremiereDate).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}` : '', ...(raw?.ProductionLocations || [])].filter(Boolean);
            if (facts.length) details.insertBefore(node('p', 'hf-person-facts', facts.join(' · ')), biography);
        }).catch(() => { if (alive()) biography.textContent = 'No biography is available.'; });
        async function load(page) {
            if (loading || page === null) return;
            loading = true; more.disabled = true; retry.hidden = true; notice.textContent = '';
            try {
                const result = await getPersonTitles(person.Id, { signal: controller.signal, page });
                if (!alive()) return;
                const items = (result.items || []).filter(item => { const id = item.jellyfinId || item.id; if (!id || seen.has(id)) return false; seen.add(id); return true; });
                if (items.length) {
                    const grid = list.querySelector('.hf-grid');
                    const incoming = mediaGrid(items, item => showMedia(item));
                    if (grid) grid.append(...incoming.childNodes); else list.replaceChildren(incoming);
                }
                nextPage = result.nextPage ?? null;
                const total = Math.max(Number(result.total) || seen.size, seen.size);
                count.textContent = total ? `${total} ${total === 1 ? 'title' : 'titles'}${result.total == null && nextPage !== null ? ' shown' : ''}` : 'No available titles';
                if (!seen.size) notice.textContent = nextPage === null ? 'No movies or series for this person are available in this library scope.' : 'No matching titles on this page. Continue to see more.';
                if (result.notice) notice.textContent = result.notice;
                more.hidden = nextPage === null;
            } catch (error) {
                if (!alive() || error.name === 'AbortError') return;
                failedPage = page; retry.hidden = false; more.hidden = true;
                if (!seen.size) count.textContent = 'Titles unavailable';
                notice.textContent = error.message || 'Unable to load available titles. Please try again.';
            } finally { loading = false; if (alive()) more.disabled = false; }
        }
        load(0);
    }
    return { show, close };
}
