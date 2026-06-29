try {
  const theme = localStorage.getItem("easylaw-theme");
  if (theme === "light" || theme === "dark") {
    document.documentElement.dataset.theme = theme;
  }
} catch {}
