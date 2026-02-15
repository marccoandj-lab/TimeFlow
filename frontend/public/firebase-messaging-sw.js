importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js')

const CACHE_NAME = 'timeflow-v3'
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192x192.png',
  '/icon-512x512.png'
]

const firebaseConfig = {
  apiKey: "AIzaSyBe5OU-FAlkPPUPZFv3T7Due7dSlq1gS2I",
  authDomain: "timeflow-55487.firebaseapp.com",
  projectId: "timeflow-55487",
  storageBucket: "timeflow-55487.firebasestorage.app",
  messagingSenderId: "596272507645",
  appId: "1:596272507645:web:c0a3c6060318c75659ac94"
}

firebase.initializeApp(firebaseConfig)
const messaging = firebase.messaging()

console.log('[SW] Service Worker loaded - v3')

self.addEventListener('install', (event) => {
  console.log('[SW] Installing...')
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching static assets')
      return cache.addAll(STATIC_ASSETS)
    })
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...')
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => {
          console.log('[SW] Deleting old cache:', key)
          return caches.delete(key)
        })
      )
    })
  )
  self.clients.claim()
  console.log('[SW] Activated and claimed clients')
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  
  const url = new URL(event.request.url)
  
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const responseClone = response.clone()
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone)
          })
          return response
        })
        .catch(() => caches.match(event.request))
    )
    return
  }
  
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request)
        .then((response) => {
          if (response.status === 200) {
            const responseClone = response.clone()
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone)
            })
          }
          return response
        })
        .catch(() => cached)
      
      return cached || fetchPromise
    })
  )
})

messaging.onBackgroundMessage((payload) => {
  console.log('[SW] Background FCM message:', payload)
  
  const notificationTitle = payload.notification?.title || 'TimeFlow'
  const notificationOptions = {
    body: payload.notification?.body || 'You have a reminder!',
    icon: '/icon-192x192.png',
    badge: '/icon-192x192.png',
    tag: payload.data?.tag || 'timeflow-bg',
    data: payload.data || {},
    requireInteraction: true,
    vibrate: [200, 100, 200]
  }

  self.registration.showNotification(notificationTitle, notificationOptions)
  console.log('[SW] Notification shown from background message')
})

self.addEventListener('push', (event) => {
  console.log('[SW] Push event received')
  
  if (!event.data) {
    console.log('[SW] Push has no data')
    return
  }
  
  let data
  try {
    data = event.data.json()
    console.log('[SW] Push data:', JSON.stringify(data))
  } catch (e) {
    console.log('[SW] Push data parse error:', e)
    data = { notification: { title: 'TimeFlow', body: event.data.text() } }
  }
  
  const notificationTitle = data.notification?.title || 'TimeFlow'
  const notificationOptions = {
    body: data.notification?.body || '',
    icon: '/icon-192x192.png',
    badge: '/icon-192x192.png',
    tag: data.data?.tag || 'timeflow-push',
    data: data.data || {},
    requireInteraction: true,
    vibrate: [200, 100, 200]
  }
  
  event.waitUntil(
    self.registration.showNotification(notificationTitle, notificationOptions)
      .then(() => console.log('[SW] Push notification shown'))
      .catch(e => console.error('[SW] Push notification error:', e))
  )
})

self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked')
  event.notification.close()
  
  const urlToOpen = event.notification.data?.url || '/'
  
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            return client.focus()
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(urlToOpen)
        }
      })
  )
})
