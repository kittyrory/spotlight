/* ---------- load real profile data ---------- */
let currentProfile = null;

function applyProfileToDOM(profile) {
const handle = profile.handle ? `@${profile.handle.replace(/^@/, '')}` : '@yourhandle';
document.getElementById('fameHandle').textContent = handle;
document.getElementById('fameDisplayName').textContent = profile.display_name || handle;

if (profile.bio) {
    document.getElementById('fameBio').textContent = profile.bio;
}
if (profile.avatar_url) {
    document.getElementById('fameAvatarImg').src = profile.avatar_url;
}
if (profile.header_url) {
    document.getElementById('fameHeaderImg').src = profile.header_url;
}
}

async function loadIconProfile() {
// 1. paint the shared cache first, but continue to supabase so it can
// refresh stale data for the next page.
const cachedProfile = window.SpotlightProfileCache.read();
if (cachedProfile) {
    applyProfileToDOM(cachedProfile);
} else {
    // keep legacy editor data as a fallback for older sessions.
    const localData = localStorage.getItem('savedProfile');
    try {
    if (localData) {
        const parsedLocal = JSON.parse(localData);
        applyProfileToDOM({
        display_name: parsedLocal.name,
        handle: parsedLocal.handle,
        bio: parsedLocal.bio,
        avatar_url: localStorage.getItem('savedAvatar') || null,
        header_url: localStorage.getItem('savedBanner') || null,
        });
    }
    } catch (error) {
    console.warn('Could not parse legacy cached profile:', error);
    }
}

// 2. fetch from supabase
const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
if (userError || !user) {
    if (userError?.name !== 'AuthSessionMissingError') {
    console.error('Could not identify signed-in user:', userError);
    }
    return;
}

const { data: profile, error } = await supabaseClient
    .from('profiles')
    .select('display_name, handle, bio, avatar_url, header_url')
    .eq('id', user.id)
    .single();

// fallback: if no profile exists, create one
if (error || !profile) {
    if (error && error.code === 'PGRST116') {
    // create one from auth metadata
    const username = user.user_metadata?.username || user.email?.split('@')[0] || 'user';
    const newProfile = {
        id: user.id,
        display_name: username,
        handle: username,
        bio: '',
        avatar_url: null,
        header_url: null,
    };

    const { error: insertError } = await supabaseClient
        .from('profiles')
        .insert(newProfile);

    if (!insertError) {
        // remove id before applying to DOM
        delete newProfile.id;
        currentProfile = newProfile;
        applyProfileToDOM(newProfile);
        window.SpotlightProfileCache.write(newProfile);
        return;
    }
    }

    console.error('Could not load profile:', error);
    return;
}

// 4. profile loads successfully
currentProfile = profile;
applyProfileToDOM(profile);
window.SpotlightProfileCache.write(profile);
}

loadIconProfile();

/* ---------- back button: return to whichever page the user came from ---------- */
document.getElementById('backBtn').addEventListener('click', () => {
const lastPage = sessionStorage.getItem('spotlight-last-page') || 'Feed.html';
window.location.href = lastPage;
});

/* ---------- sparkles inside fame card ---------- */
const fameCard = document.getElementById('fameCard');
const sparklePositions = [
{top:'58%', left:'88%', size:4, delay:'0s'},
{top:'74%', left:'8%', size:3, delay:'.8s'},
{top:'90%', left:'70%', size:5, delay:'1.6s'},
{top:'66%', left:'50%', size:3, delay:'2.2s'},
];
sparklePositions.forEach(s => {
const el = document.createElement('div');
el.className = 'sparkle';
el.style.top = s.top; el.style.left = s.left;
el.style.width = s.size+'px'; el.style.height = s.size+'px';
el.style.animationDelay = s.delay;
fameCard.appendChild(el);
});

/* ---------- avatar progress ring ---------- */
const AVATAR_R = 37, AVATAR_C = 2*Math.PI*AVATAR_R;
const avatarRing = document.getElementById('avatarRing');
avatarRing.style.strokeDasharray = AVATAR_C;
function setAvatarRing(pct){
const offset = AVATAR_C * (1 - pct/100);
avatarRing.style.strokeDashoffset = offset;
}
requestAnimationFrame(() => setTimeout(() => setAvatarRing(68), 150));

/* ---------- count-up stats ---------- */
const FOLLOWING_COUNT = 0;
const POST_COUNT = 0;   // only used if the posts lookup fails

