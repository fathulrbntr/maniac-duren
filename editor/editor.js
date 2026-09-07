const statusEl = document.getElementById("editor-status");

function showStatus(message) {
  statusEl.textContent = message;
  statusEl.classList.add("show");

  window.clearTimeout(showStatus.timer);

  showStatus.timer = window.setTimeout(() => {
    statusEl.classList.remove("show");
  }, 1800);
}

const PROJECT_ROOT = new URL("../", window.location.href);

function absolutizeProjectAssets(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");

  doc.querySelectorAll("[src]").forEach((element) => {
    const value = element.getAttribute("src");

    if (
      value &&
      !value.startsWith("http://") &&
      !value.startsWith("https://") &&
      !value.startsWith("data:") &&
      !value.startsWith("//")
    ) {
      element.setAttribute(
        "src",
        new URL(value, PROJECT_ROOT).href
      );
    }
  });

  doc.querySelectorAll("script").forEach((script) => script.remove());

  return doc.body.innerHTML;
}

function restoreProjectAssetPaths(html) {
  return html
    .replaceAll(PROJECT_ROOT.href + "assets/", "assets/")
    .replaceAll(PROJECT_ROOT.href + "./assets/", "assets/");
}

const editor = grapesjs.init({
  container: "#gjs",

  height: "100%",
  width: "auto",

  fromElement: false,

  storageManager: {
    type: "local",
    autosave: false,
    autoload: false,
    options: {
      local: {
        key: "maniac-duren-grapesjs-project"
      }
    }
  },

  deviceManager: {
    devices: [
      {
        id: "desktop",
        name: "Desktop",
        width: ""
      },
      {
        id: "tablet",
        name: "Tablet",
        width: "800px",
        widthMedia: "900px"
      },
      {
        id: "mobile",
        name: "Mobile",
        width: "390px",
        widthMedia: "600px"
      }
    ]
  },

  selectorManager: {
    componentFirst: true
  },

  blockManager: {
    appendTo: "#blocks"
  },

  layerManager: {
    appendTo: "#layers"
  },

  styleManager: {
    appendTo: "#styles",

    sectors: [
      {
        name: "Layout",
        open: true,
        properties: [
          "display",
          "position",
          "top",
          "right",
          "bottom",
          "left",
          "flex-direction",
          "justify-content",
          "align-items",
          "gap"
        ]
      },

      {
        name: "Size",
        open: true,
        properties: [
          "width",
          "min-width",
          "max-width",
          "height",
          "min-height",
          "max-height"
        ]
      },

      {
        name: "Spacing",
        open: false,
        properties: [
          "margin",
          "padding"
        ]
      },

      {
        name: "Typography",
        open: false,
        properties: [
          "font-family",
          "font-size",
          "font-weight",
          "letter-spacing",
          "line-height",
          "text-align",
          "color"
        ]
      },

      {
        name: "Background",
        open: false,
        properties: [
          "background",
          "background-color"
        ]
      },

      {
        name: "Borders",
        open: false,
        properties: [
          "border",
          "border-radius"
        ]
      },

      {
        name: "Effects",
        open: false,
        properties: [
          "opacity",
          "box-shadow",
          "transform"
        ]
      }
    ]
  },

  traitManager: {
    appendTo: "#traits"
  },

  panels: {
    defaults: []
  }
});


/* =========================
   USEFUL BLOCKS
========================= */

editor.BlockManager.add("md-section", {
  label: "Section",
  category: "Layout",
  content: `
    <section class="section">
      <div style="padding:40px;">
        <h2>New Section</h2>
        <p>Tambahkan konten di sini.</p>
      </div>
    </section>
  `
});

editor.BlockManager.add("md-heading", {
  label: "Heading",
  category: "Content",
  content: "<h2>Judul Baru</h2>"
});

editor.BlockManager.add("md-text", {
  label: "Text",
  category: "Content",
  content: "<p>Tulis konten di sini.</p>"
});

