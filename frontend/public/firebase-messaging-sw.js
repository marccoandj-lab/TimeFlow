importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js')

const CACHE_NAME = 'timeflow-v5'
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

console.log('[SW] Service Worker loaded - v5')

self.addEventListener('install', (event) => {
  console.log('[SW] Installing v5...')
  self.skipWaiting()
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching static assets')
      return cache.addAll(STATIC_ASSETS)
    })
  )
})

self.addEventListener('activate', (event) => {
  console.log('[SW] Activating v5...')
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

self.addEventListener('push', (event) => {
  console.log('[SW] Push event received:', event)
  
  let data = {}
  if (event.data) {
    try {
      data = event.data.json()
      console.log('[SW] Push data:', data)
    } catch (e) {
      data = { notification: { title: 'TimeFlow', body: event.data.text() } }
    }
  }
  
  const title = data.notification?.title || data.data?.title || 'TimeFlow'
  const body = data.notification?.body || data.data?.body || 'You have a reminder!'
  
  console.log('[SW] Showing notification:', title, body)
  
  const options = {
    body: body,
    icon: '/icon-192x192.png',
    badge: '/icon-192x192.png',
    tag: data.data?.tag || 'timeflow-push',
    data: data.data || { url: '/' },
    requireInteraction: true,
    vibrate: [200, 100, 200, 100, 200],
    actions: [
      { action: 'open', title: 'Open' },
      { action: 'close', title: 'Dismiss' }
    ]
  }
  
  event.waitUntil(
    self.registration.showNotification(title, options)
      .then(() => console.log('[SW] Notification shown successfully'))
      .catch(err => console.error('[SW] Notification show error:', err))
  )
})

messaging.onBackgroundMessage((payload) => {
  console.log('[SW] Background FCM message:', payload)
  
  const notificationTitle = payload.notification?.title || payload.data?.title || 'TimeFlow'
  const notificationBody = payload.notification?.body || payload.data?.body || 'You have a reminder!'
  
  console.log('[SW] FCM Title:', notificationTitle)
  console.log('[SW] FCM Body:', notificationBody)
  
  const notificationOptions = {
    body: notificationBody,
    icon: '/icon-192x192.png',
    badge: '/icon-192x192.png',
    tag: payload.data?.tag || 'timeflow-fcm',
    data: payload.data || { url: '/' },
    requireInteraction: true,
    vibrate: [200, 100, 200, 100, 200]
  }

  self.registration.showNotification(notificationTitle, notificationOptions)
    .then(() => console.log('[SW] FCM Notification shown'))
    .catch(err => console.error('[SW] FCM Notification error:', err))
})

self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.notification.tag)
  event.notification.close()
  
  const urlToOpen = event.notification.data?.url || '/'
  
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        console.log('[SW] Found clients:', clientList.length)
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            console.log('[SW] Focusing existing client')
            return client.focus()
          }
        }
        if (self.clients.openWindow) {
          console.log('[SW] Opening new window:', urlToOpen)
          return self.clients.openWindow(urlToOpen)
        }
      })
  )
})
