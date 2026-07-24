const peliculas = [];

const series = [];

let favoritos = JSON.parse(localStorage.getItem('favoritosBlueFlix')) || [];
let customContent = JSON.parse(localStorage.getItem('customBlueFlix')) || [];
let currentContent = null;
let currentSeason = 0;
const fileURLs = {};

const DB_NAME = 'BlueFlixDB';
const DB_VERSION = 1;
const STORE_NAME = 'videos';

const GH_RAW = 'https://raw.githubusercontent.com/steelflix-oficial/steelflix/main/data.json';

async function loadFromGitHub() {
    try {
        const res = await fetch(GH_RAW + '?t=' + Date.now());
        if (!res.ok) return null;
        return await res.json();
    } catch (e) {
        return null;
    }
}

async function syncFromCloud() {
    const data = await loadFromGitHub();
    if (!data) return;
    if (data.customContent && data.customContent.length > 0) {
        customContent = data.customContent;
        localStorage.setItem('customBlueFlix', JSON.stringify(customContent));
    }
    if (data.favoritos) {
        favoritos = data.favoritos;
        localStorage.setItem('favoritosBlueFlix', JSON.stringify(favoritos));
    }
    if (data.settings) {
        localStorage.setItem('SteelFlix-OficialSettings', JSON.stringify(data.settings));
    }
}

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e.target.error);
    });
}

async function getVideoBlob(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const request = tx.objectStore(STORE_NAME).get(id);
        request.onsuccess = (e) => resolve(e.target.result ? e.target.result.blob : null);
        request.onerror = (e) => reject(e.target.error);
    });
}

function getYoutubeId(url) {
    if (!url) return null;
    const match = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    return match ? match[1] : null;
}

function getAllContent() {
    const customPelis = customContent.filter(c => c.tipo === 'pelicula');
    const customSeries = customContent.filter(c => c.tipo === 'serie');
    return [...peliculas, ...series, ...customPelis, ...customSeries];
}

document.addEventListener('DOMContentLoaded', async () => {
    await syncFromCloud();
    renderPeliculas();
    renderSeries();
    renderFavoritos();
    setupEventListeners();
    handleScroll();
});

function renderPeliculas(filter = 'all') {
    const grid = document.getElementById('peliculasGrid');
    const customPelis = customContent.filter(c => c.tipo === 'pelicula');
    const allPelis = [...peliculas, ...customPelis];
    const filtered = filter === 'all' ? allPelis : allPelis.filter(p => p.g === filter);
    grid.innerHTML = filtered.map(p => createCard(p, 'pelicula')).join('');
}

function renderSeries(filter = 'all') {
    const grid = document.getElementById('seriesGrid');
    const customSeries = customContent.filter(c => c.tipo === 'serie');
    const allSeries = [...series, ...customSeries];
    const filtered = filter === 'all' ? allSeries : allSeries.filter(s => s.g === filter);
    grid.innerHTML = filtered.map(s => createCard(s, 'serie')).join('');
}

function renderFavoritos() {
    const grid = document.getElementById('favoritosGrid');
    const allContent = getAllContent();
    const favItems = allContent.filter(item => favoritos.includes(item.id));
    if (favItems.length === 0) {
        grid.innerHTML = '<div class="empty-favorites"><i class="fas fa-heart-broken"></i><p>No tienes favoritos aun. Agrega algunos!</p></div>';
    } else {
        grid.innerHTML = favItems.map(item => createCard(item, 'favorito')).join('');
    }
}

function createCard(item, type) {
    const isFav = favoritos.includes(item.id);
    const badge = type === 'serie' ? '<span class="badge">SERIE</span>' : '';
    return `
        <div class="content-card" data-id="${item.id}" data-genero="${item.g}">
            <img src="${item.img}" alt="${item.t}" loading="lazy">
            <button class="favorite-btn ${isFav ? 'active' : ''}" onclick="toggleFavorito(event, '${item.id}')">
                <i class="fas fa-heart"></i>
            </button>
            ${badge}
            <div class="card-overlay">
                <div class="play-btn"><i class="fas fa-play"></i></div>
                <h4>${item.t}</h4>
                <div class="meta">
                    <span class="rating"><i class="fas fa-star"></i> ${item.r}</span>
                    <span>${item.y}</span>
                </div>
            </div>
        </div>
    `;
}

