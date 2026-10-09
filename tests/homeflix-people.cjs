const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.HOMEFLIX_PLAYWRIGHT_MODULE || 'playwright');
const source = path.resolve(__dirname, '../src/homeflix');
const fixture = `
import {createDetails} from '/details.js';
const people = [
 {Id:'person-one',Name:'Actor One',Type:'Actor',Role:'The lead',PrimaryImageTag:'portrait'},
 {Id:'person-one',Name:'Actor One',Type:'Director',Role:'Director',PrimaryImageTag:'portrait'},
 {Id:'person-two',Name:'Actor Two',Type:'GuestStar',Role:'A friend'},
 {Name:'No record',Type:'Writer'}
];
const raw = id => ({Id:id,Name:id==='original'?'Original Movie':id==='second'?'Second Movie':'Third Movie',Type:'Movie',ProviderIds:{Tmdb:id==='second'?'42':'43'},Overview:'A synopsis.',People:people,Studios:[{Id:'studio-one',Name:'Studio One'}],ProductionLocations:['Philippines'],UserData:{},MediaSources:[{Id:'one',Name:'Original',MediaStreams:[]},{Id:'two',Name:'Extended',MediaStreams:[]}]});
const normalize = item => ({id:item.Id,jellyfinId:item.Id,title:item.Name,library:true,type:'movie',raw:item});
const client = {getImageUrl:(id)=>'/portrait.svg',getItem:async(user,id)=>{if(id.startsWith('person')){if(window.bioFailure)throw Error('Metadata unavailable');return {Id:id,Name:'Actor One',Overview:'A biography of the person.',ImageTags:{Primary:'portrait'}};}return raw(id);}};
window.calls=[];window.bioFailure=false;window.titleFailure=false;window.catalogFailure=false;window.partial=true;window.catalogDelay=true;window.delay=false;window.plays=[];window.release=[];
const catalog=[{id:42,type:'movie',title:'Duplicate movie',availability:'Not requested',canRequest:true},{id:42,type:'tv',title:'Same ID Series',availability:'Processing',canRequest:true},{id:99,type:'movie',title:'Request Movie',availability:'Not requested',canRequest:true},{id:100,type:'movie',title:'Retryable Unavailable',availability:'Unavailable',canRequest:true}];
window.details = createDetails({client,userId:'member',normalize,api:async(route,body)=>route==='summary'?{summary:'A spoiler-free summary.',cooldownSeconds:.001}:{item:{title:'Catalog title',id:200,type:'movie',people:[{tmdbId:500,name:'Catalog Person',type:'Director',role:'Director'}],studios:[{tmdbId:600,name:'Catalog Studio'}]}},play:(item,options)=>window.plays.push({item:item.id,options}),isSaved:()=>false,toggleList:()=>{},getLanguage:()=> 'english',setLanguage:()=>{},getEntityTitles:async(entity,{source,signal,page})=>{window.calls.push({id:entity.Id,tmdbId:entity.tmdbId,kind:entity.kind,source,page});if(window.delay)await new Promise(resolve=>window.release.push(resolve));if(source==='library'){if(window.titleFailure)throw Error('Titles could not load');return {items:entity.Id?(page===0?['second']:['second','third']).map(id=>normalize(raw(id))):[],nextPage:entity.Id&&page===0?1:null};}if(window.catalogDelay)await new Promise(resolve=>window.catalogRelease=resolve);if(window.catalogFailure)throw Error('Requests is unavailable');return page===1?{items:catalog,nextPage:2}:page===2?{items:[{id:101,type:'movie',title:'Partial page movie',availability:window.partial?'Pending':'Processing',canRequest:false},...(!window.partial?[{id:102,type:'movie',title:'Recovered title',availability:'Not requested',canRequest:true}]:[])],partial:window.partial,notice:window.partial?'Retry this page to check missing titles.':'',nextPage:3}:{items:[{id:103,type:'movie',title:'Last page movie',availability:'Not requested',canRequest:true}],nextPage:null};}});
document.querySelector('#open').onclick=()=>window.details.show(normalize(raw('original')));
window.openCatalog=()=>window.details.show({id:200,type:'movie',title:'Catalog title'});
window.ready=true;
`;
let browser;
(async () => {
    const server = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://localhost');
        if (url.pathname === '/') {
            res.setHeader('Content-Type', 'text/html');
            res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/homeflix.scss"><link rel="stylesheet" href="/presentation.scss"><link rel="stylesheet" href="/details-theme.scss"><link rel="stylesheet" href="/people.scss"><style>body{margin:0}</style><button id="open">Open movie</button><script type="module" src="/fixture.js"></script>`);
        } else if (url.pathname === '/fixture.js') {
            res.setHeader('Content-Type', 'text/javascript'); res.end(fixture);
        } else if (url.pathname === '/portrait.svg') {
            res.setHeader('Content-Type', 'image/svg+xml'); res.end('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"><rect width="200" height="300" fill="#344857"/><circle cx="100" cy="100" r="50" fill="#8de4ce"/></svg>');
        } else {
            const target = path.join(source, url.pathname.slice(1));
            const file = fs.existsSync(target) ? target : target + '.js';
            if (!file.startsWith(source) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
            res.setHeader('Content-Type', file.endsWith('.scss') ? 'text/css' : 'text/javascript'); res.end(fs.readFileSync(file));
        }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
        browser = await chromium.launch({ channel: 'msedge', headless: true });
        const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
        const errors = []; page.on('pageerror', error => errors.push(error.message));
        await page.goto(`http://127.0.0.1:${server.address().port}`);
        await page.waitForFunction(() => window.ready);
        await page.getByRole('button', { name: 'Open movie' }).click();
        const original = page.locator('.hf-dialog:not(.hf-person-dialog)').first();
        await original.getByRole('combobox', { name: 'Version', exact: true }).selectOption('two');
        assert.equal(await original.locator('.hf-person-card').count(), 3);
        assert.equal(await original.getByRole('button', { name: 'View Actor One', exact: true }).count(), 1);
        assert.equal(await original.locator('.hf-person-card').first().locator('.hf-person-role').textContent(), 'as The lead · Director');
        await original.getByRole('button', { name: 'View Actor One', exact: true }).click();
        const person = page.locator('.hf-person-dialog');
        await person.getByRole('button', { name: 'Details for Second Movie', exact: true }).waitFor();
        assert.equal(await person.locator('.hf-person-biography').textContent(), 'A biography of the person.');
        assert.equal(await person.locator('.hf-card').count(), 1, 'Library is usable while catalog waits');
        await page.evaluate(() => { window.catalogDelay = false; window.catalogRelease(); });
        await person.getByRole('button', { name: 'Details for Request Movie', exact: true }).waitFor();
        assert.equal(await person.locator('.hf-card').count(), 4, 'Movie+TV same numeric ID remain distinct; playable duplicate wins');
        assert.deepEqual(await person.locator('.hf-entity-availability').allTextContents(), ['Play', 'Processing', 'Request', 'Request']);
        await person.getByRole('button', { name: 'More library titles', exact: true }).click();
        await person.getByRole('button', { name: 'Details for Third Movie', exact: true }).waitFor();
        assert.equal(await person.locator('.hf-card').count(), 5);
        await person.getByRole('button', { name: 'More request titles', exact: true }).click();
        await person.getByRole('button', { name: 'Retry request titles', exact: true }).waitFor();
        await person.getByRole('button', { name: 'More request titles', exact: true }).click();
        await person.getByRole('button', { name: 'Details for Last page movie', exact: true }).waitFor();
        await page.evaluate(() => { window.partial = false; });
        await person.getByRole('button', { name: 'Retry request titles', exact: true }).click();
        await person.getByRole('button', { name: 'Details for Recovered title', exact: true }).waitFor();
        assert.equal(await person.getByRole('button', { name: 'More request titles', exact: true }).isVisible(), false, 'Retry older page does not rewind completed pagination');
        assert.equal(await person.locator('.hf-card').filter({has:page.getByRole('button',{name:'Details for Partial page movie',exact:true})}).locator('.hf-entity-availability').textContent(), 'Processing', 'Retry refreshes existing request status');
        assert.equal(await person.locator('.hf-card').count(), 8);
        await person.getByRole('button', { name: 'Details for Second Movie', exact: true }).click();
        await page.locator('.hf-dialog:not(.hf-person-dialog)').last().getByRole('heading', { name: 'Second Movie', exact: true }).waitFor();
        assert.equal(await page.locator('dialog[open]').count(), 3);
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => document.querySelectorAll('dialog[open]').length === 2);
        assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Details for Second Movie');
        await page.keyboard.press('Escape');
        await person.waitFor({ state: 'detached' });
        assert.equal(await original.getByRole('combobox', { name: 'Version', exact: true }).inputValue(), 'two');
        assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'View Actor One');
        await page.evaluate(() => { window.bioFailure = true; window.titleFailure = true; });
        await original.getByRole('button', { name: 'View Actor Two', exact: true }).click();
        await person.getByRole('button', { name: 'Retry library titles', exact: true }).waitFor();
        await person.getByRole('button', { name: 'Details for Request Movie', exact: true }).waitFor();
        assert.equal(await person.locator('.hf-person-biography').textContent(), 'No biography is available.');
        await page.evaluate(() => { window.titleFailure = false; });
        await person.getByRole('button', { name: 'Retry library titles', exact: true }).click();
        await person.getByRole('button', { name: 'Details for Second Movie', exact: true }).waitFor();
        const widths = [1440, 1024, 768, 393, 320];
        for (const width of widths) {
            await page.setViewportSize({ width, height: 900 });
            assert.equal(await person.evaluate(dialog => dialog.scrollWidth > dialog.clientWidth), false, `Person overflow at ${width}`);
            assert.equal(await person.evaluate(dialog => { const rect = dialog.getBoundingClientRect(); return rect.left < -1 || rect.right > innerWidth + 1; }), false, `Person extends beyond viewport at ${width}`);
        }
        await page.keyboard.press('Escape');
        await person.waitFor({ state: 'detached' });
        assert.equal(await original.evaluate(dialog => dialog.scrollWidth > dialog.clientWidth), false, 'Cast rail must not overflow media dialog');
        await page.evaluate(() => { window.catalogFailure = true; });
        await original.getByRole('button', { name: 'Studio One', exact: true }).click();
        await person.getByRole('button', { name: 'Retry request titles', exact: true }).waitFor();
        assert.equal(await person.getAttribute('data-kind'), 'studio');
        assert.equal(await person.locator('.hf-card').count(), 1, 'Requests failure preserves studio library titles');
        assert.equal(await page.evaluate(() => window.calls.some(call => call.kind === 'studio' && call.id === 'studio-one')), true);
        await page.evaluate(() => { window.catalogFailure = false; });
        await person.getByRole('button', { name: 'Retry request titles', exact: true }).click();
        await person.getByRole('button', { name: 'Details for Request Movie', exact: true }).waitFor();
        await page.keyboard.press('Escape');
        await person.waitFor({ state: 'detached' });
        await page.evaluate(() => { window.delay = true; });
        await original.getByRole('button', { name: 'View Actor One', exact: true }).click();
        await page.keyboard.press('Escape');
        await person.waitFor({ state: 'detached' });
        await page.evaluate(() => { window.release.forEach(release => release()); window.delay = false; });
        await original.getByRole('button', { name: 'View Actor One', exact: true }).click();
        await person.getByRole('button', { name: 'Details for Second Movie', exact: true }).click();
        const child = page.locator('.hf-dialog:not(.hf-person-dialog)').last();
        await child.getByRole('button', { name: 'Play', exact: true }).click();
        await page.waitForFunction(() => !document.querySelector('dialog[open]'));
        assert.equal(await page.evaluate(() => window.plays[0].item), 'second');
        await page.evaluate(() => window.openCatalog());
        await page.getByRole('button', { name: 'View Catalog Person', exact: true }).click();
        await person.getByRole('button', { name: 'Details for Request Movie', exact: true }).waitFor();
        assert.equal(await page.evaluate(() => window.calls.some(call => call.tmdbId === 500 && call.source === 'catalog')), true);
        await page.keyboard.press('Escape');
        await page.getByRole('button', { name: 'Catalog Studio', exact: true }).click();
        await person.getByRole('button', { name: 'Details for Request Movie', exact: true }).waitFor();
        assert.equal(await page.evaluate(() => window.calls.some(call => call.tmdbId === 600 && call.kind === 'studio')), true);
        assert.deepEqual(errors, []);
        console.log(JSON.stringify({ passed: true, widths, deduplicatedCast: 3, nestedDialogs: true, metadataFailure: true, retry: true, partialPagination: true, refreshedStatuses: true, playableFirst: true, mediaTypeDeduplication: true, nativeStudios: true, catalogCredits: true, staleResponse: true, playback: true, errors }));
    } finally {
        await browser?.close(); await new Promise(resolve => server.close(resolve));
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
