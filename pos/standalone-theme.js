(() => {
  const apply = () => {
    try {
      document.documentElement.dataset.theme =
        localStorage.getItem("maniac-pos-theme") === "dark" ? "dark" : "light";
    } catch {
      document.documentElement.dataset.theme = "light";
    }
  };
  apply();
  window.addEventListener("storage", (event) => {
    if (event.key === "maniac-pos-theme" || event.key === null) apply();
  });
})();