function toggleFavorito(event, id) {
    event.stopPropagation();
    if (favoritos.includes(id)) {
        favoritos = favoritos.filter(fav => fav !== id);
    } else {
        favoritos.push(id);
    }
    localStorage.setItem('favoritosBlueFlix', JSON.stringify(favoritos));
    document.querySelectorAll(`[data-id="${id}"] .favorite-btn`).forEach(btn => {
        btn.classList.toggle('active');
    });
    renderFavoritos();
}

async function openModal(id) {
    const allContent = getAllContent();
    currentContent = allContent.find(item => item.id === id);
    if (!currentContent) return;

    document.getElementById('modalTitle').textContent = currentContent.t;
    document.getElementById('modalDescription').textContent = currentContent.desc;
    document.getElementById('modalYear').innerHTML = '<i class="fas fa-calendar"></i> ' + currentContent.y;
    document.getElementById('modalRating').innerHTML = '<i class="fas fa-star"></i> ' + currentContent.r;
    document.getElementById('modalDuration').innerHTML = '<i class="fas fa-clock"></i> ' + currentContent.d;

    const favBtn = document.getElementById('modalFavorite');
    const isFav = favoritos.includes(currentContent.id);
    favBtn.className = 'btn-favorite' + (isFav ? ' active' : '');
    favBtn.innerHTML = '<i class="fas fa-heart"></i> ' + (isFav ? 'En Favoritos' : 'Agregar a Favoritos');

    const videoPlayer = document.getElementById('videoPlayer');
    const episodesContainer = document.getElementById('episodesContainer');

    videoPlayer.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#666;"><i class="fas fa-spinner fa-spin"></i> Cargando...</div>';
    episodesContainer.style.display = 'none';

    const customItem = customContent.find(c => c.id === id);

    if (customItem && customItem._hasFile && !customItem.video) {
        const blob = await getVideoBlob(id);
        if (blob) {
            let url = fileURLs[id];
            if (!url) {
                url = URL.createObjectURL(blob);
                fileURLs[id] = url;
            }
            videoPlayer.innerHTML = `<video controls autoplay src="${url}" style="width:100%;height:100%;"></video>`;
        } else {
            videoPlayer.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:#ff6b6b;gap:10px;"><i class="fas fa-exclamation-triangle" style="font-size:2rem;"></i><p style="font-size:1.1rem;">Video no encontrado. Re-subelo desde el admin.</p></div>';
        }
    } else if (customItem && customItem.video) {
    } else if (customItem && customItem.video) {
        const videoId = getYoutubeId(customItem.video);
        if (videoId) {
            videoPlayer.innerHTML = `<iframe src="https://www.youtube.com/embed/${videoId}?autoplay=1" allowfullscreen allow="autoplay; encrypted-media"></iframe>`;
        } else {
            videoPlayer.innerHTML = `<video controls autoplay src="${customItem.video}" style="width:100%;height:100%;" onerror="this.innerHTML='<div style=display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:#ff6b6b;><i class=fas fa-exclamation-triangle style=font-size:2rem;></i><p>Error al cargar el video. Verifica que el enlace sea valido.</p></div>'"></video>`;
        }
    } else if (customItem && customItem.temporadas && customItem.temporadas.length > 0) {
        episodesContainer.style.display = 'block';
        currentSeason = 0;
        renderSeasons(customItem);
        videoPlayer.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#666;">Selecciona un capitulo para reproducir</div>';
    } else {
        videoPlayer.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#666;">Sin video disponible</div>';
    }

    document.getElementById('videoModal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    document.getElementById('videoPlayer').innerHTML = '';
    document.getElementById('videoModal').classList.remove('active');
    document.body.style.overflow = 'auto';
    currentContent = null;
}

function renderSeasons(content) {
    const tabs = document.getElementById('seasonsTabs');
    tabs.innerHTML = content.temporadas.map((t, i) =>
        `<button class="season-tab ${i === currentSeason ? 'active' : ''}" onclick="selectSeason(${i})">T${i + 1}</button>`
    ).join('');
    renderEpisodes(content.temporadas[currentSeason]);
}

function selectSeason(index) {
    currentSeason = index;
    if (currentContent) renderSeasons(currentContent);
}

function renderEpisodes(temporada) {
    const list = document.getElementById('episodesList');
    list.innerHTML = temporada.map((cap, i) => `
        <div class="episode-item" onclick="playEpisode(${JSON.stringify(cap).replace(/"/g, '&quot;')})">
            <span class="episode-num">${i + 1}</span>
            <span class="episode-name">${cap.nombre}</span>
            <span class="episode-play"><i class="fas fa-play"></i></span>
        </div>
    `).join('');
}

async function playEpisode(cap) {
    const videoPlayer = document.getElementById('videoPlayer');

    if (cap._hasFile && !cap.video) {
        const blob = await getVideoBlob(cap._fileId);
        if (blob) {
            let url = fileURLs[cap._fileId];
            if (!url) {
                url = URL.createObjectURL(blob);
                fileURLs[cap._fileId] = url;
            }
            videoPlayer.innerHTML = `<video controls autoplay src="${url}" style="width:100%;height:100%;"></video>`;
        } else {
            videoPlayer.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:#ff6b6b;gap:10px;"><i class="fas fa-exclamation-triangle" style="font-size:2rem;"></i><p style="font-size:1.1rem;">Capitulo no encontrado.</p></div>';
        }
    } else if (cap.video) {
        const videoId = getYoutubeId(cap.video);
        if (videoId) {
            videoPlayer.innerHTML = `<iframe src="https://www.youtube.com/embed/${videoId}?autoplay=1" allowfullscreen allow="autoplay; encrypted-media"></iframe>`;
        } else {
            videoPlayer.innerHTML = `<video controls autoplay src="${cap.video}" style="width:100%;height:100%;" onerror="this.innerHTML='<div style=display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:#ff6b6b;><p>Error al cargar el video.</p></div>'"></video>`;
        }
    }
    videoPlayer.scrollIntoView({ behavior: 'smooth' });
}

function setupEventListeners() {
    document.getElementById('closeModal').addEventListener('click', closeModal);
    document.getElementById('videoModal').addEventListener('click', (e) => {
        if (e.target.id === 'videoModal') closeModal();
    });
    document.getElementById('modalFavorite').addEventListener('click', () => {
        if (currentContent) {
            toggleFavorito(new Event('click'), currentContent.id);
            const favBtn = document.getElementById('modalFavorite');
            const isFav = favoritos.includes(currentContent.id);
            favBtn.className = 'btn-favorite' + (isFav ? ' active' : '');
            favBtn.innerHTML = '<i class="fas fa-heart"></i> ' + (isFav ? 'En Favoritos' : 'Agregar a Favoritos');
        }
    });
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const filter = e.target.dataset.filter;
            const section = e.target.closest('.content-section');
            section.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            if (section.id === 'peliculas') renderPeliculas(filter);
            else if (section.id === 'series') renderSeries(filter);
        });
    });
    document.getElementById('searchInput').addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        if (term === '') { renderPeliculas(); renderSeries(); return; }
        const allContent = getAllContent();
        const results = allContent.filter(i => i.t.toLowerCase().includes(term) || i.g.toLowerCase().includes(term));
        const customPelis = customContent.filter(c => c.tipo === 'pelicula');
        const customSeries = customContent.filter(c => c.tipo === 'serie');
        document.getElementById('peliculasGrid').innerHTML = results.filter(r => [...peliculas, ...customPelis].some(p => p.id === r.id)).map(i => createCard(i, 'pelicula')).join('');
        document.getElementById('seriesGrid').innerHTML = results.filter(r => [...series, ...customSeries].some(s => s.id === r.id)).map(i => createCard(i, 'serie')).join('');
    });
    document.addEventListener('click', (e) => {
        const card = e.target.closest('.content-card');
        if (card && !e.target.closest('.favorite-btn')) openModal(parseInt(card.dataset.id));
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
    document.querySelector('.hamburger').addEventListener('click', () => {
        document.querySelector('.nav-links').classList.toggle('active');
    });
}

function handleScroll() {
    window.addEventListener('scroll', () => {
        const navbar = document.querySelector('.navbar');
        if (window.scrollY > 50) navbar.classList.add('scrolled');
        else navbar.classList.remove('scrolled');
    });
}

function scrollToSection(sectionId) {
    document.getElementById(sectionId).scrollIntoView({ behavior: 'smooth' });
}

// Particles
(function() {
    const container = document.getElementById('particles');
    if (!container) return;
    for (let i = 0; i < 30; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        p.style.left = Math.random() * 100 + '%';
        p.style.animationDelay = Math.random() * 15 + 's';
        p.style.animationDuration = (10 + Math.random() * 20) + 's';
        p.style.width = p.style.height = (2 + Math.random() * 4) + 'px';
        container.appendChild(p);
    }
})();

// Scroll reveal
(function() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('active'); });
    }, { threshold: 0.1 });
    document.querySelectorAll('.content-section').forEach(s => {
        s.classList.add('reveal');
        observer.observe(s);
    });
})();

