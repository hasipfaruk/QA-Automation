// Small progressive enhancements. Every page works without this script.
document.addEventListener('DOMContentLoaded', () => {
  // Copy buttons
  document.querySelectorAll('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const label = btn.textContent;
      try {
        await navigator.clipboard.writeText(btn.dataset.copy);
        btn.textContent = 'Copied';
      } catch {
        btn.textContent = 'Copy failed';
      }
      setTimeout(() => { btn.textContent = label; }, 1600);
    });
  });

  // Confirm destructive actions
  document.querySelectorAll('form[data-confirm]').forEach((form) => {
    form.addEventListener('submit', (e) => {
      if (!window.confirm(form.dataset.confirm)) e.preventDefault();
    });
  });

  // Live progress for running scans
  const poll = document.querySelector('[data-poll]');
  if (poll) {
    const bar = poll.querySelector('[data-progress-bar]');
    const text = poll.querySelector('[data-progress-text]');
    const tick = async () => {
      try {
        const res = await fetch(poll.dataset.poll, { headers: { accept: 'application/json' }, credentials: 'same-origin' });
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        if (data.status === 'done' || data.status === 'failed') {
          window.location.reload();
          return;
        }
        const { done, total } = data.progress;
        if (bar && total) bar.style.width = `${Math.min(100, Math.round((done / total) * 100))}%`;
        if (text) text.textContent = data.status === 'queued' ? 'Waiting for a free scanner...' : `Tested ${done} of up to ${total} page views`;
      } catch {
        // network hiccup: keep polling
      }
      setTimeout(tick, 2000);
    };
    setTimeout(tick, 1500);
  }
});
