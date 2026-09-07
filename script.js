"use strict";

/* =========================================================
   MANIAC DUREN — SITE INTERACTIONS
========================================================= */

const SELECTORS = {
  menuToggle: ".menu-toggle",
  navMenu: ".nav-menu",
  navLinks: ".nav-menu a",
  branchTabs: ".branch-tab",
  gallery: ".gallery-swiper"
};

/* =========================
   MOBILE MENU
========================= */

const menuToggle = document.querySelector(SELECTORS.menuToggle);
const navMenu = document.querySelector(SELECTORS.navMenu);

function setMenuState(isOpen) {
  if (!menuToggle || !navMenu) return;

  navMenu.classList.toggle("active", isOpen);
  menuToggle.setAttribute("aria-expanded", String(isOpen));
}

if (menuToggle && navMenu) {
  menuToggle.addEventListener("click", () => {
    setMenuState(!navMenu.classList.contains("active"));
  });

  document.querySelectorAll(SELECTORS.navLinks).forEach((link) => {
    link.addEventListener("click", () => setMenuState(false));
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setMenuState(false);
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 900) setMenuState(false);
  });
}

/* =========================
   BRANCH DATA
========================= */

const branches = {
  jababeka: {
    name: "Maniac Duren Cikarang",
    address: "Cikarang, Kabupaten Bekasi, Jawa Barat",
    map: "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3965.64899299478!2d107.17485607570174!3d-6.309759893679511!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x2e699b004552c909%3A0xd66bfe9f65d9050f!2sManiacduren_cikarang!5e0!3m2!1sid!2sid!4v1788804084667!5m2!1sid!2sid",
    link: "https://maps.app.goo.gl/g43DRz5TfeLvbmvRA"
  },
  lippo: {
    name: "Maniac Duren Lippo Cikarang",
    address: "Cikarang, Kabupaten Bekasi, Jawa Barat",
    map: "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3965.4465132177124!2d107.14625387570193!3d-6.33616179365353!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x2e699b77cf6eb591%3A0x38797d3c3e8beebd!2sManiac%20Duren%20Lippo%20CIkarang!5e0!3m2!1sid!2sid!4v1788805757174!5m2!1sid!2sid",
    link: "https://maps.app.goo.gl/yGsXWvqrb73hcGEt7"
  },
  bekasi: {
    name: "Maniac Duren Harapan Indah",
    address: "Pusaka Rakyat, Kabupaten Bekasi, Jawa Barat",
    map: "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3966.718277440453!2d106.97462667570083!3d-6.168466693818844!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x2e698b23f292285d%3A0xe12431e0ac1c573b!2sManiac%20duren%20nusantara!5e0!3m2!1sid!2sid!4v1788805889670!5m2!1sid!2sid",
    link: "https://maps.app.goo.gl/kuHqcwivMLR8pVXz8"
  },
  neo: {
    name: "Depot Durian Neo Patio",
    address: "Cikarang, Kabupaten Bekasi, Jawa Barat",
    map: "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3965.3801705476203!2d107.14861859999999!3d-6.344788599999999!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x2e699bd5094cc5e7%3A0xe35180e85a9c3f3c!2sDepot%20Durian!5e0!3m2!1sid!2sid!4v1788806485087!5m2!1sid!2sid",
    // TODO: ganti dengan link share Google Maps Neo Patio yang final.
    link: "https://maps.google.com/"
  }
};

const branchElements = {
  tabs: document.querySelectorAll(SELECTORS.branchTabs),
  name: document.getElementById("branch-name"),
  address: document.getElementById("branch-address"),
  map: document.getElementById("branch-map"),
  mapsButton: document.getElementById("maps-button")
};

function updateBranch(branchKey) {
  const branch = branches[branchKey];
  if (!branch) return;

  if (branchElements.name) branchElements.name.textContent = branch.name;
  if (branchElements.address) branchElements.address.textContent = branch.address;
  if (branchElements.map) branchElements.map.src = branch.map;
  if (branchElements.mapsButton) branchElements.mapsButton.href = branch.link;

  branchElements.tabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.branch === branchKey);
  });
}

