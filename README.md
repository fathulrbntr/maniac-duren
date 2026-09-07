# Maniac Duren — Clean Stable Build

Files:
- index.html
- style.css
- script.js

Carousel stability changes:
- Swiper `slidesPerView: "auto"` removed.
- Desktop uses exactly 3 visible slides: 1 left + 1 active + 1 right.
- Gallery frame is capped at 980px.
- Infinite loop remains enabled.
- Resize uses a lightweight geometry refresh instead of destroy/re-init.
- Mobile/tablet have explicit breakpoints.

Keep your existing `assets/` folder unchanged.