// ===== APPLY SETTINGS + IMPORT =====
function loadSettings() {
    return JSON.parse(localStorage.getItem('SteelFlix-OficialSettings')) || {};
}

function applySettings() {
    const s = loadSettings();
    if (!s.siteName && !s.primaryColor) return;

    if (s.primaryColor) {
        document.documentElement.style.setProperty('--primary-color', s.primaryColor);
        const db = s.primaryColor.replace('#','');
        const r = parseInt(db.substring(0,2),16);
        const g = parseInt(db.substring(2,4),16);
        const b = parseInt(db.substring(4,6),16);
        document.documentElement.style.setProperty('--primary-dark', `rgb(${Math.max(0,r-30)},${Math.max(0,g-30)},${Math.max(0,b-30)})`);
    }

    if (s.font) {
        document.querySelector('link[href*="fonts.googleapis"]').href =
            `https://fonts.googleapis.com/css2?family=${s.font}:wght@300;400;500;600;700;800&display=swap`;
        document.body.style.fontFamily = `'${s.font}', sans-serif`;
    }

    if (s.logoIcon) document.getElementById('logoIcon').className = s.logoIcon;
    if (s.siteName) {
        document.getElementById('logoText').textContent = s.siteName;
        document.title = s.siteName + ' - Peliculas y Series Gratis';
    }
    if (s.siteName) document.getElementById('footerLogoText').textContent = s.siteName;
    if (s.footerText) document.getElementById('footerText').innerHTML = `&copy; ${new Date().getFullYear()} ${s.siteName||'SteelFlix-Oficial'}. ${s.footerText}`;
    if (s.heroTitle) document.getElementById('heroTitle').innerHTML = `${s.heroTitle} <span id="heroHighlight">${s.heroHighlight||''}</span>`;
    if (s.heroDesc) document.getElementById('heroDesc').textContent = s.heroDesc;
    if (s.heroBtn) document.getElementById('heroBtn').textContent = s.heroBtn;
    if (s.heroBg) document.querySelector('.hero').style.background = `url('${s.heroBg}') center/cover no-repeat, linear-gradient(135deg, #0a0f1e, #0d1117, #0a1628)`;
    if (s.nav1) document.getElementById('navLink1').textContent = s.nav1;
    if (s.nav2) document.getElementById('navLink2').textContent = s.nav2;
    if (s.nav3) document.getElementById('navLink3').textContent = s.nav3;
    if (s.nav4) document.getElementById('navLink4').textContent = s.nav4;
    if (s.secPelis) document.getElementById('secPelisTitle').innerHTML = `<i class="fas fa-film"></i> ${s.secPelis}`;
    if (s.secSeries) document.getElementById('secSeriesTitle').innerHTML = `<i class="fas fa-tv"></i> ${s.secSeries}`;
    if (s.secFav) document.getElementById('secFavTitle').innerHTML = `<i class="fas fa-heart"></i> ${s.secFav}`;
}

document.addEventListener('DOMContentLoaded', () => {
    applySettings();
});