branchElements.tabs.forEach((tab) => {
  tab.addEventListener("click", () => updateBranch(tab.dataset.branch));
});


/* =========================
   TIKTOK VIDEOS
   Cukup ganti 3 link di bawah ini.
========================= */

const tiktokVideos = [
  "https://www.tiktok.com/@manicduren.lc/video/123456789",
  "https://www.tiktok.com/@manicduren.lc/video/987654321",
  "https://www.tiktok.com/@manicduren.lc/video/555555555"
];

function getTikTokVideoId(url) {
  const match = String(url).match(/\/video\/(\d+)/);
  return match ? match[1] : null;
}

function renderTikTokVideos() {
  const feed = document.getElementById("tiktok-feed");
  if (!feed) return;

  const validVideos = tiktokVideos
    .map((url) => ({ url, id: getTikTokVideoId(url) }))
    .filter((video) => video.id)
    .slice(0, 3);

  feed.innerHTML = "";

  if (!validVideos.length) {
    feed.innerHTML = '<p class="tiktok-empty">Masukkan link video TikTok di <code>tiktokVideos</code> pada script.js.</p>';
    return;
  }

  validVideos.forEach((video, index) => {
    const card = document.createElement("article");
    card.className = "social-card tiktok-embed-card";

    const iframe = document.createElement("iframe");
    iframe.className = "tiktok-player";
    iframe.src = `https://www.tiktok.com/player/v1/${video.id}?autoplay=0&loop=0&controls=1&progress_bar=1&play_button=1&volume_control=1&fullscreen_button=1&timestamp=0&music_info=0&description=1&rel=0&native_context_menu=0`;
    iframe.title = `TikTok Maniac Duren ${index + 1}`;
    iframe.loading = "lazy";
    iframe.allow = "fullscreen; autoplay; encrypted-media; picture-in-picture";
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = "strict-origin-when-cross-origin";

    const link = document.createElement("a");
    link.className = "tiktok-open-link";
    link.href = video.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Buka di TikTok ↗";

    card.append(iframe, link);
    feed.appendChild(card);
  });
}

renderTikTokVideos();

/* =========================
   GALLERY COVERFLOW
========================= */

const galleryElement = document.querySelector(SELECTORS.gallery);
let gallerySwiper = null;
let resizeTimer = null;

if (galleryElement && typeof Swiper !== "undefined") {
  gallerySwiper = new Swiper(galleryElement, {
    effect: "coverflow",
    centeredSlides: true,
    grabCursor: true,
    loop: true,
    loopAdditionalSlides: 3,
    speed: 650,
    spaceBetween: 14,
    watchSlidesProgress: true,
    watchOverflow: true,
    roundLengths: true,
    observer: true,
    observeParents: true,
    resizeObserver: true,
    updateOnWindowResize: true,
    initialSlide: 2,

    coverflowEffect: {
      rotate: 28,
      stretch: 0,
      depth: 135,
      modifier: 1,
      slideShadows: true
    },

    pagination: {
      el: ".gallery-swiper .swiper-pagination",
      clickable: true
    },

    breakpoints: {
      0: {
        slidesPerView: 1.28,
        spaceBetween: 10,
        coverflowEffect: {
          rotate: 20,
          stretch: 0,
          depth: 95,
          modifier: 1,
          slideShadows: true
        }
      },
      601: {
        slidesPerView: 2.15,
        spaceBetween: 12,
        coverflowEffect: {
          rotate: 24,
          stretch: 0,
          depth: 115,
          modifier: 1,
          slideShadows: true
        }
      },
      901: {
        // Satu foto aktif + satu foto di kiri + satu foto di kanan.
        slidesPerView: 3,
        spaceBetween: 14,
        coverflowEffect: {
          rotate: 28,
          stretch: 0,
          depth: 135,
          modifier: 1,
          slideShadows: true
        }
      }
    }
  });

  window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      if (!gallerySwiper || gallerySwiper.destroyed) return;
      gallerySwiper.updateSize();
      gallerySwiper.updateSlides();
      gallerySwiper.updateProgress();
      gallerySwiper.updateSlidesClasses();
    }, 120);
  });
}
