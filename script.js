console.log("Maniac Duren website aktif");


/* =========================
   MOBILE MENU
========================= */

const menuToggle =
  document.querySelector(".menu-toggle");

const navMenu =
  document.querySelector(".nav-menu");

if (menuToggle && navMenu) {

  menuToggle.addEventListener("click", () => {

    const isOpen =
      navMenu.classList.toggle("active");

    menuToggle.setAttribute(
      "aria-expanded",
      String(isOpen)
    );

  });


  document
    .querySelectorAll(".nav-menu a")
    .forEach((link) => {

      link.addEventListener("click", () => {

        navMenu.classList.remove("active");

        menuToggle.setAttribute(
          "aria-expanded",
          "false"
        );

      });

    });

}


/* =========================
   BRANCH DATA
========================= */

const branches = {

  jababeka: {
    name:
      "Maniac Duren Cikarang",

    address:
      "Cikarang, Kabupaten Bekasi, Jawa Barat",

    map:
      "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3965.64899299478!2d107.17485607570174!3d-6.309759893679511!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x2e699b004552c909%3A0xd66bfe9f65d9050f!2sManiacduren_cikarang!5e0!3m2!1sid!2sid!4v1788804084667!5m2!1sid!2sid",

    link:
      "https://maps.app.goo.gl/g43DRz5TfeLvbmvRA"
  },


  lippo: {
    name:
      "Maniac Duren Lippo Cikarang",

    address:
      "Cikarang, Kabupaten Bekasi, Jawa Barat",

    map:
      "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3965.4465132177124!2d107.14625387570193!3d-6.33616179365353!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x2e699b77cf6eb591%3A0x38797d3c3e8beebd!2sManiac%20Duren%20Lippo%20CIkarang!5e0!3m2!1sid!2sid!4v1788805757174!5m2!1sid!2sid",

    link:
      "https://maps.app.goo.gl/yGsXWvqrb73hcGEt7"
  },


  bekasi: {
    name:
      "Maniac Duren Harapan Indah",

    address:
      "Pusaka Rakyat, Kabupaten Bekasi, Jawa Barat",

    map:
      "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3966.718277440453!2d106.97462667570083!3d-6.168466693818844!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x2e698b23f292285d%3A0xe12431e0ac1c573b!2sManiac%20duren%20nusantara!5e0!3m2!1sid!2sid!4v1788805889670!5m2!1sid!2sid",

    link:
      "https://maps.app.goo.gl/kuHqcwivMLR8pVXz8"
  },


  neo: {
    name:
      "Depot Durian Neo Patio",

    address:
      "Cikarang, Kabupaten Bekasi, Jawa Barat",

    map:
      "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3965.3801705476203!2d107.14861859999999!3d-6.344788599999999!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x2e699bd5094cc5e7%3A0xe35180e85a9c3f3c!2sDepot%20Durian!5e0!3m2!1sid!2sid!4v1788806485087!5m2!1sid!2sid",

    /*
      Link Google Maps Neo Patio sebelumnya rusak.
      Isi dengan link share Google Maps yang benar saat sudah tersedia.
    */
    link:
      "https://maps.google.com/"
  }

};


/* =========================
   BRANCH SELECTOR
========================= */

const branchTabs =
  document.querySelectorAll(".branch-tab");

const branchName =
  document.getElementById("branch-name");

const branchAddress =
  document.getElementById("branch-address");

const branchMap =
  document.getElementById("branch-map");

const mapsButton =
  document.getElementById("maps-button");


branchTabs.forEach((tab) => {

  tab.addEventListener("click", () => {

    const branch =
      branches[tab.dataset.branch];

    if (!branch) return;


    if (branchName) {
      branchName.textContent =
        branch.name;
    }


    if (branchAddress) {
      branchAddress.textContent =
        branch.address;
    }


    if (branchMap) {
      branchMap.src =
        branch.map;
    }


    if (mapsButton) {
      mapsButton.href =
        branch.link;
    }


    branchTabs.forEach((item) => {
      item.classList.remove("active");
    });


    tab.classList.add("active");

  });

});