editor.BlockManager.add("md-image", {
  label: "Image",
  category: "Content",
  content: {
    type: "image",
    attributes: {
      alt: "Maniac Duren"
    }
  }
});

editor.BlockManager.add("md-button", {
  label: "Button",
  category: "Content",
  content: `
    <a href="#" class="button button-primary">
      Button
    </a>
  `
});


/* =========================
   LOAD WEBSITE FILES
========================= */

async function loadOriginalProject() {
  try {
    showStatus("Loading project...");

    const [htmlResponse, cssResponse] = await Promise.all([
      fetch(new URL("index.html", PROJECT_ROOT)),
      fetch(new URL("style.css", PROJECT_ROOT))
    ]);

    if (!htmlResponse.ok || !cssResponse.ok) {
      throw new Error("Project files could not be loaded.");
    }

    const htmlText = await htmlResponse.text();
    const cssText = await cssResponse.text();

    editor.setComponents(
      absolutizeProjectAssets(htmlText)
    );

    editor.setStyle(cssText);

    editor.setDevice("Desktop");

    showStatus("Project loaded");
  } catch (error) {
    console.error(error);

    showStatus(
      "Gagal load. Jalankan lewat Live Server / localhost."
    );
  }
}


/* =========================
   DEVICE BUTTONS
========================= */

document
  .querySelectorAll("[data-device]")
  .forEach((button) => {

    button.addEventListener("click", () => {

      const device = button.dataset.device;

      editor.setDevice(device);

      document
        .querySelectorAll("[data-device]")
        .forEach((item) => {
          item.classList.toggle(
            "active",
            item === button
          );
        });

      showStatus(device + " preview");

    });

  });


/* =========================
   SAVE LOCAL DRAFT
========================= */

document
  .getElementById("save-local")
  .addEventListener("click", async () => {

    await editor.store();

    showStatus("Draft tersimpan di browser");

  });


/* =========================
   RELOAD ORIGINAL
========================= */

document
  .getElementById("reload-original")
  .addEventListener("click", async () => {

    const confirmed = window.confirm(
      "Reload index.html dan style.css asli? Perubahan yang belum diexport akan diganti."
    );

    if (!confirmed) return;

    await loadOriginalProject();

  });


/* =========================
   EXPORT
========================= */

function downloadFile(filename, content, mime) {
  const blob = new Blob(
    [content],
    {
      type: mime
    }
  );

  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");

  link.href = url;
  link.download = filename;

  document.body.appendChild(link);

  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}

document
  .getElementById("export-project")
  .addEventListener("click", () => {

    const editedBody =
      restoreProjectAssetPaths(
        editor.getHtml()
      );

    const editedCss =
      editor.getCss();

    const originalHead = `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Maniac Duren</title>
  <meta name="description" content="Maniac Duren - Surganya Durian Monthong">
  <link rel="stylesheet" href="style.css">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.css">
</head>
<body>
`;

    const originalScripts = `
  <script src="https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.js"><\/script>
  <script src="script.js"><\/script>
</body>
</html>
`;

    const finalHtml =
      originalHead +
      editedBody +
      originalScripts;

    downloadFile(
      "index-edited.html",
      finalHtml,
      "text/html"
    );

    window.setTimeout(() => {
      downloadFile(
        "style-edited.css",
        editedCss,
        "text/css"
      );
    }, 250);

    showStatus(
      "HTML + CSS berhasil diexport"
    );

  });


/* =========================
   AUTO LOAD
========================= */

(async function startEditor() {

  const stored =
    localStorage.getItem(
      "maniac-duren-grapesjs-project"
    );

  if (stored) {

    const useDraft = window.confirm(
      "Draft editor ditemukan. Buka draft terakhir?\n\nOK = Draft\nCancel = File project asli"
    );

    if (useDraft) {
      try {
        await editor.load();
        showStatus("Draft loaded");
        return;
      } catch (error) {
        console.error(error);
      }
    }

  }

  await loadOriginalProject();

})();
