import { node, action, select, icon } from './ui';
import { mediaGrid } from './cards';

export function createAI(root,{state,libraries,scope='general',catalogAllowed,requestReady,api,hydrate,details,onLanguage,onScope}) {
    let active=true,controller,timer;const panel=node('section','hf-ai');panel.setAttribute('aria-label','HomeFlix AI');
    const input=node('textarea');input.rows=1;input.maxLength=500;input.placeholder='Tell me what you feel like watching…';input.setAttribute('aria-label','What would you like to watch?');input.value=state.prompt || '';
    const source=select('Recommendation source',[['library','Your library'],...(catalogAllowed?[['catalog','Discover & request']]:[])],state.source || 'library');
    const language=select('Recommendation language',[['english','English'],['tagalog','Tagalog'],['bisaya','Bisaya']],state.language || 'english');
    const scopeSelect=select('Library scope',[['general','All general libraries'],...libraries.map(x=>[x.id,x.name])],scope==='general' ? state.scope || 'general' : scope);
    if(scope!=='general')scopeSelect.disabled=true;
    const type=select('Recommendation media type',[['movie','Movies'],['tv','Series']],state.type || (libraries.find(x=>x.id===scope)?.kind==='Series'?'tv':'movie'));
    function updateType(){const view=libraries.find(x=>x.id===scopeSelect.value);type.disabled=!!view;if(view)type.value=view.kind==='Series'?'tv':'movie';type.hidden=source.value==='catalog';}
    updateType();
    const submit=action('Find my next watch',() => run(false),'hf-button hf-primary','arrow');const status=node('p','hf-ai-status',state.message || '');status.setAttribute('role','status');const picks=node('div','hf-ai-results');const choices=node('div','hf-ai-studio-choices');const more=action('More picks',()=>run(true),'hf-text-button','refresh');more.hidden=!(state.items || []).length;
    const form=node('form','hf-ai-form',node('div','hf-ai-composer',icon('sparkle'),input,submit));form.addEventListener('submit',event=>{event.preventDefault();run(false);});
    const suggestions=node('div','hf-ai-suggestions');['A mystery with clever twists','Something funny tonight','Movies starring Tom Hanks'].forEach(text=>suggestions.append(action(text,()=>{input.value=text;state.prompt=text;input.focus();},'hf-prompt-chip')));
    const options=node('div','hf-ai-options',source,scopeSelect,type,language);
    panel.append(node('div','hf-ai-heading',node('h2','',icon('sparkle'),'HomeFlix AI'),node('span','hf-ai-caption','A good story starts with your mood.')),form,options,suggestions,status,choices,picks,more);root.append(panel);
    if(state.items?.length)picks.append(mediaGrid(state.items,details));
    input.addEventListener('input',()=>{state.prompt=input.value;});
    const change=()=>{state.source=source.value;state.scope=scopeSelect.value;state.type=type.value;state.language=language.value;state.exclude=[];state.page=1;state.studioId=undefined;};
    source.addEventListener('change',()=>{updateType();change();});type.addEventListener('change',change);scopeSelect.addEventListener('change',()=>{updateType();change();onScope?.(scopeSelect.value);});language.addEventListener('change',()=>{change();onLanguage(language.value);});
    function cooldown(seconds) { clearInterval(timer);submit.disabled=true;let left=Math.max(1,seconds);submit.textContent=`Try again in ${left}s`;timer=setInterval(()=>{left--;if(left<=0){clearInterval(timer);timer=null;if(active){submit.disabled=false;submit.textContent='Find my next watch';}}else submit.textContent=`Try again in ${left}s`;},1000); }
    async function run(append) {
        if(!input.value.trim()){input.focus();return;}
        if(source.value==='catalog'&&!requestReady){status.textContent='Connect Requests from Discover to search the catalog. Your library is ready to use.';return;}
        controller?.abort();controller=new AbortController();changeIfNew(append);state.busy=true;submit.disabled=true;more.disabled=true;submit.textContent='Finding your picks…';status.textContent='';choices.replaceChildren();
        const previousPage=state.page;
        try {
            const payload={prompt:input.value.trim(),libraryId:scopeSelect.value,...(source.value==='catalog'?{language:{english:'en',tagalog:'tl',bisaya:'ceb'}[language.value],page:state.page || 1,exclude:state.exclude || [],...(state.studioId?{studioId:state.studioId}:{})}:{type:type.value,language:language.value,exclude:state.exclude || []})};
            const data=await api(source.value==='catalog'?'requests/ai':'recommend',payload,controller.signal);if(!active)return;
            const items=await hydrate(data.items || [],source.value==='library');if(!active)return;
            state.items=append?[...(state.items || []),...items]:items;state.message=data.message || '';state.page=data.nextPage || (state.page || 1)+1;
            state.exclude=[...new Set([...(state.exclude || []),...items.map(x=>source.value==='catalog'?`${x.type}:${x.id}`:x.id)])].slice(-100);
            status.textContent=state.message;picks.replaceChildren(mediaGrid(state.items,details));more.hidden=!items.length || source.value==='catalog'&&!data.nextPage;
            (data.studios || []).forEach(studio=>choices.append(action(`${studio.name}${studio.country?' · '+studio.country:''}`,()=>{state.studioId=studio.id;run(true);},'hf-chip')));
        } catch(error){if(error.name!=='AbortError'&&active){status.textContent=error.message;state.page=previousPage;if(error.retryAfter)cooldown(error.retryAfter);}}
        finally {state.busy=false;if(active){if(!timer){submit.disabled=false;submit.textContent='Find my next watch';}more.disabled=false;}}
    }
    function changeIfNew(append){state.prompt=input.value;state.source=source.value;state.scope=scopeSelect.value;state.type=type.value;state.language=language.value;if(!append){state.exclude=[];state.page=1;state.studioId=undefined;}}
    return ()=>{active=false;controller?.abort();clearInterval(timer);panel.remove();};
}
