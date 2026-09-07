console.log("Maniac Duren website aktif");

/* =========================
   MANIAC DUREN BRANCHES
========================= */

/* =========================
   MANIAC DUREN BRANCHES
========================= */

const branches = {

  jababeka: {
    name: "Maniac Duren Cikarang",

    address:
      "Cikarang, Kabupaten Bekasi, Jawa Barat",

    map:
      "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3965.64899299478!2d107.17485607570174!3d-6.309759893679511!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x2e699b004552c909%3A0xd66bfe9f65d9050f!2sManiacduren_cikarang!5e0!3m2!1sid!2sid!4v1788804084667!5m2!1sid!2sid",

    link:
      "https://maps.google.com/"
  },


  lippo: {
    name: "Maniac Duren Depok",

    address:
      "Masukkan alamat cabang Depok",

    map:
        "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3965.64899299478!2d107.17485607570174!3d-6.309759893679511!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x2e699b004552c909%3A0xd66bfe9f65d9050f!2sManiacduren_cikarang!5e0!3m2!1sid!2sid!4v1788804084667!5m2!1sid!2sid",
    link:
      "MASUKKAN_LINK_MAP_DEPOK"
  },


  bekasi: {
    name: "Maniac Duren Bekasi",

    address:
      "Masukkan alamat cabang Bekasi",

    map:
      "MASUKKAN_EMBED_MAP_BEKASI",

    link:
      "MASUKKAN_LINK_MAP_BEKASI"
  }

};


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

    branchName.textContent =
      branch.name;

    branchAddress.textContent =
      branch.address;

    branchMap.src =
      branch.map;

    mapsButton.href =
      branch.link;


    branchTabs.forEach((item) => {
      item.classList.remove("active");
    });

    tab.classList.add("active");

  });

});