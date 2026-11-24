// Capture Chrome's one-use install event before the app's module graph loads.
(() => {
  const state = window.OrbitInstallPrompt = {event: null, installed: false};
  addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    state.event = event;
    dispatchEvent(new Event('orbit-install-change'));
  });
  addEventListener('appinstalled', () => {
    state.event = null;
    state.installed = true;
    dispatchEvent(new Event('orbit-install-change'));
  });
})();
