import { node, action, icon, iconAction } from './ui';
import { mediaGrid } from './cards';

const languages = { english: 'English', tagalog: 'Tagalog', bisaya: 'Bisaya' };
export function mergePicks(items) {
    const kept = [], tmdb = new Map(), jellyfin = new Map();
    for (const item of [...items].sort((a,b) => Number(!!b.library)-Number(!!a.library))) {
        const jf = item.jellyfinId || (item.library ? item.id : '');
        const tm = item.tmdbId || item.raw?.ProviderIds?.Tmdb || (!item.library ? item.id : '');
        const key = tm ? `${item.type}:${tm}` : '';
        if ((jf && jellyfin.has(jf)) || (key && tmdb.has(key))) continue;
        kept.push(item);if(jf)jellyfin.set(jf,item);if(key)tmdb.set(key,item);
    }
    return kept;
}
export function createAI(root,{state,scope='general',catalogAllowed,integration,api,hydrate,details,onLanguage}) {
    let active=true,controller,flight=0,leaveTimer,clock,escapeClosing=false,pointerOpen;
    state.language=languages[state.language]?state.language:'english';
    state.branches ||= { library:{items:[],exclude:[],more:true}, catalog:{items:[],exclude:[],page:1,more:true} };
    const panel=node('section','hf-ai hf-ai-compact');panel.setAttribute('aria-label','HomeFlix AI');panel.dataset.scope=scope;
    const heading=node('h2','hf-ai-title','HomeFlix AI');
    const toggle=action('',()=>{setOpen(pointerOpen===undefined?body.hidden:!pointerOpen);pointerOpen=undefined;},'hf-ai-toggle');toggle.append(icon('sparkle'),heading,icon('chevron'));toggle.setAttribute('aria-expanded','false');toggle.addEventListener('pointerdown',()=>{pointerOpen=!body.hidden;});
    const body=node('div','hf-ai-body');body.id=`hf-ai-body-${scope}`;body.hidden=true;toggle.setAttribute('aria-controls',body.id);
    const close=iconAction('Close HomeFlix AI',()=>setOpen(false,true),'close');
    const input=node('textarea');input.rows=1;input.maxLength=500;input.placeholder='Tell me what you feel like watching…';input.setAttribute('aria-label','What would you like to watch?');input.value=state.prompt || '';
    const submit=action('Find my next watch',()=>run(false),'hf-button hf-primary','arrow');
    const status=node('p','hf-ai-status',state.message || '');status.setAttribute('role','status');
    const picks=node('div','hf-ai-results');const choices=node('div','hf-ai-studio-choices');
    const more=action('More picks',()=>run(true),'hf-text-button','refresh');
    const languageButton=action('',()=>setLanguageOpen(languageMenu.hidden),'hf-button hf-language-button','globe');languageButton.setAttribute('aria-haspopup','menu');languageButton.setAttribute('aria-expanded','false');
    const languageMenu=node('div','hf-ai-language-menu');languageMenu.setAttribute('role','menu');languageMenu.setAttribute('aria-label','Recommendation language');languageMenu.hidden=true;
    for(const [value,label] of Object.entries(languages)){
        const option=action(label,()=>{state.language=value;onLanguage(value);updateLanguage();setLanguageOpen(false);languageButton.focus();},'hf-menu-item');
        option.setAttribute('role','menuitemradio');option.dataset.language=value;languageMenu.append(option);
    }
    const languageControl=node('div','hf-ai-language-control',languageButton,languageMenu);
    function updateLanguage(){languageButton.replaceChildren(icon('globe'),`Language · ${languages[state.language]}`);for(const option of languageMenu.children)option.setAttribute('aria-checked',String(option.dataset.language===state.language));}
    function setLanguageOpen(open){languageMenu.hidden=!open;languageButton.setAttribute('aria-expanded',String(open));if(open)languageMenu.querySelector('[aria-checked=true]')?.focus();}
    updateLanguage();
    const form=node('form','hf-ai-form',node('div','hf-ai-composer',icon('sparkle'),input,submit));form.addEventListener('submit',event=>{event.preventDefault();run(false);});
    const suggestions=node('div','hf-ai-suggestions');for(const text of ['A mystery with clever twists','Something funny tonight','Movies starring Tom Hanks'])suggestions.append(action(text,()=>{input.value=text;state.prompt=text;input.focus();},'hf-prompt-chip'));
    body.append(node('div','hf-ai-toolbar',languageControl,close),form,suggestions,status,choices,picks,more);panel.append(toggle,body);root.append(panel);
    function setOpen(open,restore=false){if(open)updateLanguage();clearTimeout(leaveTimer);body.hidden=!open;toggle.setAttribute('aria-expanded',String(open));panel.classList.toggle('hf-ai-open',open);if(!open){setLanguageOpen(false);if(restore){escapeClosing=true;toggle.focus();queueMicrotask(()=>{escapeClosing=false;});}}}
    const fine=()=>matchMedia('(hover:hover) and (pointer:fine)').matches;
    panel.addEventListener('pointerenter',()=>{if(fine())setOpen(true);});
    panel.addEventListener('pointerleave',()=>{if(fine())leaveTimer=setTimeout(()=>{if(!panel.contains(document.activeElement)&&!input.value.trim()&&!state.busy&&!state.items?.length)setOpen(false);},250);});
    panel.addEventListener('focusin',()=>{if(!escapeClosing)setOpen(true);});
    panel.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(!languageMenu.hidden){setLanguageOpen(false);languageButton.focus();}else setOpen(false,true);}else if(!languageMenu.hidden&&['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();const options=[...languageMenu.children];const index=options.indexOf(document.activeElement);options[event.key==='Home'?0:event.key==='End'?options.length-1:(index+(event.key==='ArrowUp'?-1:1)+options.length)%options.length].focus();}});
    const outside=event=>{if(!languageControl.contains(event.target))setLanguageOpen(false);};document.addEventListener('pointerdown',outside);
    input.addEventListener('input',()=>{state.prompt=input.value;});
    function render(){
        state.items=mergePicks([...state.branches.library.items,...state.branches.catalog.items]);
        const jf=state.items.map(item=>item.jellyfinId || (item.library?item.id:'')).filter(Boolean);
        const tm=state.items.map(item=>{const id=item.tmdbId || item.raw?.ProviderIds?.Tmdb || (!item.library?item.id:'');return id?`${item.type}:${id}`:'';}).filter(Boolean);
        state.branches.library.exclude=[...new Set([...state.branches.library.exclude,...jf])].slice(-100);
        state.branches.catalog.exclude=[...new Set([...state.branches.catalog.exclude,...tm])].slice(-100);
        picks.replaceChildren();if(state.items.length){const grid=mediaGrid(state.items,details);[...grid.children].forEach((card,index)=>{const item=state.items[index];card.querySelector('.hf-availability')?.remove();card.append(node('span','hf-ai-availability',item.library?'Play':['Pending','Processing'].includes(item.availability)?item.availability:item.canRequest?'Request':item.availability || 'Requested'));});picks.append(grid);}
        status.textContent=state.message || '';updateControls();
    }
    function updateControls(){
        if(integration)({catalogAllowed}=integration());
        const now=Date.now();const branches=[state.branches.library,...(catalogAllowed?[state.branches.catalog]:[])];
        const available=branches.some(branch=>!(branch.retryAt>now));submit.disabled=!!state.busy||!available;
        submit.textContent=state.busy?'Finding your picks…':available?'Find my next watch':`Try again in ${Math.max(1,Math.ceil((Math.min(...branches.map(b=>b.retryAt))-now)/1000))}s`;
        more.hidden=!state.items?.length||!branches.some(branch=>branch.more);more.disabled=!!state.busy||!branches.some(branch=>branch.more&&!(branch.retryAt>now));
    }
    clock=setInterval(updateControls,1000);render();
    async function run(append){
        if(integration)({catalogAllowed}=integration());
        const permissionPending=integration&&!integration().ready&&!catalogAllowed;
        const prompt=input.value.trim(),queryLanguage=state.language;if(!prompt){setOpen(true);input.focus();return;}if(state.busy)return;
        controller?.abort();controller=new AbortController();const signal=controller.signal;const ticket=++flight;setOpen(true);state.prompt=input.value;state.busy=true;choices.replaceChildren();
        // Results remain visible until at least one branch succeeds.
        const previous=state.branches;const same=state.query===`${prompt}:${queryLanguage}`;
        const fresh=!append||!same;const branches=fresh?{library:{items:previous.library.items,exclude:[],more:true,retryAt:previous.library.retryAt},catalog:{items:catalogAllowed?previous.catalog.items:[],exclude:[],page:1,more:true,retryAt:previous.catalog.retryAt}}:previous;
        const messages={},warnings=[];let succeeded=false;

        const jobs=[];
        for(const name of ['library','catalog']){
            if(name==='catalog'&&!catalogAllowed&&!permissionPending)continue;
            const branch=branches[name];if(append&&!branch.more)continue;
            if(branch.retryAt>Date.now()){warnings.push(`${name==='library'?'Library AI':'Catalog AI'} is cooling down. Try again shortly.`);continue;}
            jobs.push((async()=>{
                try{
                    const data=await api(name==='library'?'recommend':'requests/ai',{prompt,libraryId:scope,language:name==='library'?queryLanguage:{english:'en',tagalog:'tl',bisaya:'ceb'}[queryLanguage],exclude:branch.exclude,...(name==='library'?{type:'any'}:{page:branch.page,...(branch.studioId?{studioId:branch.studioId}:{})})},signal);
                    if(!active||ticket!==flight)return;
                    let items=await hydrate(data.items || [],name==='library');
                    if(name==='catalog'){
                        const playable=items.filter(item=>item.jellyfinId);
                        const native=await hydrate(playable.map(item=>({id:item.jellyfinId})),true);
                        const byId=new Map(native.map(item=>[item.id,item]));
                        items=items.flatMap(item=>item.jellyfinId?(byId.has(item.jellyfinId)?[byId.get(item.jellyfinId)]:[]):item.availability==='Unavailable to this profile'||/^(?:Available|Partially available)$/i.test(item.availability || '')?[]:[item]);
                    }
                    if(!active||ticket!==flight)return;
                    branch.items=append?mergePicks([...branch.items,...items]):items;
                    branch.exclude=[...new Set([...branch.exclude,...(data.items || []).map(item=>name==='library'?item.id:`${item.type}:${item.id}`)])].slice(-100);
                    branch.more=name==='library'?items.length>0:!!data.nextPage;branch.page=data.nextPage || branch.page;branch.retryAt=0;
                    messages[name]=data.message || '';succeeded=true;state.branches=branches;state.query=`${prompt}:${queryLanguage}`;state.message=[messages.library || messages.catalog,...warnings].filter(Boolean).join(' ');render();
                    (data.studios || []).forEach(studio=>choices.append(action(studio.name,()=>{branch.studioId=studio.id;branch.more=true;run(true);},'hf-chip')));
                }catch(error){if(error.name==='AbortError'||!active||ticket!==flight)return;
                    if(error.retryAfter){branch.retryAt=Date.now()+error.retryAfter*1000;previous[name].retryAt=branch.retryAt;}
                    warnings.push(`${name==='library'?'Library AI':'Requests'}: ${error.message}`);
                }
            })());
        }
        updateControls();await Promise.allSettled(jobs);if(!active||ticket!==flight)return;
        state.busy=false;state.message=[messages.library || messages.catalog,...warnings].filter(Boolean).join(' ') || (succeeded?'No matching titles found.':'Please try again shortly.');render();
    }
    return ()=>{active=false;flight++;controller?.abort();state.busy=false;clearTimeout(leaveTimer);clearInterval(clock);document.removeEventListener('pointerdown',outside);panel.remove();};
}
