const CACHE_NAME = "service-register-v17";
const ASSETS = ["./", "./index.html", "./manifest.json", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});

// Tapping the reminder notification opens (or focuses) the app instead of
// just dismissing. The "✅ Logged it" action is an honest quick-dismiss only
// — a service worker has no access to the page's storage, so it can't
// actually save anything on your behalf; it just closes the notification.
// "Open & log now" (or tapping the notification body itself) opens the app
// straight to today's Daily Log so you can mark it there for real.
self.addEventListener("notificationclick", (event) => {
  const action = event.action;
  event.notification.close();
  if(action === 'log-yes') return; // acknowledged, nothing more to do
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) {
          c.postMessage({ type: 'open-daily-log' });
          return c.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow("./?page=daily");
    })
  );
});

// Best-effort daily reminder check. Chrome's Periodic Background Sync only
// fires while the app has been used somewhat recently and at a browser-chosen
// interval (never more often than roughly every 12 hours, no exact-time
// guarantee) — it is NOT a precise alarm. The main, reliable reminder path is
// the in-page timer in index.html, which works whenever the app itself is
// open. This is a bonus best-effort top-up for when it isn't.
self.addEventListener("periodicsync", (event) => {
  if (event.tag === "daily-reminder-check") {
    event.waitUntil(checkReminderAndNotify());
  }
});

async function checkReminderAndNotify(){
  try{
    const cache = await caches.open(CACHE_NAME);
    const res = await cache.match("./index.html");
    if(!res) return;
    // Reminder time/state is read from localStorage by the page itself when
    // open; a service worker cannot read localStorage directly, so this
    // best-effort path simply nudges with a generic reminder if it has been
    // a while, relying on the in-page timer for the precise, personalized one.
    const reg = self.registration;
    const now = new Date();
    await reg.showNotification("Service Register", {
      body: "Haven't opened your tracker today? Log a few minutes of progress.",
      icon: "./icon-192.png",
      badge: "./icon-192.png",
      tag: "daily-reminder-fallback"
    });
  }catch(e){ /* silently skip — this is a best-effort bonus path */ }
}
