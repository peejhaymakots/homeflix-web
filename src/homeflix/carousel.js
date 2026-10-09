import { node, action, iconAction, safeImage } from './ui';

export function createCarousel(root, titles, { play, details }) {
    const items = titles.slice(0,5); let index = 0, paused = false, hover = false, focused = false, timer, startX;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    root.replaceChildren(); root.hidden = !items.length; if (!items.length) return () => {};
    root.setAttribute('aria-roledescription','carousel'); root.setAttribute('aria-label','New on HomeFlix');
    const artwork = node('div','hf-hero-art'); const copy = node('div','hf-hero-copy');
    const dots = node('div','hf-carousel-dots'); const pause = iconAction('Pause slideshow',() => { paused = !paused; updatePause(); schedule(); },'pause');
    const previous = iconAction('Previous featured title',() => change(-1),'chevron','hf-previous'); const next = iconAction('Next featured title',() => change(1),'chevron');
    const controls = node('div','hf-carousel-controls',previous,dots,next,pause); root.append(artwork,copy,controls);
    const indicators = items.map((item,i) => { const dot = action('',() => { index=i; render(); schedule(); },'hf-carousel-dot'); dot.setAttribute('aria-label',`Show ${item.title}`); dots.append(dot); return dot; });
    function updatePause() { pause.replaceChildren(); const fresh = iconAction(paused ? 'Resume slideshow' : 'Pause slideshow',() => {},paused ? 'play' : 'pause'); pause.append(...fresh.childNodes); pause.setAttribute('aria-label',paused ? 'Resume slideshow' : 'Pause slideshow'); pause.setAttribute('aria-pressed',String(paused)); }
    function render() {
        const item = items[index]; const image = safeImage(item.backdrop || item.poster); artwork.style.backgroundImage = image ? `url("${image}")` : '';
        copy.replaceChildren(node('p','hf-eyebrow','NEW ON HOMEFLIX'),node('h1','',item.title),node('p','hf-hero-meta',[item.year,item.rating ? `★ ${Number(item.rating).toFixed(1)}` : '',...(item.genres || []).slice(0,2)].filter(Boolean).join(' · ')),node('p','hf-hero-description',item.overview || ''),node('div','hf-actions',action(item.progress ? 'Resume' : 'Play',() => play(item),'hf-button hf-primary','play'),action('Details',() => details(item),'hf-button hf-glass')));
        indicators.forEach((dot,i) => dot.setAttribute('aria-current',String(i===index)));
        root.dataset.slide = String(index); root.setAttribute('aria-label',`New on HomeFlix · ${index+1} of ${items.length}`);
    }
    function change(amount) { index=(index+amount+items.length)%items.length; render(); schedule(); }
    function schedule() { clearTimeout(timer); if (items.length > 1 && !paused && !hover && !focused && !document.hidden && !document.querySelector('dialog[open]') && !motion.matches) timer=setTimeout(() => { change(1); },8000); }
    const enter = () => { hover=true; schedule(); }, leave = () => { hover=false; schedule(); };
    const focus = () => { focused=true; schedule(); }, blur = () => { focused=root.contains(document.activeElement); schedule(); };
    const visibility = () => schedule();
    const touchstart = event => { startX=event.changedTouches[0].clientX; }, touchend = event => { const distance=event.changedTouches[0].clientX-startX; if(Math.abs(distance)>50)change(distance>0?-1:1); };
    root.addEventListener('mouseenter',enter); root.addEventListener('mouseleave',leave); root.addEventListener('focusin',focus); root.addEventListener('focusout',blur); root.addEventListener('touchstart',touchstart,{passive:true}); root.addEventListener('touchend',touchend,{passive:true});
    document.addEventListener('visibilitychange',visibility); document.addEventListener('homeflix:dialog',visibility); motion.addEventListener('change',visibility);
    render(); updatePause(); schedule();
    return () => { clearTimeout(timer); root.removeEventListener('mouseenter',enter); root.removeEventListener('mouseleave',leave); root.removeEventListener('focusin',focus); root.removeEventListener('focusout',blur); root.removeEventListener('touchstart',touchstart); root.removeEventListener('touchend',touchend); document.removeEventListener('visibilitychange',visibility); document.removeEventListener('homeflix:dialog',visibility); motion.removeEventListener('change',visibility); };
}
