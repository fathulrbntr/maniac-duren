/* =========================================
   MOBILE NAVIGATION
========================================= */

const menuToggle =
  document.querySelector(".menu-toggle");

const navMenu =
  document.querySelector(".nav-menu");


if (menuToggle && navMenu) {

  menuToggle.addEventListener(
    "click",
    () => {

      const isOpen =
        navMenu.classList.toggle("active");

      menuToggle.classList.toggle(
        "active",
        isOpen
      );

      menuToggle.setAttribute(
        "aria-expanded",
        isOpen
      );

    }
  );


  document
    .querySelectorAll(".nav-menu a")
    .forEach((link) => {

      link.addEventListener(
        "click",
        () => {

          navMenu.classList.remove(
            "active"
          );

          menuToggle.classList.remove(
            "active"
          );

          menuToggle.setAttribute(
            "aria-expanded",
            "false"
          );

        }
      );

    });

}



/* =========================================
   NAVBAR SCROLL
========================================= */

const navbar =
  document.querySelector(".navbar");


function updateNavbar() {

  if (!navbar) return;

  navbar.classList.toggle(
    "scrolled",
    window.scrollY > 30
  );

}


window.addEventListener(
  "scroll",
  updateNavbar
);


updateNavbar();



/* =========================================
   BRANCH DATA
========================================= */

const branches = {

  cikarang: {

    name:
      "Maniac Duren Cikarang",

    address:
      "Cikarang, Kabupaten Bekasi, Jawa Barat",

    map:
      "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3965.64899299478!2d107.17485607570174!3d-6.309759893679511!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x2e699b004552c909%3A0xd66bfe9f65d9050f!2sManiacduren_cikarang!5e0!3m2!1sid!2sid!4v1788804084667!5m2!1sid!2sid",

    link:
      "https://maps.google.com/"

  },


  depok: {

    name:
      "Maniac Duren Depok",

    address:
      "Alamat cabang Depok akan segera hadir.",

    map:
      "",

    link:
      "https://maps.google.com/"

  },


  bekasi: {

    name:
      "Maniac Duren Bekasi",

    address:
      "Alamat cabang Bekasi akan segera hadir.",

    map:
      "",

    link:
      "https://maps.google.com/"

  }

};



/* =========================================
   BRANCH SELECTOR
========================================= */

const branchTabs =
  document.querySelectorAll(
    ".branch-tab"
  );

const branchName =
  document.getElementById(
    "branch-name"
  );

const branchAddress =
  document.getElementById(
    "branch-address"
  );

const branchMap =
  document.getElementById(
    "branch-map"
  );

const mapsButton =
  document.getElementById(
    "maps-button"
  );


branchTabs.forEach((tab) => {

  tab.addEventListener(
    "click",
    () => {

      const branchKey =
        tab.dataset.branch;

      const branch =
        branches[branchKey];


      if (!branch) return;


      if (branchName) {

        branchName.textContent =
          branch.name;

      }


      if (branchAddress) {

        branchAddress.textContent =
          branch.address;

      }


      if (
        branchMap &&
        branch.map
      ) {

        branchMap.src =
          branch.map;

      }


      if (mapsButton) {

        mapsButton.href =
          branch.link;

      }


      branchTabs.forEach(
        (item) => {

          item.classList.remove(
            "active"
          );

        }
      );


      tab.classList.add(
        "active"
      );

    }
  );

});