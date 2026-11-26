(() => {
  const raw = location.hash.slice(1);
  let detail = '';
  if (raw) {
    try {
      detail = decodeURIComponent(raw);
    } catch {
      detail = raw;
    }
  }
  const el = document.getElementById('detail');
  if (el) el.textContent = detail;
})();