function formatCount(n){
return n >= 1000 ? (n / 1000).toFixed(1).replace('.0', '') + 'K' : String(n);
}
function countUp(el, target){
const duration = 900;
const t0 = performance.now();
// a newer countUp / snap on the same element cancels this one so a stale animation can't overwrite it
el._cu = (el._cu || 0) + 1;
const run = el._cu;
function tick(now){
    if (el._cu !== run) return;
    const p = Math.min(1, (now - t0) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = formatCount(Math.round(target * eased));
    if (p < 1) requestAnimationFrame(tick);
    else el.textContent = formatCount(target);
}
requestAnimationFrame(tick);
}
/* ---------- stats: cache first, then refresh from supabase ----------
   followers / following / posts are cached per user (SpotlightStatsCache in profile-cache.js) so the numbers
   paint right away. supabase stays the source of truth and the cache is refreshed after every load, so
   clearing the cache never loses anything.
   - following = rows in `follows` where this user is the follower
   - followers = sync_own_followers(): the backend adds one 100-500 roll per post that hasn't been rolled
     for yet, saves the total on profiles.follower_count, and returns it
   - posts = count of this user's posts */
const statEls = {
  followers: document.getElementById('statFollowers'),
  following: document.getElementById('statFollowing'),
  posts: document.getElementById('statPosts'),
};
const shownStats = {};

function showStat(key, value){
if (!Number.isFinite(value) || shownStats[key] === value) return;
if (shownStats[key] === undefined) {
    // first paint counts up from 0
    countUp(statEls[key], value);
} else {
    // later changes snap (and cancel any animation that's still running)
    statEls[key]._cu = (statEls[key]._cu || 0) + 1;
    statEls[key].textContent = formatCount(value);
}
shownStats[key] = value;
}

// the id of the signed-in user without a network request: cached profile first, then the stored session
async function fastUserId(){
const cached = window.SpotlightProfileCache && window.SpotlightProfileCache.read();
if (cached && cached.id) return cached.id;
try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    return session && session.user ? session.user.id : null;
} catch (err) {
    return null;
}
}

async function loadStats(){
const cache = window.SpotlightStatsCache;

// 1. paint the cache
const cachedId = await fastUserId();
const cached = cachedId && cache ? cache.read(cachedId) : null;
if (cached){
    showStat('followers', cached.followers);
    showStat('following', cached.following);
    showStat('posts', cached.posts);
}

// 2. refresh from supabase. anything that fails keeps the number that's already showing
let user = null;
try {
    const res = await supabaseClient.auth.getUser();
    user = res.data ? res.data.user : null;
} catch (err) {
    console.error('Could not identify signed-in user:', err);
}
if (!user) return;

try {
    const [followRes, postsRes, rollRes] = await Promise.all([
    supabaseClient.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', user.id),
    supabaseClient.from('posts').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
    supabaseClient.rpc('sync_own_followers'),
    ]);

    const fresh = {};
    if (followRes.error) console.error('Could not count following:', followRes.error);
    else if (typeof followRes.count === 'number') fresh.following = followRes.count;

    if (postsRes.error) console.error('Could not count posts:', postsRes.error);
    else if (typeof postsRes.count === 'number') fresh.posts = postsRes.count;

    if (rollRes.error) console.error('Could not sync followers:', rollRes.error);
    else if (rollRes.data !== null && Number.isFinite(Number(rollRes.data))) fresh.followers = Number(rollRes.data);

    Object.keys(fresh).forEach(key => showStat(key, fresh[key]));
    if (cache) cache.write(user.id, fresh);
} catch (err) {
    console.error('Could not load stats:', err);
}
}
loadStats();

// coming back with the back button restores the old page from the browser cache, so refresh then too
window.addEventListener('pageshow', (e) => { if (e.persisted) loadStats(); });

/* ---------- tabs ---------- */
document.querySelectorAll('.tab-btn').forEach(btn => {
btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('panel-' + btn.dataset.tab).classList.add('active');
});
});

