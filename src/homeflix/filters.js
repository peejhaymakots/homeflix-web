import { node, action, iconAction, field, select } from './ui';

export function libraryFilterFields(filters = {}, studios = [], kind = 'Movie') {
    const options = list => Object.fromEntries((list || []).map(x => typeof x === 'object' ? [x.Id || x.Value,x.Name || x.DisplayName || x.Value] : [x,x]));
    const names = list => (list || []).map(value => typeof value === 'object' ? value.Name || value.Value || value.Id : value);
    const multi = (name,label,items) => ({name,label,kind:'multi',delimiter:',',options:options(items)});
    return [
        {name:'Filters',label:'Watch status',kind:'multi',delimiter:',',options:{IsUnplayed:'Unwatched',IsPlayed:'Watched',IsFavorite:'Favorites',IsResumable:'In progress'}},
        multi('Genres','Genres',names(filters.Genres)),multi('Years','Years',filters.Years),multi('OfficialRatings','Parental ratings',names(filters.OfficialRatings)),multi('StudioIds','Studios',studios),multi('Tags','Tags',names(filters.Tags)),
        multi('AudioLanguages','Audio languages',filters.AudioLanguages),multi('SubtitleLanguages','Subtitle languages',filters.SubtitleLanguages),
        {name:'resolution',label:'Resolution',options:{'':'Any resolution',SD:'SD',HD:'HD','4K':'4K', '3D':'3D'}},
        {name:'VideoTypes',label:'Video type',kind:'multi',delimiter:',',options:{VideoFile:'Video file',Iso:'ISO',Dvd:'DVD',BluRay:'Blu-ray'}},
        {name:'features',label:'Features',kind:'multi',delimiter:',',options:{HasSubtitles:'Subtitles',HasTrailer:'Trailer',HasSpecialFeature:'Special features',HasThemeSong:'Theme song',HasThemeVideo:'Theme video'}},
        ...(kind === 'Movie' ? [] : [{name:'SeriesStatus',label:'Series status',kind:'multi',delimiter:',',options:{Continuing:'Continuing',Ended:'Ended'}},...(kind === 'Episode' ? [{name:'episodeStatus',label:'Episode status',options:{'':'Available episodes',missing:'Missing episodes',unaired:'Unaired episodes',specials:'Specials'}}] : [])])
    ];
}
export function libraryParams(values) {
    const params = Object.fromEntries(Object.entries(values).filter(([key,value]) => !key.startsWith('_') && value !== '' && value !== undefined && !['resolution','features','episodeStatus','page','mode','scroll'].includes(key)));
    if (values.resolution === 'SD') params.IsHD=false;
    if (values.resolution === 'HD') params.IsHD=true;
    if (values.resolution === '4K') params.Is4K=true;
    if (values.resolution === '3D') params.Is3D=true;
    (values.features || '').split(',').filter(Boolean).forEach(name => { params[name]=true; });
    if (values.episodeStatus === 'missing') params.IsMissing=true;
    if (values.episodeStatus === 'unaired') params.IsUnaired=true;
    if (values.episodeStatus === 'specials') params.ParentIndexNumber=0;
    return params;
}
export function filterCount(fields, values) { return fields.filter(field => !field.hidden && values[field.name] && values[field.name] !== field.default && field.name !== 'sortBy').length; }
export function filterChips(fields, values, remove) {
    const chips = node('div','hf-filter-chips');
    fields.filter(f => !f.hidden && values[f.name] && values[f.name] !== f.default && f.name !== 'sortBy').forEach(f => {
        const labels = values._labels?.[f.name] || {}; const list = values[f.name].split(f.delimiter || '\u0000');
        chips.append(action(`${f.label}: ${list.map(value => labels[value] || f.options?.[value] || value).join(', ')} ×`,() => remove(f.name),'hf-chip'));
    }); return chips;
}
export function openFilters({title,fields,values,lookup,onApply}) {
    const previous = document.activeElement; const dialog = node('dialog','hf-filter-dialog');
    const draft = {...values,_labels:{...(values._labels || {})}}; const pending = new Set(); let closed=false;
    const body = node('div','hf-filter-body');
    const error = node('p','hf-inline-status'); error.setAttribute('role','status');
    const close = () => dialog.close();
    dialog.append(node('header','hf-dialog-header',node('h2','',title),iconAction('Close filters',close,'close')),body,error,node('footer','hf-filter-footer',action('Reset',() => { Object.keys(draft).forEach(key => delete draft[key]);draft._labels={}; fields.forEach(f => { if(f.default)draft[f.name]=f.default; }); render(); },'hf-text-button'),action('Apply filters',() => { onApply(draft); close(); },'hf-button hf-primary')));
    dialog.addEventListener('close',() => { closed=true; pending.forEach(c => c.abort());dialog.remove();previous?.focus();document.dispatchEvent(new Event('homeflix:dialog')); });
    dialog.addEventListener('click',event => { if(event.target===dialog)close(); });
    function multiControl(f,options) {
        const group = node('details','hf-multiselect'); const chosen = new Set((draft[f.name] || '').split(f.delimiter || ',').filter(Boolean));
        const summary = node('summary','',chosen.size ? `${chosen.size} selected` : 'Any'); const list = node('div','hf-check-list');
        group.append(summary,list);
        Object.entries(options).forEach(([value,label]) => { const check=node('input');check.type='checkbox';check.value=value;check.checked=chosen.has(value);check.addEventListener('change',() => { if(check.checked)chosen.add(value);else chosen.delete(value);draft[f.name]=[...chosen].join(f.delimiter || ',');draft._labels[f.name]={...draft._labels[f.name],[value]:label};summary.textContent=chosen.size ? `${chosen.size} selected` : 'Any'; });list.append(node('label','hf-check',check,label)); });
        if(!list.childNodes.length)list.append(node('p','hf-muted','No options available.'));return group;
    }
    function lookupControl(f) {
        const wrapper=node('div','hf-lookup');const input=node('input');input.type='search';input.placeholder=`Search ${f.label.toLowerCase()}…`;input.setAttribute('aria-label',f.label);const choices=node('div','hf-lookup-results');const selected=node('div','hf-filter-chips');let timer,controller;
        function selectedChips() { selected.replaceChildren();(draft[f.name] || '').split(f.delimiter || '\u0000').filter(Boolean).forEach(id => selected.append(action(`${draft._labels[f.name]?.[id] || id} ×`,() => { draft[f.name]=(draft[f.name] || '').split(f.delimiter || '\u0000').filter(x => x!==id).join(f.delimiter || '');selectedChips(); },'hf-chip'))); }
        input.addEventListener('input',() => { clearTimeout(timer);controller?.abort();choices.replaceChildren();if(input.value.trim().length<2)return;timer=setTimeout(async() => { controller=new AbortController();pending.add(controller);try{const items=await lookup(f.lookup,input.value,controller.signal,draft);if(closed)return;choices.replaceChildren();items.slice(0,12).forEach(item => choices.append(action(item.label,() => { const ids=new Set((draft[f.name] || '').split(f.delimiter || '\u0000').filter(Boolean));if(!f.delimiter)ids.clear();ids.add(String(item.id));draft[f.name]=[...ids].join(f.delimiter || '');draft._labels[f.name]={...draft._labels[f.name],[item.id]:item.label};input.value='';choices.replaceChildren();selectedChips(); },'hf-lookup-option')));if(!items.length)choices.append(node('p','hf-muted','No matches.'));}catch(e){if(e.name!=='AbortError')error.textContent=e.message;}finally{pending.delete(controller);}},300); });
        selectedChips();wrapper.append(selected,input,choices);return wrapper;
    }
    async function render() {
        body.replaceChildren();error.textContent='';
        for(const f of fields.filter(f => !f.hidden)) {
            let control;
            if(f.kind==='lookup')control=lookupControl(f);
            else if(f.kind==='multi') { control=multiControl(f,f.options || draft._labels[f.name] || {}); }
            else if(f.options || f.lookup)control=select(f.label,Object.entries(f.options || {[draft[f.name] || f.default || '']:draft._labels[f.name]?.[draft[f.name]] || draft[f.name] || f.default || 'Loading…'}),draft[f.name] ?? f.default,value => { draft[f.name]=value;if(f.name==='watchRegion'){delete draft.watchProviders;delete draft._labels.watchProviders;render();} });
            else { control=node('input');control.type=f.kind==='date' ? 'date' : 'number'; if(f.min!==undefined)control.min=String(f.min);if(f.max!==undefined)control.max=String(f.max);if(f.step)control.step=String(f.step);control.value=draft[f.name] || '';control.setAttribute('aria-label',f.label);control.addEventListener('change',() => { draft[f.name]=control.value; }); }
            const wrapper=field(f.label,control);body.append(wrapper);
            if(f.lookup && f.kind!=='lookup') {
                const region=draft.watchRegion || 'PH';const controller=new AbortController();pending.add(controller);
                lookup(f.lookup,'',controller.signal,draft).then(items => { if(closed || f.lookup==='providers' && region !== (draft.watchRegion || 'PH') || !wrapper.isConnected)return;const options=Object.fromEntries(items.map(x=>[x.id,x.label]));const replacement=f.kind==='multi' ? multiControl(f,options) : select(f.label,items.map(x=>[x.id,x.label]),draft[f.name] ?? f.default,value=>{draft[f.name]=value;if(f.name==='watchRegion'){delete draft.watchProviders;delete draft._labels.watchProviders;render();}});control.replaceWith(replacement); }).catch(e=>{if(e.name!=='AbortError')error.textContent=e.message;}).finally(()=>pending.delete(controller));
            }
        }
    }
    document.body.append(dialog);dialog.showModal();document.dispatchEvent(new Event('homeflix:dialog'));render();return dialog;
}
