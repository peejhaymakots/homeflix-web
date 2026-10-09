import { ServerConnections } from 'lib/jellyfin-apiclient';
import Dashboard from 'utils/dashboard';
import { playbackManager } from 'components/playback/playbackmanager';
import { homeflixApi } from './api';
import './homeflix.scss';

const el = (tag, cls, content) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (content !== undefined) node.textContent = String(content);
    return node;
};
const button = (label, action, cls = 'hf-button') => {
    const node = el('button', cls, label);
    node.type = 'button';
    node.addEventListener('click', action);
    return node;
};
const safeImage = value => {
    try { const url = new URL(value, location.origin); return [location.origin, 'https://image.tmdb.org', 'https://artworks.thetvdb.com'].includes(url.origin) ? url.href : ''; } catch { return ''; }
};

export function createHomeflix(root) {
    let client, userId, active = false, generation = 0, searchTimer, requestController, summaryTimer;
    let currentView = 'home', catalogAllowed = false, requestReady = false, language = 'english', currentDialog, summaryGeneration = 0, summaryCooldown = 0;
    let aiPrompt = '', aiHistory = [], aiPage = 1, aiStudio, aiCatalog = false, browsePage = 1, aiCooldown = 0;
    const libraryItems = new Map();
    const key = () => `homeflix.list.${client.serverId()}.${userId}`;
    const loadList = () => { try { return JSON.parse(localStorage.getItem(key()) || '[]').slice(0, 200); } catch { return []; } };
    const savedId = item => item.library ? `jf:${item.id}` : `tmdb:${item.type}:${item.id || item.tmdbId}`;
    const toggleList = item => {
        const entries = loadList(); const id = savedId(item); const existing = entries.findIndex(x => x.key === id);
        if (existing >= 0) entries.splice(existing, 1); else entries.push({ key: id, id: item.id || item.tmdbId, type: item.type, library: !!item.library });
        localStorage.setItem(key(), JSON.stringify(entries.slice(-200)));
        message(existing >= 0 ? 'Removed from My List.' : 'Saved to My List.');
    };
    root.innerHTML = `<div class="hf-app">
      <header class="hf-header"><button type="button" class="hf-brand" aria-label="HomeFlix home">HomeFlix<span>TV</span></button><nav class="hf-nav" aria-label="HomeFlix navigation"></nav><div class="hf-user-tools"></div></header>
      <main><section class="hf-hero" aria-label="Featured title"></section>
      <div class="hf-content"><div class="hf-heading"><div><p class="hf-eyebrow">YOUR NEXT GREAT WATCH</p><h1>Welcome to HomeFlix</h1></div><div class="hf-search"><label class="hf-sr-only" for="hf-search">Search movies and series</label><input id="hf-search" type="search" placeholder="Search movies and series…" autocomplete="off"><button type="button" class="hf-search-clear" aria-label="Clear search">×</button></div></div>
      <div class="hf-status" role="status" aria-live="polite"></div><div class="hf-controls"></div><div class="hf-results"></div></div></main>
      <footer>HomeFlix TV <span>Powered by Jellyfin · Local preview</span></footer></div>`;
    const nav = root.querySelector('.hf-nav'), results = root.querySelector('.hf-results'), controls = root.querySelector('.hf-controls');
    const heading = root.querySelector('h1'), hero = root.querySelector('.hf-hero'), status = root.querySelector('.hf-status'), search = root.querySelector('#hf-search');
    const message = value => { status.textContent = value || ''; };
    const clear = () => { generation++; requestController?.abort(); requestController = new AbortController(); controls.replaceChildren(); results.replaceChildren(); message(''); hero.hidden = true; };
    const libraryQuery = options => client.getItems(userId, { Recursive: true, IncludeItemTypes: 'Movie,Series', Fields: 'Overview,Genres,ProviderIds', EnableUserData: true, Limit: 40, ...options });
    const api = (path, body) => homeflixApi(path, body, { client, signal: requestController?.signal });
    const image = (item, type = 'Primary') => safeImage(client.getImageUrl(item.Id, { type, maxWidth: type === 'Backdrop' ? 1600 : 400, quality: 90 }));
    function normalize(item) {
        libraryItems.set(item.Id, item);
        const title = item.Type === 'Episode' && item.SeriesName ? `${item.SeriesName} · S${item.ParentIndexNumber ?? 0} E${item.IndexNumber ?? 0} · ${item.Name}` : item.Name;
        return { id: item.Id, title, year: item.ProductionYear, overview: item.Overview, genres: item.Genres || [],
            rating: item.CommunityRating, type: item.Type === 'Movie' ? 'movie' : 'tv', library: true, poster: image(item),
            jellyfinId: item.Id, progress: item.UserData?.PlayedPercentage || 0, raw: item };
    }
    function card(item) {
        const article = el('article', 'hf-card');
        const cover = button('', () => showDetails(item), 'hf-cover'); cover.setAttribute('aria-label', `Details for ${item.title}`);
        const poster = safeImage(item.poster);
        if (poster) { const img = el('img'); img.src = poster; img.alt = ''; img.loading = 'lazy'; img.addEventListener('error', () => img.remove(), { once: true }); cover.append(img); }
        cover.append(el('span', 'hf-cover-fallback', item.title));
        if (item.progress) { const bar = el('span', 'hf-progress'); bar.style.width = `${Math.min(100, item.progress)}%`; cover.append(bar); }
        const flag = item.library ? 'IN YOUR LIBRARY' : item.releaseDate ? new Date(item.releaseDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : item.availability || 'DISCOVER';
        article.append(cover, el('span', 'hf-badge', flag), button(item.title, () => showDetails(item), 'hf-card-title'), el('p', 'hf-card-meta', [item.year, item.type === 'tv' ? 'Series' : 'Movie', item.rating ? `★ ${Number(item.rating).toFixed(1)}` : ''].filter(Boolean).join(' · ')));
        return article;
    }
    function grid(items, target = results, rail = false) {
        const node = el('div', rail ? 'hf-rail' : 'hf-grid');
        items.forEach(item => node.append(card(item)));
        target.append(node);
        if (!items.length) target.append(el('p', 'hf-empty', 'No titles to show here yet.'));
    }
    function section(title, items) { const node = el('section', 'hf-section'); node.append(el('h2', '', title)); grid(items, node, true); results.append(node); }
    function actionError(error) { if (error.name !== 'AbortError') message(error.message); }
    function play(item) {
        const raw = item.raw || libraryItems.get(item.jellyfinId);
        closeDetails();
        if (raw && raw.Type !== 'Series') {
            raw.ServerId = client.serverId();
            playbackManager.play({ items: [raw], startPosition: raw.UserData?.PlaybackPositionTicks || 0 }).catch(actionError);
        } else Dashboard.navigate(`details?id=${encodeURIComponent(item.jellyfinId || item.id)}&serverId=${client.serverId()}`);
    }
    async function home() {
        const ticket = generation;
        heading.textContent = 'Your movie night starts here'; message('Loading your library…');
        const [latest, resume, series] = await Promise.allSettled([
            libraryQuery({ SortBy: 'DateCreated', SortOrder: 'Descending', IncludeItemTypes: 'Movie', Limit: 20 }),
            client.ajax({ type: 'GET', url: client.getUrl(`Users/${userId}/Items/Resume`, { Limit: 12, MediaTypes: 'Video', Fields: 'Overview,Genres,ProviderIds' }), dataType: 'json' }),
            libraryQuery({ SortBy: 'DateCreated', SortOrder: 'Descending', IncludeItemTypes: 'Episode', Limit: 20 })
        ]);
        if (ticket !== generation || !active) return;
        message('');
        const movies = latest.status === 'fulfilled' ? latest.value.Items.map(normalize) : [];
        const continued = resume.status === 'fulfilled' ? resume.value.Items.map(normalize) : [];
        const episodes = series.status === 'fulfilled' ? series.value.Items.map(normalize) : [];
        if (movies[0]) {
            hero.replaceChildren(); hero.hidden = false;
            const featured = movies[0]; const backdrop = safeImage(image(featured.raw, 'Backdrop'));
            if (backdrop) hero.style.backgroundImage = `linear-gradient(90deg,#0a1012 4%,rgba(10,16,18,.78) 42%,rgba(10,16,18,.12)),linear-gradient(0deg,#0a1012,transparent 70%),url("${backdrop}")`;
            const copy = el('div', 'hf-hero-copy'); copy.append(el('p', 'hf-eyebrow', 'NEW ON HOMEFLIX'), el('h2', '', featured.title), el('p', 'hf-hero-meta', [featured.year, ...featured.genres.slice(0, 3)].join(' · ')), el('p', 'hf-hero-description', featured.overview || 'Something new for your next movie night.'));
            const actions = el('div', 'hf-actions'); actions.append(button('▶ Watch now', () => play(featured), 'hf-button hf-primary'), button('More details', () => showDetails(featured))); copy.append(actions); hero.append(copy);
        }
        if (continued.length) section('Continue Watching', continued);
        section('Recently Added Movies', movies); if (episodes.length) section('Latest Episodes', episodes);
        if (catalogAllowed) {
            try { const upcoming = await api('upcoming'); if (ticket === generation) section('Coming Soon', upcoming.items.map(x => ({ ...x, id: x.tmdbId }))); } catch { /* Core library remains usable. */ }
            if (requestReady) {
                try { const top = await api('requests/browse?view=movies&sortBy=voteAverage.desc&voteCountGte=50'); if (ticket === generation) section('Highly Rated · Discover', top.items); } catch { /* Discovery never blocks playback. */ }
            }
        }
        if (latest.status === 'rejected') message('The library could not load. Use Refresh to try again.');
    }
    async function browse(kind, reset = true) {
        const ticket = generation; heading.textContent = kind === 'Movie' ? 'Movies' : 'Series';
        if (reset) {
            browsePage = 1;
            const sort = el('select'); sort.setAttribute('aria-label', 'Sort library');
            [['SortName','Title A–Z'],['DateCreated','Recently added'],['CommunityRating','Highest rated']].forEach(([value,label]) => { const o = el('option','',label); o.value=value; sort.append(o); });
            const genre = el('input'); genre.placeholder = 'Genre (optional)'; genre.setAttribute('aria-label','Filter by genre');
            const year = el('input'); year.type='number'; year.placeholder='Year'; year.min='1900'; year.max='2100'; year.setAttribute('aria-label','Filter by year');
            controls.append(sort,genre,year,button('Apply',()=> { browsePage=1; results.replaceChildren(); load(); }));
        }
        async function load() {
            const start = ++generation; message('Loading…'); const values=controls.querySelectorAll('select,input');
            try {
                const data = await libraryQuery({ IncludeItemTypes:kind, SortBy:values[0].value, SortOrder:values[0].value==='SortName'?'Ascending':'Descending', StartIndex:(browsePage-1)*40, Genres:values[1].value || undefined, Years:values[2].value || undefined });
                if(start!==generation || !active)return; results.querySelector('.hf-more')?.remove(); grid(data.Items.map(normalize)); message('');
                if((browsePage-1)*40+data.Items.length<data.TotalRecordCount)results.append(button('Load more',()=>{browsePage++;load();},'hf-button hf-more'));
            }catch(error){actionError(error);}
        }
        if(ticket===generation)await load();
    }
    async function reconnect() {
        if(!catalogAllowed){message('Catalog discovery and Requests are unavailable for this restricted profile.');return;}
        heading.textContent='Connect Requests';
        const form=el('form','hf-panel hf-reconnect'); form.append(el('h2','','Connect your HomeFlix requests'),el('p','','Your Jellyfin playback remains available. Sign in here to reconnect Requests.'));
        const name=el('input');name.placeholder='Jellyfin username';name.autocomplete='username';name.required=true;name.setAttribute('aria-label','Jellyfin username');
        const pass=el('input');pass.type='password';pass.placeholder='Password';pass.autocomplete='current-password';pass.required=true;pass.setAttribute('aria-label','Password');
        const submit=el('button','hf-button hf-primary','Connect Requests');submit.type='submit';
        form.append(name,pass,submit);results.append(form);
        form.addEventListener('submit',async e=>{e.preventDefault();submit.disabled=true;try{await api('requests/login',{username:name.value,password:pass.value});pass.value='';requestReady=true;sessionStorage.removeItem('homeflix.requests.error');await navigate('discover');}catch(error){pass.value='';message(error.message);}finally{submit.disabled=false;}});
    }
    async function discover(view='discover', append=false) {
        if(!requestReady)return reconnect();const ticket=generation;heading.textContent=view==='mine'?'My Requests':'Discover something new';
        if(!append){browsePage=1;const tabs=el('div','hf-pills');[['discover','Trending'],['movies','Movies'],['series','Series']].forEach(([value,label])=>tabs.append(button(label,()=>{clear();discover(value);},value===view?'hf-button hf-primary':'hf-button')));if(view!=='mine')controls.append(tabs);}
        message('Checking the catalog…');
        try{const data=await api(view==='mine'?`requests/mine?page=${browsePage}`:`requests/browse?view=${view}&page=${browsePage}`);if(ticket!==generation)return;message('');results.querySelector('.hf-more')?.remove();
            if(view==='mine'){data.items.forEach(item=>{const row=el('div','hf-request-row');row.append(el('h3','',item.title||`Request #${item.id}`),el('span','hf-badge',item.status),button('Details',()=>showDetails({id:item.mediaId,type:item.type,title:item.title||'Requested title'})));results.append(row);});if(!data.items.length)results.append(el('p','hf-empty','You have no requests yet.'));}
            else grid(data.items);
            if(data.nextPage)results.append(button('Load more',()=>{browsePage=data.nextPage;discover(view,true);},'hf-button hf-more'));
        }catch(error){if(error.status===401){requestReady=false;results.replaceChildren();reconnect();}actionError(error);}
    }
    function ai() {
        heading.textContent='Find your next watch';
        const form=el('form','hf-ai-form hf-panel');form.append(el('p','hf-eyebrow','HOMEFLIX AI'),el('h2','','What are you in the mood for?'),el('p','','Describe a story, mood, actor, or studio. HomeFlix checks real titles before suggesting them.'));
        const prompt=el('textarea');prompt.maxLength=500;prompt.rows=3;prompt.placeholder='A mystery series with clever twists…';prompt.setAttribute('aria-label','What would you like to watch?');prompt.value=aiPrompt;
        const source=el('select');source.setAttribute('aria-label','Recommendation source');[['library','My available library'],['catalog','Discover and request']].forEach(([value,label])=>{if(value==='catalog'&&!catalogAllowed)return;const o=el('option','',label);o.value=value;source.append(o);});
        const lang=el('select');lang.setAttribute('aria-label','AI language');[['english','English'],['tagalog','Tagalog'],['bisaya','Bisaya']].forEach(([value,label])=>{const o=el('option','',label);o.value=value;lang.append(o);});lang.value=language;
        const media=el('select');media.setAttribute('aria-label','Media type');[['movie','Movies'],['tv','Series']].forEach(([value,label])=>{const o=el('option','',label);o.value=value;media.append(o);});
        const submit=el('button','hf-button hf-primary','Find recommendations');submit.type='submit';const picks=el('div','hf-ai-picks');
        const fields=el('div','hf-ai-options');fields.append(source,lang,media,submit);form.append(prompt,fields);controls.append(form);results.append(picks);
        let previousSource='';let previousType='';
        const resetPicks = () => { if (Date.now() >= aiCooldown) { submit.disabled=false; submit.textContent='Find recommendations'; } };
        prompt.addEventListener('input', resetPicks); source.addEventListener('change', resetPicks); media.addEventListener('change', resetPicks); lang.addEventListener('change', resetPicks);
        form.addEventListener('submit',async e=>{e.preventDefault();if(source.value==='catalog'&&!requestReady){results.replaceChildren();reconnect();return;}if(!prompt.value.trim())return;
            if(prompt.value.trim()!==aiPrompt||source.value!==previousSource||media.value!==previousType){aiPrompt=prompt.value.trim();aiHistory=[];aiPage=1;aiStudio=undefined;aiCatalog=false;}previousSource=source.value;previousType=media.value;language=lang.value;
            submit.disabled=true;const ticket=generation;message('Checking real titles for your next watch…');
            try{const data=await api(source.value==='library'?'recommend':'requests/ai',{prompt:aiPrompt,exclude:aiHistory,language,type:media.value,...(source.value==='catalog'?{page:aiPage,...(aiStudio===undefined?{}:{studioId:aiStudio})}:{})});if(ticket!==generation)return;
                if(data.studios?.length){picks.replaceChildren();data.studios.forEach(studio=>picks.append(button(`${studio.name} · ${studio.country||studio.originCountry||'Studio'}`,()=>{aiStudio=studio.id;submit.disabled=false;form.requestSubmit();},'hf-button hf-studio')));message(data.message);return;}
                const items=data.items.map(x=>source.value==='library'?{...x,library:true,jellyfinId:x.id,poster:safeImage(client.getImageUrl(x.id,{type:'Primary',maxWidth:400}))}:x);
                aiHistory.push(...items.map(x=>source.value==='library'?x.id:`${x.type}:${x.id}`));aiHistory=aiHistory.slice(-100);aiPage=data.nextPage;aiCatalog=data.catalog===true;picks.replaceChildren();grid(items,picks);message(data.message||data.reason||'Here are your picks.');submit.textContent=source.value==='catalog'&&aiCatalog?'Load more titles':'Find more picks';
            }catch(error){actionError(error);if(error.retryAfter){aiCooldown=Date.now()+error.retryAfter*1000;setTimeout(()=>{if(active&&ticket===generation)submit.disabled=false;},error.retryAfter*1000);return;}}
            finally{if(ticket===generation)submit.disabled=Date.now()<aiCooldown||(source.value==='catalog'&&aiPage===null&&aiHistory.length>0);}
        });
    }
    function closeDetails(){summaryGeneration++;clearTimeout(summaryTimer);currentDialog?.close();currentDialog?.remove();currentDialog=null;}
    async function showDetails(item) {
        closeDetails(); const dialog=el('dialog','hf-dialog');currentDialog=dialog;let activeItem=item;
        const body=el('div','hf-detail-body');dialog.append(button('×',closeDetails,'hf-close'));dialog.querySelector('.hf-close').setAttribute('aria-label','Close details');dialog.append(body);document.body.append(dialog);dialog.showModal();
        dialog.addEventListener('close',()=>{summaryGeneration++;clearTimeout(summaryTimer);if(currentDialog===dialog)currentDialog=null;dialog.remove();});dialog.addEventListener('click',e=>{if(e.target===dialog)closeDetails();});
        body.append(el('h2','',item.title),el('p','','Loading details…'));
        try{
            if(item.library||item.jellyfinId){const raw=await client.getItem(userId,item.jellyfinId||item.id);activeItem=normalize(raw);}
            else if(item.id&&requestReady){const data=await homeflixApi(`requests/details?id=${Number(item.id)}&type=${item.type==='tv'?'tv':'movie'}`,undefined,{client});activeItem=data.item;}
            if(!dialog.open||currentDialog!==dialog)return;body.replaceChildren();
            if(activeItem.poster){const poster=el('img','hf-detail-poster');poster.src=safeImage(activeItem.poster);poster.alt='';body.append(poster);}
            const content=el('div','hf-detail-content');content.append(el('p','hf-eyebrow',activeItem.library?'IN YOUR LIBRARY':activeItem.availability||'DISCOVER'),el('h2','',activeItem.title),el('p','hf-detail-meta',[activeItem.year,activeItem.type==='tv'?'Series':'Movie',...(activeItem.genres||[]).slice(0,4)].filter(Boolean).join(' · ')));
            const actions=el('div','hf-actions');if(activeItem.library||activeItem.jellyfinId)actions.append(button('▶ Watch now',()=>play(activeItem),'hf-button hf-primary'));actions.append(button('＋ My List',()=>toggleList(activeItem)));content.append(actions);
            const summary=el('section','hf-summary');summary.append(el('p','hf-eyebrow','SPOILER-FREE · HOMEFLIX AI'));const languages=el('div','hf-pills');const summaryText=el('p','hf-summary-text','Choose Generate for a spoiler-free summary.');const retry=button('Generate summary',()=>generateSummary());summary.append(languages,summaryText,retry);content.append(summary);
            async function generateSummary(){const selectedLanguage=language;const ticket=++summaryGeneration;retry.disabled=true;const remaining=summaryCooldown-Date.now();if(remaining>0){summaryText.textContent='Waiting briefly before switching language…';clearTimeout(summaryTimer);summaryTimer=setTimeout(generateSummary,remaining+50);return;}
                summaryText.textContent='Writing your spoiler-free summary…';try{const data=await homeflixApi('summary',{...(activeItem.library?{itemId:activeItem.id}:{tmdbId:Number(activeItem.id||activeItem.tmdbId),type:activeItem.type}),language:selectedLanguage},{client});if(ticket!==summaryGeneration||!dialog.open||selectedLanguage!==language)return;summaryText.textContent=data.summary||data.message;summaryCooldown=Date.now()+(data.cooldownSeconds||3)*1000;retry.textContent='Regenerate summary';}
                catch(error){if(ticket!==summaryGeneration||!dialog.open)return;summaryText.textContent=error.message;retry.textContent='Try again';if(error.retryAfter)summaryCooldown=Date.now()+error.retryAfter*1000;}
                finally{if(ticket===summaryGeneration&&dialog.open)retry.disabled=false;}}
            [['english','English'],['tagalog','Tagalog'],['bisaya','Bisaya']].forEach(([value,label])=>{const b=button(label,()=>{language=value;languages.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));generateSummary();},'hf-language');b.setAttribute('aria-pressed',String(language===value));languages.append(b);});
            const synopsis=el('details','hf-synopsis');synopsis.append(el('summary','','Full synopsis'),el('p','',activeItem.overview||'No synopsis is available.'));content.append(synopsis);
            if(activeItem.library){content.append(button('Playback options & full details',()=>{closeDetails();Dashboard.navigate(`details?id=${encodeURIComponent(activeItem.id)}&serverId=${client.serverId()}`);}));
                if(activeItem.raw.Type==='Series'){const seasons=await client.getSeasons(activeItem.id,{UserId:userId});if(!dialog.open)return;const rail=el('div','hf-season-list');seasons.Items.forEach(season=>rail.append(button(season.Name,()=>{closeDetails();Dashboard.navigate(`details?id=${season.Id}&serverId=${client.serverId()}`);})));content.append(el('h3','','Seasons'),rail);}}
            else if(activeItem.canRequest&&requestReady){
                const requestBox=el('div','hf-request-box');requestBox.append(el('h3','','Request this title'));const chosen=[];
                if(activeItem.type==='tv')(activeItem.seasons||[]).forEach(season=>{const label=el('label','hf-season');const input=el('input');input.type='checkbox';input.disabled=!season.selectable;input.value=String(season.number);label.append(input,document.createTextNode(`Season ${season.number}${season.status?' · '+season.status:''}`));requestBox.append(label);chosen.push(input);});
                const notice=el('p','','Nothing is requested until you confirm below.');requestBox.append(notice);const confirm=button('Confirm request',async()=>{const seasons=chosen.filter(x=>x.checked).map(x=>Number(x.value));if(activeItem.type==='tv'&&!seasons.length){notice.textContent='Choose at least one available season.';return;}confirm.disabled=true;try{const data=await homeflixApi('requests/submit',{type:activeItem.type,id:activeItem.id,...(activeItem.type==='tv'?{seasons}:{})},{client});notice.textContent=data.message;confirm.remove();}catch(error){notice.textContent=error.message;confirm.disabled=false;}},'hf-button hf-primary');requestBox.append(confirm);content.append(requestBox);
            }
            body.append(content);
        }catch(error){if(dialog.open){body.replaceChildren(el('h2','',item.title),el('p','',error.message));}}
    }
    async function myList(){heading.textContent='My List';const ticket=generation;const entries=loadList();const items=[];
        const ids=entries.filter(x=>x.library).map(x=>x.id);if(ids.length){const data=await libraryQuery({Ids:ids.join(','),IncludeItemTypes:'Movie,Series,Episode',Limit:200});items.push(...data.Items.map(normalize));}
        if(catalogAllowed&&requestReady){for(const entry of entries.filter(x=>!x.library).slice(0,40)){try{const data=await api(`requests/details?id=${entry.id}&type=${entry.type}`);items.push(data.item);}catch{/* Inaccessible titles stay hidden. */}if(ticket!==generation)return;}}
        if(ticket===generation)grid(items);
    }
    async function navigate(view){clear();currentView=view;search.value='';nav.querySelectorAll('button').forEach(b=>b.setAttribute('aria-current',b.dataset.view===view?'page':'false'));
        try{if(view==='home')await home();else if(view==='movies'||view==='series')await browse(view==='movies'?'Movie':'Series');else if(view==='ai')ai();else if(view==='list')await myList();else await discover(view==='requests'?'mine':'discover');}catch(error){actionError(error);}}
    [['home','Home'],['movies','Movies'],['series','Series'],['discover','Discover'],['ai','HomeFlix AI'],['requests','My Requests'],['list','My List']].forEach(([value,label])=>{const node=button(label,()=>navigate(value),'hf-nav-link');node.dataset.view=value;nav.append(node);});
    root.querySelector('.hf-brand').addEventListener('click',()=>navigate('home'));
    root.querySelector('.hf-search-clear').addEventListener('click',()=>{search.value='';navigate(currentView);});
    async function searchTitles(){if(search.value.trim().length<2)return;const ticket=++generation;requestController?.abort();requestController=new AbortController();hero.hidden=true;controls.replaceChildren();results.replaceChildren();heading.textContent='Search results';message('Searching your library…');
        try{const data=await libraryQuery({SearchTerm:search.value.trim(),Limit:40});if(ticket!==generation)return;grid(data.Items.map(normalize));message('');if(catalogAllowed&&requestReady){results.append(button('Search the request catalog',async()=>{const start=generation;try{const found=await api(`requests/search?q=${encodeURIComponent(search.value.trim())}`);if(start===generation){results.replaceChildren();grid(found.items);}}catch(error){actionError(error);}}));}}catch(error){actionError(error);}}
    search.addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(searchTitles,300);});search.addEventListener('keydown',e=>{if(e.key==='Enter'){clearTimeout(searchTimer);searchTitles();}});
    const tools=root.querySelector('.hf-user-tools');tools.append(button('Refresh',()=>navigate(currentView),'hf-tool'),button('Settings',()=>Dashboard.navigate('mypreferencesdisplay'),'hf-tool'),button('Sign out',async()=>{try{await homeflixApi('requests/logout',{}, {client});}catch{/* Jellyfin sign-out remains available. */}sessionStorage.removeItem('homeflix.requests.error');Dashboard.logout();},'hf-tool'));
    return {
        async onResume(){active=true;client=ServerConnections.currentApiClient();userId=client.getCurrentUserId();document.documentElement.classList.add('homeflix-active');
            requestController=new AbortController();try{const config=await api('config');catalogAllowed=config.catalogAllowed;try{await api('requests/session');requestReady=true;}catch{requestReady=false;}}catch{requestReady=false;}
            if(active)await navigate(currentView);},
        onPause(){active=false;generation++;requestController?.abort();clearTimeout(searchTimer);closeDetails();document.documentElement.classList.remove('homeflix-active');},
        destroy(){this.onPause();root.replaceChildren();}
    };
}
