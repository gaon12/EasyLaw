try {
  const theme = localStorage.getItem("easylaw-theme");
  if (theme === "light" || theme === "dark") {
    document.documentElement.dataset.theme = theme;
  }
  const textSize = localStorage.getItem("easylaw_text_size");
  if (textSize === "normal" || textSize === "large" || textSize === "larger") {
    document.documentElement.dataset.textSize = textSize;
  }
} catch {}
