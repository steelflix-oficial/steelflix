const peliculas = [];

const series = [];

let favoritos = JSON.parse(localStorage.getItem('favoritosBlueFlix')) || [];
let customContent = JSON.parse(localStorage.getItem('customBlueFlix')) || [];
let currentContent = null;
let currentSeason = 0;
let seasonCount = 0;
let currentVideoSource = 'youtube';
const fileURLs = {};

const DB_NAME = 'BlueFlixDB';
const DB_VERSION = 1;
const STORE_NAME = 'videos';

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

async function saveVideoBlob(id, blob) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put({ id, blob });
        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject(e.target.error);
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

async function deleteVideoBlob(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject(e.target.error);
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

function switchVideoSource(source) {
    currentVideoSource = source;
    document.querySelectorAll('.source-tab').forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');
    document.getElementById('youtubeSource').style.display = source === 'youtube' ? 'block' : 'none';
    document.getElementById('fileSource').style.display = source === 'file' ? 'block' : 'none';
}

document.addEventListener('DOMContentLoaded', () => {
    renderPeliculas();
    renderSeries();
    renderFavoritos();
    setupEventListeners();
    handleScroll();
    setupAddModal();
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
    const isCustom = customContent.some(c => c.id === item.id);
    const badge = type === 'serie' ? '<span class="badge">SERIE</span>' : '';
    const deleteBtn = isCustom ? `<button class="btn-delete" onclick="deleteContent(event, ${item.id})" title="Eliminar"><i class="fas fa-trash"></i></button>` : '';
    return `
        <div class="content-card" data-id="${item.id}" data-genero="${item.g}">
            <img src="${item.img}" alt="${item.t}" loading="lazy">
            ${deleteBtn}
            <button class="favorite-btn ${isFav ? 'active' : ''}" onclick="toggleFavorito(event, ${item.id})">
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

async function deleteContent(event, id) {
    event.stopPropagation();
    if (confirm('Eliminar este contenido?')) {
        const item = customContent.find(c => c.id === id);
        if (item && item._hasFile) {
            await deleteVideoBlob(id);
        }
        if (item && item.temporadas) {
            for (const temp of item.temporadas) {
                for (const cap of temp) {
                    if (cap._hasFile) await deleteVideoBlob(cap._fileId);
                }
            }
        }
        customContent = customContent.filter(c => c.id !== id);
        localStorage.setItem('customBlueFlix', JSON.stringify(customContent));
        renderPeliculas();
        renderSeries();
        renderFavoritos();
    }
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

    if (customItem && customItem._hasFile) {
        const blob = await getVideoBlob(id);
        if (blob) {
            let url = fileURLs[id];
            if (!url) {
                url = URL.createObjectURL(blob);
                fileURLs[id] = url;
            }
            videoPlayer.innerHTML = `<video controls autoplay src="${url}" style="width:100%;height:100%;"></video>`;
        } else {
            videoPlayer.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#ff6b6b;">Error al cargar el video</div>';
        }
    } else if (customItem && customItem.video) {
        const videoId = getYoutubeId(customItem.video);
        if (videoId) {
            videoPlayer.innerHTML = `<iframe src="https://www.youtube.com/embed/${videoId}?autoplay=1" allowfullscreen allow="autoplay; encrypted-media"></iframe>`;
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

    if (cap._hasFile) {
        const blob = await getVideoBlob(cap._fileId);
        if (blob) {
            let url = fileURLs[cap._fileId];
            if (!url) {
                url = URL.createObjectURL(blob);
                fileURLs[cap._fileId] = url;
            }
            videoPlayer.innerHTML = `<video controls autoplay src="${url}" style="width:100%;height:100%;"></video>`;
        }
    } else if (cap.video) {
        const videoId = getYoutubeId(cap.video);
        if (videoId) {
            videoPlayer.innerHTML = `<iframe src="https://www.youtube.com/embed/${videoId}?autoplay=1" allowfullscreen allow="autoplay; encrypted-media"></iframe>`;
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
        if (card && !e.target.closest('.favorite-btn') && !e.target.closest('.btn-delete')) openModal(parseInt(card.dataset.id));
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

function setupAddModal() {
    document.getElementById('btnAddNew').addEventListener('click', openAddModal);
    document.getElementById('closeAddModal').addEventListener('click', closeAddModal);
    document.getElementById('addModal').addEventListener('click', (e) => {
        if (e.target.id === 'addModal') closeAddModal();
    });
    document.getElementById('addType').addEventListener('change', (e) => {
        const isSerie = e.target.value === 'serie';
        document.getElementById('episodeSection').style.display = isSerie ? 'block' : 'none';
        document.getElementById('addVideoSection').style.display = isSerie ? 'none' : 'block';
    });
    document.getElementById('addSeasonBtn').addEventListener('click', addSeasonInput);
    document.getElementById('addForm').addEventListener('submit', handleFormSubmit);
}

function openAddModal() {
    document.getElementById('addModal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeAddModal() {
    document.getElementById('addModal').classList.remove('active');
    document.body.style.overflow = 'auto';
    document.getElementById('addForm').reset();
    document.getElementById('seasonsInputs').innerHTML = '';
    document.getElementById('episodeSection').style.display = 'none';
    document.getElementById('addVideoSection').style.display = 'block';
    currentVideoSource = 'youtube';
    document.querySelectorAll('.source-tab').forEach(t => t.classList.remove('active'));
    document.querySelector('.source-tab').classList.add('active');
    document.getElementById('youtubeSource').style.display = 'block';
    document.getElementById('fileSource').style.display = 'none';
    seasonCount = 0;
}

async function handleFormSubmit(e) {
    e.preventDefault();
    const tipo = document.getElementById('addType').value;
    const newId = Date.now();
    const newItem = {
        id: newId,
        t: document.getElementById('addTitle').value,
        img: document.getElementById('addImage').value,
        y: parseInt(document.getElementById('addYear').value),
        r: document.getElementById('addRating').value,
        d: document.getElementById('addDuration').value,
        g: document.getElementById('addGenre').value,
        desc: document.getElementById('addDesc').value,
        tipo: tipo
    };

    if (tipo === 'pelicula') {
        if (currentVideoSource === 'youtube') {
            const videoUrl = document.getElementById('addVideoUrl').value;
            if (!videoUrl || !getYoutubeId(videoUrl)) {
                alert('Pega una URL valida de YouTube');
                return;
            }
            newItem.video = videoUrl;
        } else {
            const videoFile = document.getElementById('addVideoFile').files[0];
            if (!videoFile) {
                alert('Selecciona un archivo de video');
                return;
            }
            const blob = await readFileAsBlob(videoFile);
            await saveVideoBlob(newId, blob);
            newItem._hasFile = true;
        }
    } else {
        newItem.temporadas = await collectTemporadas();
        if (newItem.temporadas.length === 0) {
            alert('Agrega al menos una temporada con capitulos');
            return;
        }
    }

    customContent.push(newItem);
    localStorage.setItem('customBlueFlix', JSON.stringify(customContent));
    closeAddModal();
    renderPeliculas();
    renderSeries();
    alert('Contenido agregado exitosamente!');
}

function readFileAsBlob(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(new Blob([e.target.result], { type: file.type }));
        reader.onerror = (e) => reject(e.target.error);
        reader.readAsArrayBuffer(file);
    });
}

function addSeasonInput() {
    seasonCount++;
    const container = document.getElementById('seasonsInputs');
    const div = document.createElement('div');
    div.className = 'season-input-group';
    div.id = `season-${seasonCount}`;
    div.innerHTML = `
        <h5>Temporada ${seasonCount}</h5>
        <div class="episodes-container-inputs"></div>
        <button type="button" class="btn-add-ep" onclick="addEpisodeInput(${seasonCount})">
            <i class="fas fa-plus"></i> Agregar Capitulo
        </button>
    `;
    container.appendChild(div);
    addEpisodeInput(seasonCount);
}

function addEpisodeInput(seasonNum) {
    const container = document.querySelector(`#season-${seasonNum} .episodes-container-inputs`);
    const div = document.createElement('div');
    div.className = 'episode-input-group';
    div.innerHTML = `
        <div class="episode-input-row">
            <input type="text" placeholder="Nombre del capitulo" class="ep-name">
            <button type="button" class="btn-remove-ep" onclick="this.closest('.episode-input-group').remove()">X</button>
        </div>
        <div class="episode-video-source">
            <div class="ep-source-tabs">
                <button type="button" class="ep-tab active" onclick="switchEpSource(this, 'youtube')">YouTube</button>
                <button type="button" class="ep-tab" onclick="switchEpSource(this, 'file')">Archivo</button>
            </div>
            <div class="ep-youtube">
                <input type="url" placeholder="URL de YouTube" class="ep-video-url">
            </div>
            <div class="ep-file" style="display:none;">
                <input type="file" accept="video/mp4,video/webm,video/ogg" class="ep-video-file">
            </div>
        </div>
    `;
    container.appendChild(div);
}

function switchEpSource(btn, source) {
    const group = btn.closest('.episode-video-source');
    group.querySelectorAll('.ep-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    group.querySelector('.ep-youtube').style.display = source === 'youtube' ? 'block' : 'none';
    group.querySelector('.ep-file').style.display = source === 'file' ? 'block' : 'none';
}

async function collectTemporadas() {
    const temporadas = [];
    const seasonGroups = document.querySelectorAll('.season-input-group');
    for (const group of seasonGroups) {
        const episodios = [];
        const epGroups = group.querySelectorAll('.episode-input-group');
        for (const epGroup of epGroups) {
            const nombre = epGroup.querySelector('.ep-name').value;
            const isFile = epGroup.querySelector('.ep-file').style.display !== 'none';

            if (isFile) {
                const file = epGroup.querySelector('.ep-video-file').files[0];
                if (nombre && file) {
                    const fileId = Date.now() + Math.random();
                    const blob = await readFileAsBlob(file);
                    await saveVideoBlob(fileId, blob);
                    episodios.push({ nombre, _hasFile: true, _fileId: fileId });
                }
            } else {
                const url = epGroup.querySelector('.ep-video-url').value;
                if (nombre && url && getYoutubeId(url)) {
                    episodios.push({ nombre, video: url });
                }
            }
        }
        if (episodios.length > 0) {
            temporadas.push(episodios);
        }
    }
    return temporadas;
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

// ===== EDIT PAGE SYSTEM =====
const defaultSettings = {
    siteName: 'SteelFlix',
    logoIcon: 'fas fa-play-circle',
    primaryColor: '#1e90ff',
    font: 'Poppins',
    heroTitle: 'Películas y Series',
    heroHighlight: 'GRATIS',
    heroDesc: 'Disfruta del mejor contenido sin costo alguno. Calidad HD y sin anuncios molestos.',
    heroBtn: 'Explorar Ahora',
    heroBg: '',
    nav1: 'Inicio', nav2: 'Peliculas', nav3: 'Series', nav4: 'Mis Favoritos',
    secPelis: 'Peliculas Populares', secSeries: 'Series en Tendencia', secFav: 'Mis Favoritos',
    footerText: '2026 SteelFlix. Entretenimiento gratuito para todos.'
};

function loadSettings() {
    return JSON.parse(localStorage.getItem('steelFlixSettings')) || { ...defaultSettings };
}

function saveSettings(s) {
    localStorage.setItem('steelFlixSettings', JSON.stringify(s));
}

function applySettings() {
    const s = loadSettings();
    document.documentElement.style.setProperty('--primary-color', s.primaryColor);

    const darkBtn = s.primaryColor.replace('#', '');
    const r = parseInt(darkBtn.substring(0,2),16);
    const g = parseInt(darkBtn.substring(2,4),16);
    const b = parseInt(darkBtn.substring(4,6),16);
    document.documentElement.style.setProperty('--primary-dark', `rgb(${Math.max(0,r-30)},${Math.max(0,g-30)},${Math.max(0,b-30)})`);

    document.querySelector('link[href*="fonts.googleapis"]').href =
        `https://fonts.googleapis.com/css2?family=${s.font}:wght@300;400;500;600;700;800&display=swap`;
    document.body.style.fontFamily = `'${s.font}', sans-serif`;

    const logoI = document.getElementById('logoIcon');
    const logoT = document.getElementById('logoText');
    if (logoI) logoI.className = s.logoIcon;
    if (logoT) logoT.textContent = s.siteName;
    document.title = s.siteName + ' - Peliculas y Series Gratis';

    const fLogo = document.getElementById('footerLogoText');
    const fText = document.getElementById('footerText');
    if (fLogo) fLogo.textContent = s.siteName;
    if (fText) fText.innerHTML = `&copy; ${new Date().getFullYear()} ${s.siteName}. ${s.footerText || 'Entretenimiento gratuito para todos.'}`;

    document.getElementById('heroTitle').innerHTML = `${s.heroTitle} <span id="heroHighlight">${s.heroHighlight}</span>`;
    document.getElementById('heroDesc').textContent = s.heroDesc;
    document.getElementById('heroBtn').textContent = s.heroBtn;

    if (s.heroBg) {
        document.querySelector('.hero').style.background = `url('${s.heroBg}') center/cover no-repeat, linear-gradient(135deg, #0a0f1e 0%, #0d1117 50%, #0a1628 100%)`;
    }

    document.getElementById('navLink1').textContent = s.nav1;
    document.getElementById('navLink2').textContent = s.nav2;
    document.getElementById('navLink3').textContent = s.nav3;
    document.getElementById('navLink4').textContent = s.nav4;

    document.getElementById('secPelisTitle').innerHTML = `<i class="fas fa-film"></i> ${s.secPelis}`;
    document.getElementById('secSeriesTitle').innerHTML = `<i class="fas fa-tv"></i> ${s.secSeries}`;
    document.getElementById('secFavTitle').innerHTML = `<i class="fas fa-heart"></i> ${s.secFav}`;
}

function openEditModal() {
    const s = loadSettings();
    document.getElementById('editColor').value = s.primaryColor;
    document.getElementById('editFont').value = s.font;
    document.getElementById('editSiteName').value = s.siteName;
    document.getElementById('editLogoIcon').value = s.logoIcon;
    document.getElementById('editHeroTitle').value = s.heroTitle;
    document.getElementById('editHeroHighlight').value = s.heroHighlight;
    document.getElementById('editHeroDesc').value = s.heroDesc;
    document.getElementById('editHeroBtn').value = s.heroBtn;
    document.getElementById('editHeroBg').value = s.heroBg;
    document.getElementById('editNav1').value = s.nav1;
    document.getElementById('editNav2').value = s.nav2;
    document.getElementById('editNav3').value = s.nav3;
    document.getElementById('editNav4').value = s.nav4;
    document.getElementById('editSecPelis').value = s.secPelis;
    document.getElementById('editSecSeries').value = s.secSeries;
    document.getElementById('editSecFav').value = s.secFav;
    document.getElementById('editFooterText').value = s.footerText;
    document.getElementById('editModal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

document.addEventListener('DOMContentLoaded', () => {
    applySettings();

    document.getElementById('btnEdit').addEventListener('click', openEditModal);
    document.getElementById('closeEditModal').addEventListener('click', () => {
        document.getElementById('editModal').classList.remove('active');
        document.body.style.overflow = 'auto';
    });
    document.getElementById('editModal').addEventListener('click', (e) => {
        if (e.target.id === 'editModal') {
            document.getElementById('editModal').classList.remove('active');
            document.body.style.overflow = 'auto';
        }
    });

    document.getElementById('editForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const s = {
            siteName: document.getElementById('editSiteName').value || defaultSettings.siteName,
            logoIcon: document.getElementById('editLogoIcon').value || defaultSettings.logoIcon,
            primaryColor: document.getElementById('editColor').value,
            font: document.getElementById('editFont').value,
            heroTitle: document.getElementById('editHeroTitle').value || defaultSettings.heroTitle,
            heroHighlight: document.getElementById('editHeroHighlight').value || defaultSettings.heroHighlight,
            heroDesc: document.getElementById('editHeroDesc').value || defaultSettings.heroDesc,
            heroBtn: document.getElementById('editHeroBtn').value || defaultSettings.heroBtn,
            heroBg: document.getElementById('editHeroBg').value,
            nav1: document.getElementById('editNav1').value || defaultSettings.nav1,
            nav2: document.getElementById('editNav2').value || defaultSettings.nav2,
            nav3: document.getElementById('editNav3').value || defaultSettings.nav3,
            nav4: document.getElementById('editNav4').value || defaultSettings.nav4,
            secPelis: document.getElementById('editSecPelis').value || defaultSettings.secPelis,
            secSeries: document.getElementById('editSecSeries').value || defaultSettings.secSeries,
            secFav: document.getElementById('editSecFav').value || defaultSettings.secFav,
            footerText: document.getElementById('editFooterText').value || defaultSettings.footerText,
        };
        saveSettings(s);
        applySettings();
        document.getElementById('editModal').classList.remove('active');
        document.body.style.overflow = 'auto';
    });

    document.getElementById('btnResetEdit').addEventListener('click', () => {
        if (confirm('Restablecer toda la configuracion por defecto?')) {
            localStorage.removeItem('steelFlixSettings');
            applySettings();
            document.getElementById('editModal').classList.remove('active');
            document.body.style.overflow = 'auto';
        }
    });

    // Export
    document.getElementById('btnExport').addEventListener('click', () => {
        const data = {
            customContent: JSON.parse(localStorage.getItem('customBlueFlix')) || [],
            favoritos: JSON.parse(localStorage.getItem('favoritosBlueFlix')) || [],
            settings: JSON.parse(localStorage.getItem('steelFlixSettings')) || null,
            exportDate: new Date().toISOString()
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `steelflix-backup-${new Date().toISOString().slice(0,10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    });

    // Import
    document.getElementById('btnImport').addEventListener('click', () => {
        document.getElementById('importFile').click();
    });

    document.getElementById('importFile').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const data = JSON.parse(ev.target.result);
                if (data.customContent) {
                    localStorage.setItem('customBlueFlix', JSON.stringify(data.customContent));
                }
                if (data.favoritos) {
                    localStorage.setItem('favoritosBlueFlix', JSON.stringify(data.favoritos));
                }
                if (data.settings) {
                    localStorage.setItem('steelFlixSettings', JSON.stringify(data.settings));
                }
                alert('Datos importados correctamente. La pagina se recargara.');
                location.reload();
            } catch (err) {
                alert('Error al leer el archivo. Asegurate de que sea un archivo JSON de SteelFlix.');
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    });
});