/* ---------- overview radial gauges ---------- */
const STATS = [
{ id:'humor', label:'Humor', value:24, delta:1, color:'#f5c451', caption:"You're comedy gold." },
{ id:'aura', label:'Aura', value:29, delta:2, color:'#6fcf97', caption:'Captivating presence.' },
{ id:'chaos', label:'Chaos', value:41, delta:3, color:'#f2685f', caption:'Main-character energy.' },
];
const G_R = 32, G_C = 2*Math.PI*G_R;
const gaugeRow = document.getElementById('gaugeRow');
STATS.forEach(s => {
const el = document.createElement('div');
el.className = 'gauge';
el.innerHTML = `
    <div class="gauge-wrap">
    <svg viewBox="0 0 78 78" width="78" height="78">
        <circle class="gauge-track" cx="39" cy="39" r="${G_R}"/>
        <circle class="gauge-fill" id="fill-${s.id}" cx="39" cy="39" r="${G_R}" stroke="${s.color}" stroke-dasharray="${G_C}" stroke-dashoffset="${G_C}"/>
    </svg>
    <div class="gauge-value" id="val-${s.id}">0%</div>
    </div>
    <div class="gauge-label">${s.label}</div>
    <div class="gauge-delta" id="delta-${s.id}" style="color:${s.color};">+${s.delta}%</div>
    <div class="gauge-caption">${s.caption}</div>
`;
gaugeRow.appendChild(el);
});

function setGauge(s, animate){
const fillEl = document.getElementById('fill-' + s.id);
const valEl = document.getElementById('val-' + s.id);
const deltaEl = document.getElementById('delta-' + s.id);
const offset = G_C * (1 - Math.max(0, Math.min(100, s.value)) / 100);
fillEl.style.strokeDashoffset = offset;
valEl.textContent = Math.round(s.value) + '%';
deltaEl.textContent = (s.delta >= 0 ? '+' : '') + s.delta + '%';
deltaEl.style.color = s.delta >= 0 ? '#6fcf97' : '#f2685f';
if (animate){
    valEl.style.transition = 'none';
    valEl.style.transform = 'scale(1.25)';
    requestAnimationFrame(() => {
    valEl.style.transition = 'transform .4s cubic-bezier(.34,1.56,.64,1)';
    valEl.style.transform = 'scale(1)';
    });
}
}

requestAnimationFrame(() => setTimeout(() => STATS.forEach(s => setGauge(s)), 150));

setInterval(() => {
const s = STATS[Math.floor(Math.random() * STATS.length)];
const delta = (Math.random() * 6) - 2;
s.value = Math.max(6, Math.min(94, s.value + delta));
s.delta = Math.round(delta * 10) / 10;
setGauge(s, true);
}, 3400);

/* ---------- inner circle carousel ---------- */
// bots come from bot_profiles, their affinity from user_relationships (see loadInnerCircle below)
let RELATIONSHIPS = [];
const AVATAR_COLORS = ['#f5c451', '#4fa8dd', '#6fcf97', '#f2685f', '#c792ea', '#f2a13d', '#8ab4f8', '#f582ae'];

