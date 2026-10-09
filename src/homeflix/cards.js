import { node, action, iconAction, safeImage, empty } from './ui';

export function mediaCard(item, details, landscape = false) {
    const card = node('article',`hf-card${landscape ? ' hf-card-wide' : ''}`);
    const cover = action('',() => details(item),'hf-cover'); cover.setAttribute('aria-label',`Details for ${item.title}`);
    cover.append(node('span','hf-cover-fallback',item.title));
    const src = safeImage(landscape ? item.backdrop || item.poster : item.poster);
    if (src) { const img = node('img'); img.src = src; img.alt = ''; img.loading = 'lazy'; img.addEventListener('error',() => img.remove(),{once:true}); cover.append(img); }
    if (item.rating) cover.append(node('span','hf-card-rating',`★ ${Number(item.rating).toFixed(1)}`));
    cover.append(node('span','hf-cover-action','View details'));
    if (item.progress) { const track = node('span','hf-progress'); const bar = node('span'); bar.style.width = `${Math.min(100,item.progress)}%`; track.append(bar); cover.append(track); }
    card.append(cover,action(item.title,() => details(item),'hf-card-title'),node('p','hf-card-meta',[item.year,item.episodeLabel || (item.type === 'tv' ? 'Series' : 'Movie'),item.releaseDate ? new Date(item.releaseDate).toLocaleDateString(undefined,{month:'short',day:'numeric'}) : ''].filter(Boolean).join(' · ')));
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
