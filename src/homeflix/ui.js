export const node = (tag, cls, ...children) => {
    const value = document.createElement(tag);
    if (cls) value.className = cls;
    children.filter(x => x !== undefined && x !== null).forEach(x => value.append(x instanceof Node ? x : document.createTextNode(String(x))));
    return value;
};
const paths = {
    play: 'm8 5 11 7-11 7Z', pause: 'M8 5v14M16 5v14', chevron: 'm9 5 7 7-7 7', close: 'm6 6 12 12M6 18 18 6', search: 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
    sparkle: 'm12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4ZM20 2v4M18 4h4', bookmark: 'M6 3h12v18l-6-4-6 4Z', check: 'm5 12 4 4L19 6', sliders: 'M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M10 15v6', user: 'M20 21v-2a6 6 0 0 0-6-6h-4a6 6 0 0 0-6 6v2M16 6a4 4 0 1 1-8 0 4 4 0 0 1 8 0', external: 'M14 3h7v7M21 3 10 14M10 3H4v17h17v-6', arrow: 'M4 12h16m-6-6 6 6-6 6', refresh: 'M20 7a9 9 0 1 0 1 8M20 2v6h-6', volume: 'm3 9 5 0 5-5v16l-5-5H3ZM17 8a6 6 0 0 1 0 8', globe: 'M3 12h18M12 3c6 6 6 12 0 18-6-6-6-12 0-18M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0', star: 'm12 3 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z'
};
export function icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox','0 0 24 24'); svg.setAttribute('fill','none'); svg.setAttribute('stroke','currentColor'); svg.setAttribute('stroke-width','1.7'); svg.setAttribute('stroke-linecap','round'); svg.setAttribute('stroke-linejoin','round'); svg.setAttribute('aria-hidden','true');
    const path = document.createElementNS(svg.namespaceURI,'path'); path.setAttribute('d', paths[name] || paths.chevron); svg.append(path); return svg;
}
export function action(label, run, cls = 'hf-button', symbol) {
    const value = node('button',cls, symbol ? icon(symbol) : null, label); value.type = 'button'; value.addEventListener('click',run); return value;
}
export function iconAction(label, run, symbol, cls = '') {
    const value = action('',run,`hf-icon-button ${cls}`,symbol); value.setAttribute('aria-label',label); value.title = label; return value;
}
export const safeImage = value => {
    try { const url = new URL(value,location.origin); return [location.origin,'https://image.tmdb.org','https://artworks.thetvdb.com'].includes(url.origin) ? url.href : ''; } catch { return ''; }
};
export function select(label, options, value, onChange) {
    const input = node('select'); input.setAttribute('aria-label',label);
    options.forEach(([id,text]) => { const option = node('option','',text); option.value = id; input.append(option); });
    input.value = value ?? options[0]?.[0] ?? ''; if (onChange) input.addEventListener('change',() => onChange(input.value)); return input;
}
export const field = (label, input) => node('label','hf-field',node('span','hf-field-label',label),input);
export const empty = (title, description = '') => node('div','hf-empty',node('h3','',title),description ? node('p','',description) : null);
export function storeUser(key, value) { try { localStorage.setItem(key,JSON.stringify(value)); } catch { /* Browsing works when storage is unavailable. */ } }
export function readUser(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
export function readSession(key, fallback) { try { return JSON.parse(sessionStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
export function storeSession(key, value) { try { sessionStorage.setItem(key,JSON.stringify(value)); } catch { /* Navigation still works without session storage. */ } }
export function external(label, url) {
    try { const parsed = new URL(url); if (parsed.protocol !== 'https:' || !['www.imdb.com','www.themoviedb.org','www.youtube.com','youtube.com','youtu.be'].includes(parsed.hostname)) return null; const link = node('a','hf-button',icon('external'),label); link.href = parsed.href; link.target = '_blank'; link.rel = 'noopener noreferrer'; return link; } catch { return null; }
}