function hashString(str){
let h = 0;
for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
return h;
}
function initialsOf(name){
const parts = String(name || '?').replace(/^@/, '').trim().split(/[\s_.-]+/).filter(Boolean);
return (parts.length > 1 ? parts[0][0] + parts[1][0] : (parts[0] || '?').slice(0, 2)).toUpperCase();
}
function escapeHtml(str){
return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/* ---------- affinity tiers ----------
   affinity_score runs from -100 to 100 and starts at 0 (stranger).
   `min` is the lowest score that belongs to the tier. each tier is stored on the
   user_relationships row as jsonb: { name, description }. the tiers below are the
   source of truth; a row whose stored tier is out of date gets re-synced on load. */
const AFFINITY_MIN = -100;
const AFFINITY_MAX = 100;
const TIERS = [
{ min: -100, name: 'Sworn Enemies', description: 'This has gone way past dislike. You are each other\'s worst-case scenario, and there\'s no coming back from this without a miracle.' },
{ min: -60,  name: 'Enemies',       description: 'You can\'t stand each other. Every interaction leaves a sour taste, and it isn\'t going to fix itself.' },
{ min: -25,  name: 'Rivals',        description: 'There\'s friction between you. You don\'t see eye to eye, and neither of you is in a hurry to back down.' },
{ min: -5,   name: 'Stranger',      description: 'You aren\'t quite sure who they are, and they aren\'t sure who you are. Try sparking up a friendly conversation!' },
{ min: 5,    name: 'Acquaintance',  description: 'You\'ve crossed paths a few times and know each other\'s names. A little more conversation could turn this into something.' },
{ min: 20,   name: 'Friends',       description: 'You enjoy each other\'s company and check in when you can. There\'s real warmth here.' },
{ min: 50,   name: 'Close Friends', description: 'You share inside jokes and trust each other with the real stuff. They\'re one of your people.' },
{ min: 80,   name: 'Ride or Die',   description: 'Through thick and thin, they\'ve got your back and you\'ve got theirs. Nothing is breaking this bond.' },
];

function clampScore(n){
return Math.max(AFFINITY_MIN, Math.min(AFFINITY_MAX, n));
}
function tierForScore(score){
let tier = TIERS[0];
for (const t of TIERS) if (score >= t.min) tier = t;
return tier;
}
function tierJson(tier){
return { name: tier.name, description: tier.description };
}
function readStoredTier(value){
if (typeof value === 'string'){
    try { return JSON.parse(value); } catch (e) { return null; }
}
return value && typeof value === 'object' ? value : null;
}
function tierMatches(stored, tier){
return !!stored && stored.name === tier.name && stored.description === tier.description;
}
function formatScore(score){
const n = Number.isInteger(score) ? String(score) : score.toFixed(1);
return (score > 0 ? '+' : '') + n;
}
function scoreColor(score){
return score > 0 ? '#6fcf97' : score < 0 ? '#f2685f' : 'var(--ink-dim)';
}

// row = this user's user_relationships row for the bot, or undefined if they've never interacted.
// no row means affinity 0 (stranger), and a row gets created for it in syncRelationshipRows().
function botToRelationship(b, row){
const h = hashString(String(b.id));
const handle = String(b.handle || '').replace(/^@/, '');
const name = b.display_name || handle || 'Bot';
const raw = row ? Number(row.affinity_score) : 0;
const score = clampScore(Number.isFinite(raw) ? raw : 0);
return {
    id: b.id,
    name: name,
    handle: '@' + handle,
    initials: initialsOf(name),
    avatar: b.avatar_url || null,
    color: AVATAR_COLORS[h % AVATAR_COLORS.length],
    verified: !!b.verified,
    score: score,
    // how much the last interaction moved the score (user_relationships.last_affinity_change); 0 if none
    delta: Math.round((row && Number.isFinite(Number(row.last_affinity_change)) ? Number(row.last_affinity_change) : 0) * 10) / 10,
    tier: tierForScore(score),
    hasRow: !!row,
    storedTier: row ? readStoredTier(row.affinity_tier) : null,
};
}

const verifiedSVG = `<svg width="12" height="12" viewBox="0 0 22 22" fill="currentColor" style="color:#4fa8dd;"><path d="M11 0l2.4 1.4 2.7-.6 1.4 2.4 2.7.6.3 2.8 2 1.9-1.2 2.5 1.2 2.5-2 1.9-.3 2.8-2.7.6-1.4 2.4-2.7-.6L11 22l-2.4-1.4-2.7.6-1.4-2.4-2.7-.6-.3-2.8-2-1.9 1.2-2.5L.2 8.5l2-1.9.3-2.8 2.7-.6L6.6.8 9.3 1.4 11 0z"/></svg>`;

const circleScroll = document.getElementById('circleScroll');

function renderInnerCircle(){
circleScroll.innerHTML = '';
if (!RELATIONSHIPS.length){
    circleScroll.innerHTML = '<div class="circle-empty">No bots yet. Create a custom bot and it will show up here.</div>';
    return;
}
RELATIONSHIPS.forEach((r, i) => {
    r.uid = 'circ-' + i;
    const el = document.createElement('div');
    el.className = 'circle-card';
    el.tabIndex = 0;
    el.setAttribute('role', 'link');
    el.setAttribute('aria-label', 'Open ' + r.name + ' profile');
    el.innerHTML = `
    <div class="circle-top">
        <div class="circle-avatar" style="background:${r.color};">${r.avatar ? `<img src="${escapeHtml(r.avatar)}" alt="">` : escapeHtml(r.initials)}</div>
        <div>
        <div class="circle-name">${escapeHtml(r.name)} ${r.verified ? verifiedSVG : ''}</div>
        <div class="circle-handle">${escapeHtml(r.handle)}</div>
        </div>
    </div>
    <div class="circle-meter">
        <div class="circle-track">
        <div class="circle-fill" id="fill-${r.uid}" style="position:absolute; top:0; left:50%; width:0%; transition: width 1s cubic-bezier(.3,.8,.3,1), left 1s cubic-bezier(.3,.8,.3,1), background-color .3s ease;"></div>
        <span style="position:absolute; left:50%; top:0; bottom:0; width:1px; background:var(--ink-faint); opacity:.5;"></span>
        </div>
        <div class="circle-pct" id="pct-${r.uid}" style="color:${scoreColor(r.score)};">${formatScore(r.score)}</div>
    </div>
    <div class="circle-caption"><b style="color:${scoreColor(r.score)};">${escapeHtml(r.tier.name)}</b>${r.delta ? ` <b style="color:${scoreColor(r.delta)};">${formatScore(r.delta)}</b>` : ''} ${escapeHtml(r.tier.description)}</div>
    `;
    const open = () => {
    sessionStorage.setItem('spotlight-last-page', window.location.href);
    window.location.href = 'bot-profile.html?id=' + encodeURIComponent(r.id);
    };
    el.addEventListener('click', open);
    el.addEventListener('keydown', e => { if (e.key === 'Enter') open(); });
    circleScroll.appendChild(el);
});
requestAnimationFrame(() => setTimeout(() => RELATIONSHIPS.forEach(r => setCircle(r)), 150));
}

async function loadInnerCircle(){
const { data, error } = await supabaseClient.from('bot_profiles').select('*');
if (error){
    console.error('Could not load bot profiles:', error);
}
const bots = data || [];

// this user's relationship rows, keyed by bot id
let userId = null;
const rowsByBot = {};
try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    userId = user ? user.id : null;
    if (userId && bots.length){
    const res = await supabaseClient.from('user_relationships').select('*').eq('user_id', userId);
    if (res.error) console.error('Could not load relationships:', res.error);
    else (res.data || []).forEach(row => { rowsByBot[String(row.bots_id)] = row; });
    }
} catch (err) {
    console.error('Could not load relationships:', err);
}

RELATIONSHIPS = bots.map(b => botToRelationship(b, rowsByBot[String(b.id)]));
renderInnerCircle();
syncRelationshipRows(userId);
}

