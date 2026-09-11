(() => {
  const root = document.documentElement;
  const preference = window.matchMedia('(prefers-color-scheme: dark)');
  let savedTheme;
  try { savedTheme = localStorage.getItem('photocollect-demo-theme'); } catch (_) {}
  const apply = (theme) => {
    root.dataset.theme = theme;
    document.getElementById('themeToggle')?.setAttribute('aria-pressed', String(theme === 'dark'));
  };
  apply(savedTheme === 'dark' || savedTheme === 'light' ? savedTheme : preference.matches ? 'dark' : 'light');
  document.addEventListener('DOMContentLoaded', () => {
    apply(root.dataset.theme);
    document.getElementById('themeToggle')?.addEventListener('click', () => {
      savedTheme = root.dataset.theme === 'dark' ? 'light' : 'dark';
      apply(savedTheme);
      try { localStorage.setItem('photocollect-demo-theme', savedTheme); } catch (_) {}
    });
  });
  preference.addEventListener('change', (event) => {
    if (!savedTheme) apply(event.matches ? 'dark' : 'light');
  });
})();
