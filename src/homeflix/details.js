import { node, action, iconAction, icon, field, select, safeImage, external } from './ui';
import { peopleCards, createPersonDetails } from './people';

export function createDetails({client,userId,api,normalize,play,isSaved,toggleList,getLanguage,setLanguage,getPersonTitles,getEntityTitles}) {
    let cooldown=0;const cache=new Map();const dialogs=new Map();
    const close=()=>{[...dialogs.entries()].reverse().forEach(([dialog,person])=>{person.close();dialog.close();});};
    async function show(item,{nested=false}={}) {
        if(!nested)close();const previous=document.activeElement;const controller=new AbortController();
        const dialog=node('dialog','hf-dialog');
        const people=createPersonDetails({client,userId,getPersonTitles,getEntityTitles,showMedia:media=>show(media,{nested:true})});dialogs.set(dialog,people);
        const dismiss=()=>{people.close();dialog.close();};
        const body=node('div','hf-detail-body',node('div','hf-detail-loading','Loading details…'));dialog.append(iconAction('Close details',dismiss,'close','hf-close'),body);
        dialog.addEventListener('click',event=>{if(event.target===dialog)dismiss();});
        let timer,summaryVersion=0,summaryBusy=false,pendingLanguage,playingItem,versionSelect,audioSelect,subtitleSelect,episodeVersion=0;
        const alive=()=>dialogs.has(dialog) && dialog.open && !controller.signal.aborted;
        dialog.addEventListener('close',()=>{people.close();controller.abort();clearTimeout(timer);summaryVersion++;episodeVersion++;dialogs.delete(dialog);dialog.remove();if(previous?.isConnected)previous.focus({preventScroll:true});document.dispatchEvent(new Event('homeflix:dialog'));});
        document.body.append(dialog);dialog.showModal();document.dispatchEvent(new Event('homeflix:dialog'));
        try {
            let active=item;
            if(item.library || item.jellyfinId){const raw=await client.getItem(userId,item.jellyfinId || item.id);active=normalize(raw);}else{const data=await api(`details?tmdbId=${Number(item.id || item.tmdbId)}&type=${item.type==='tv'?'tv':'movie'}`,undefined,controller.signal);active={...item,...data.item};}
            if(!alive())return;body.replaceChildren();dialog.setAttribute('aria-label',`Details for ${active.title}`);
            const visual=node('div','hf-detail-visual');const poster=safeImage(active.poster);if(poster){const img=node('img','hf-detail-poster');img.src=poster;img.alt=`${active.title} poster`;visual.append(img);}body.append(visual);
            const content=node('div','hf-detail-content');body.append(content);
            const header=node('div','hf-detail-heading',node('p','hf-eyebrow',active.library?'YOUR LIBRARY':active.availability || 'DISCOVER'),node('h2','',active.title));
            const facts=node('div','hf-detail-facts');const genres=node('div','hf-detail-genres');const tagline=node('p','hf-detail-tagline');const origin=node('p','hf-detail-origin');const credits=node('div','hf-detail-credits');const castAndCrew=node('div','hf-people-container');const studios=node('section','hf-studio-section');const links=node('div','hf-detail-links');
            const actions=node('div','hf-detail-actions');const saved=action(isSaved(active)?'Saved to My List':'Add to My List',()=>{toggleList(active);saved.replaceChildren(isSaved(active)?'Saved to My List':'Add to My List');saved.setAttribute('aria-pressed',String(isSaved(active)));},'hf-button','bookmark');saved.setAttribute('aria-pressed',String(isSaved(active)));
            const playNow=action('Play',()=>start(false),'hf-button hf-primary','play');const restart=action('Start over',()=>start(true),'hf-button hf-secondary');
            if(active.library){actions.append(playNow,restart);playingItem=active;}actions.append(saved);
            content.append(header,facts,genres,tagline,origin,actions,links);
            const options=node('section','hf-playback-options');const episodeContainer=node('section','hf-episode-section');
            const summary=node('section','hf-summary');const languages=node('div','hf-language-tabs');const summaryText=node('p','hf-summary-text','Preparing your spoiler-free summary…');const retry=action('Retry summary',()=>queueSummary(getLanguage()),'hf-text-button','refresh');retry.hidden=true;
            summary.append(node('div','hf-summary-heading',node('h3','', 'HomeFlix AI summary'),node('span','hf-summary-label','SPOILER-FREE')),languages,summaryText,retry);
            const synopsis=node('details','hf-synopsis',node('summary','',node('span','','Full synopsis'),node('span','hf-muted','May contain spoilers')),node('p','',active.overview || 'No synopsis is available.'));
            content.append(summary,synopsis,credits,castAndCrew,studios);
            if(active.library){origin.after(options);content.append(episodeContainer);}else if(active.canRequest)renderRequest();
            function metadata(media) {
                facts.replaceChildren();[media.year,media.tmdbRating?`TMDB ${media.tmdbRating}`:media.rating?`★ ${Number(media.rating).toFixed(1)} / 10`:'',media.runtime || (media.raw?.RunTimeTicks?`${Math.round(media.raw.RunTimeTicks/600000000)} min`:''),media.certification || media.raw?.OfficialRating,media.releaseDate?`Released ${new Date(media.releaseDate).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'})}`:'',media.statusText || media.status || media.raw?.Status].filter(Boolean).forEach(text=>facts.append(node('span','',text)));
                genres.replaceChildren(...(media.genres || []).map(genre=>node('span','',genre)));tagline.textContent=media.tagline || media.raw?.Taglines?.[0] || '';origin.textContent=media.origin || (media.raw?.ProductionLocations || []).join(', ');credits.replaceChildren();
                const nativePeople=media.raw?.People || active.raw?.People || [];
                const source={...(active.library?{itemId:active.id}:{}),sourceTmdbId:Number(media.tmdbId || active.raw?.ProviderIds?.Tmdb || (!active.library?active.id:0)),sourceType:active.type};
                const catalogPeople=(media.people || []).map(person=>({...person,Name:person.name,Type:person.type,Role:person.role}));
                const entries=nativePeople.length?nativePeople:catalogPeople;
                if(!castAndCrew.firstElementChild && entries.length){const cards=peopleCards({people:entries,client,open:getEntityTitles || getPersonTitles?person=>people.show({...person,kind:'person',...source}):undefined});if(cards)castAndCrew.append(cards);}
                // Name-only enrichment remains readable without inventing identity links.
                if(!entries.length){const cast=Array.isArray(media.cast)?media.cast.join(', '):media.cast;if(media.director || media.creator)credits.append(node('p','',node('strong','',media.creator?'Creator: ':'Director: '),media.creator || media.director));if(cast)credits.append(node('p','',node('strong','','Cast: '),cast));}
                const nativeStudios=media.raw?.Studios || active.raw?.Studios || [];
                const studioEntries=nativeStudios.length?nativeStudios:(media.studios || []).map(studio=>({...studio,Name:studio.name}));
                if(!studios.childElementCount && studioEntries.length){const choices=node('div','hf-studio-links');const seen=new Set();studioEntries.forEach(studio=>{const key=studio.Id?`jf:${studio.Id}`:studio.tmdbId?`tmdb:${studio.tmdbId}`:'';if(key&&seen.has(key))return;if(key)seen.add(key);choices.append(key&&getEntityTitles?action(studio.Name,()=>people.show({...studio,kind:'studio',...source}),'hf-studio-link'):node('span','hf-studio-name',studio.Name));});studios.append(node('h3','','Studios'),choices);}
                studios.hidden=!studios.childElementCount;
                credits.hidden=!credits.childElementCount;
                links.replaceChildren();if(media.trailerUrl)links.append(external('Trailer',media.trailerUrl));else if(media.raw?.RemoteTrailers?.length){const trailer=media.raw.RemoteTrailers.find(x=>x.Url);const link=external('Trailer',trailer?.Url);if(link)links.append(link);}if(media.imdbUrl)links.append(external('IMDb reviews',media.imdbUrl));if(media.tmdbUrl)links.append(external('TMDB reviews',media.tmdbUrl));
                const backdrop=safeImage(media.backdrop);if(backdrop)visual.style.backgroundImage=`url("${backdrop}")`;
            }
            function updatePlay() {
                const raw=playingItem?.raw;const resumable=(raw?.UserData?.PlaybackPositionTicks || 0)>0;playNow.replaceChildren(icon('play'),resumable?'Resume':raw?.Type==='Episode'?'Play episode':'Play');restart.hidden=!resumable;playNow.disabled=!raw || raw.Type==='Series';
            }
            function sourceTracks() {
                const source=(playingItem?.raw?.MediaSources || []).find(x=>x.Id===versionSelect.value);const streams=source?.MediaStreams || [];
                const audio=streams.filter(x=>x.Type==='Audio');const subs=streams.filter(x=>x.Type==='Subtitle');
                const optionsFor=values=>values.map(track=>[String(track.Index),track.DisplayTitle || [track.Language,track.Codec,track.Title].filter(Boolean).join(' · ') || `Track ${track.Index}`]);
                const audioDefault=source?.DefaultAudioStreamIndex ?? audio.find(x=>x.IsDefault)?.Index ?? audio[0]?.Index;
                const subDefault=source?.DefaultSubtitleStreamIndex ?? -1;
                const newAudio=select('Audio track',optionsFor(audio),audioDefault==null?'':String(audioDefault));newAudio.disabled=!audio.length;const newSubtitle=select('Subtitle track',[['-1','Off'],...optionsFor(subs)],String(subDefault));
                audioSelect.replaceWith(newAudio);subtitleSelect.replaceWith(newSubtitle);audioSelect=newAudio;subtitleSelect=newSubtitle;
            }
            function renderPlayback() {
                options.replaceChildren();updatePlay();const raw=playingItem?.raw;if(!raw || raw.Type==='Series')return;
                const sources=raw.MediaSources || [];
                options.append(node('h3','','Playback options'));if(raw.Type==='Episode')options.append(node('p','hf-muted',`${raw.SeriesName || ''} · S${raw.ParentIndexNumber || 0} E${raw.IndexNumber || 0} · ${raw.Name}`));
                versionSelect=select('Version',sources.map(source=>[source.Id,source.Name || [source.Container,(source.MediaStreams || []).find(x=>x.Type==='Video')?.DisplayTitle].filter(Boolean).join(' · ') || 'Default version']),sources[0]?.Id,sourceTracks);versionSelect.disabled=sources.length<2;
                audioSelect=select('Audio track',[]);subtitleSelect=select('Subtitle track',[['-1','Off']]);options.append(node('div','hf-playback-fields',field('Version',versionSelect),field('Audio',audioSelect),field('Subtitles',subtitleSelect)));sourceTracks();
            }
            function start(fromBeginning) { if(!playingItem?.raw || playingItem.raw.Type==='Series')return;const chosen={mediaSourceId:versionSelect?.value || undefined,audioStreamIndex:audioSelect?.value!==''?Number(audioSelect?.value):undefined,subtitleStreamIndex:subtitleSelect?.value!==undefined?Number(subtitleSelect.value):undefined,startPositionTicks:fromBeginning?0:playingItem.raw.UserData?.PlaybackPositionTicks || 0};close();play(playingItem,chosen); }
            function queueSummary(language) { pendingLanguage=language;summaryVersion++;retry.hidden=true;languages.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.language===language)));if(!summaryBusy)loadSummary(); }
            async function loadSummary() {
                clearTimeout(timer);const language=pendingLanguage;pendingLanguage=undefined;const version=summaryVersion;const cacheKey=`${active.library?'jf':active.type}:${active.id}:${language}`;
                if(cache.has(cacheKey)){summaryText.textContent=cache.get(cacheKey);return;}
                const remaining=cooldown-Date.now();if(remaining>0){pendingLanguage=language;summaryText.textContent='Your selected language is loading…';timer=setTimeout(loadSummary,remaining+50);return;}
                summaryBusy=true;summaryText.textContent='Writing your spoiler-free summary…';
                try {const data=await api('summary',{...(active.library?{itemId:active.id}:{tmdbId:Number(active.id || active.tmdbId),type:active.type}),language},controller.signal);cooldown=Date.now()+(data.cooldownSeconds || 3)*1000;if(data.summary)cache.set(cacheKey,data.summary);if(alive()&&version===summaryVersion)summaryText.textContent=data.summary || data.message || 'No summary is available.';}
                catch(error){if(alive()&&version===summaryVersion&&error.name!=='AbortError'){summaryText.textContent=error.message;retry.hidden=error.status===422;if(error.retryAfter)cooldown=Date.now()+error.retryAfter*1000;}}
                finally {summaryBusy=false;if(alive()&&pendingLanguage)loadSummary();}
            }
            [['english','English'],['tagalog','Tagalog'],['bisaya','Bisaya']].forEach(([language,label])=>{const button=action(label,()=>{setLanguage(language);queueSummary(language);},'hf-language');button.dataset.language=language;languages.append(button);});
            function renderRequest() {
                const box=node('section','hf-request-box',node('h3','','Request this title'));const chosen=[];
                if(active.type==='tv')(active.seasons || []).forEach(season=>{const check=node('input');check.type='checkbox';check.value=String(season.number);check.disabled=!season.selectable;chosen.push(check);box.append(node('label','hf-check',check,`Season ${season.number}${season.status?' · '+season.status:''}`));});
                const notice=node('p','hf-muted','Choose your request and confirm below.');const confirm=action('Confirm request',async()=>{const seasons=chosen.filter(x=>x.checked).map(x=>Number(x.value));if(active.type==='tv'&&!seasons.length){notice.textContent='Choose at least one available season.';return;}confirm.disabled=true;try{const result=await api('requests/submit',{id:Number(active.id),type:active.type,...(active.type==='tv'?{seasons}:{})},controller.signal);if(alive()){notice.textContent=result.message;confirm.remove();}}catch(error){if(alive()&&error.name!=='AbortError'){notice.textContent=error.message;confirm.disabled=false;}}},'hf-button hf-primary');box.append(notice,confirm);content.append(box);
            }
            async function seriesEpisodes() {
                episodeContainer.append(node('h3','','Seasons & episodes'),node('p','hf-muted','Loading episodes…'));
                const [seasons,next] = await Promise.allSettled([client.getSeasons(active.id,{UserId:userId}),client.ajax({type:'GET',url:client.getUrl('Shows/NextUp',{UserId:userId,SeriesId:active.id,Limit:1,Fields:'Overview,MediaSources,ProviderIds'}),dataType:'json'})]);if(!alive())return;
                const seasonItems=seasons.status==='fulfilled'?seasons.value.Items || []:[];const nextItem=next.status==='fulfilled'?next.value.Items?.[0]:null;
                episodeContainer.replaceChildren(node('h3','','Seasons & episodes'));if(!seasonItems.length){episodeContainer.append(node('p','hf-muted','No accessible episodes are available.'));return;}
                const season=select('Season',seasonItems.map(x=>[x.Id,x.Name]),seasonItems.find(x=>x.Id===nextItem?.ParentId)?.Id || seasonItems[0].Id,loadEpisodes);const episodeList=node('div','hf-episodes');episodeContainer.append(field('Season',season),episodeList);
                async function choose(raw) { const version=++episodeVersion;playNow.disabled=true;const full=await client.getItem(userId,raw.Id);if(!alive()||version!==episodeVersion)return;playingItem=normalize(full);renderPlayback();episodeList.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.id===raw.Id))); }
                async function loadEpisodes() { const version=++episodeVersion;episodeList.replaceChildren(node('p','hf-muted','Loading episodes…'));try{const data=await client.getEpisodes(active.id,{UserId:userId,SeasonId:season.value,Fields:'Overview,MediaSources,ProviderIds',EnableUserData:true});if(!alive()||version!==episodeVersion)return;episodeList.replaceChildren();(data.Items || []).forEach(raw=>{const button=action('',()=>choose(raw).catch(error=>{if(alive())episodeList.append(node('p','hf-inline-status',error.message));}),'hf-episode');button.dataset.id=raw.Id;const item=normalize(raw);const image=safeImage(item.backdrop || item.poster);if(image){const img=node('img');img.src=image;img.alt='';img.loading='lazy';button.append(img);}button.append(node('div','',node('strong','',`${raw.IndexNumber || 0}. ${raw.Name}`),node('p','',[raw.RunTimeTicks?`${Math.round(raw.RunTimeTicks/600000000)} min`:'',raw.UserData?.Played?'Watched':raw.UserData?.PlaybackPositionTicks?'In progress':''].filter(Boolean).join(' · ')),node('p','hf-episode-overview',raw.Overview || '')));episodeList.append(button);});const target=(data.Items || []).find(x=>x.Id===nextItem?.Id) || (data.Items || []).find(x=>!x.UserData?.Played) || data.Items?.[0];if(target)await choose(target);}catch(error){if(alive())episodeList.replaceChildren(node('p','hf-inline-status',error.message));} }
                await loadEpisodes();
            }
            metadata(active);renderPlayback();queueSummary(getLanguage());
            if(active.raw?.Type==='Series')seriesEpisodes().catch(error=>{if(alive())episodeContainer.append(node('p','hf-inline-status',error.message));});
            if(active.library)api(`details?itemId=${encodeURIComponent(active.id)}`,undefined,controller.signal).then(data=>{if(alive())metadata({...active,...data.item});}).catch(()=>{/* Native metadata and playback remain available. */});
        } catch(error) {if(alive()&&error.name!=='AbortError')body.replaceChildren(node('div','hf-empty',node('h2','',item.title),node('p','',error.message),action('Close',dismiss)));}
    }
    return {show,close,destroy:()=>{close();cache.clear();}};
}