// bots with no row get one at affinity 0, and rows whose stored tier jsonb is out of date get fixed.
// last_affinity_change isn't sent on insert on purpose: the column's default (0) fills it in.
async function syncRelationshipRows(userId){
if (!userId) return;

const missing = RELATIONSHIPS.filter(r => !r.hasRow);
if (missing.length){
    const { error } = await supabaseClient.from('user_relationships').insert(
    missing.map(r => ({ user_id: userId, bots_id: r.id, affinity_score: r.score, affinity_tier: tierJson(r.tier) }))
    );
    if (error) console.debug('Could not create relationship rows:', error.message);
}

const stale = RELATIONSHIPS.filter(r => r.hasRow && !tierMatches(r.storedTier, r.tier));
for (const r of stale){
    const { error } = await supabaseClient.from('user_relationships')
    .update({ affinity_tier: tierJson(r.tier) })
    .eq('user_id', userId)
    .eq('bots_id', r.id);
    if (error) console.debug('Could not update affinity_tier:', error.message);
}
}

// the bar grows out from the middle: right (green) for positive, left (red) for negative
function setCircle(r){
const color = scoreColor(r.score);
const width = r.score === 0 ? 0 : Math.max(3, Math.abs(r.score) / AFFINITY_MAX * 50);
const fillEl = document.getElementById('fill-' + r.uid);
fillEl.style.width = width + '%';
fillEl.style.left = (r.score < 0 ? 50 - width : 50) + '%';
fillEl.style.background = color;
}
loadInnerCircle();

/* ---------- header camera button: direct upload ---------- */
const headerCameraBtn = document.getElementById('headerCameraBtn');
const headerCameraInput = document.getElementById('headerCameraInput');
const fameHeaderImg = document.getElementById('fameHeaderImg');

headerCameraBtn.addEventListener('click', () => headerCameraInput.click());

headerCameraInput.addEventListener('change', async function () {
const file = this.files[0];
if (!file) return;

const dataUrl = await readFileAsDataUrl(file);
fameHeaderImg.src = dataUrl;

const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
if (userError || !user) {
    console.log('Could not save header image:', userError || 'No signed-in user.');
    return;
}

const { data: updated, error } = await supabaseClient
    .from('profiles')
    .update({ header_url: dataUrl })
    .eq('id', user.id)
    .select('display_name, handle, bio, avatar_url, header_url')
    .single();

if (error) {
    console.log('Could not save header image:', error);
    return;
}
currentProfile = updated;
window.SpotlightProfileCache.write(updated);
});

editProfileBtn.addEventListener('click', () => {
sessionStorage.setItem('spotlight-last-page', window.location.href);
window.location.href = 'EditIconPage.html';
});