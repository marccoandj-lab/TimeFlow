import { initializeApp } from 'firebase/app'
import { getMessaging, onBackgroundMessage } from 'firebase/messaging/sw'

const firebaseConfig = {
  apiKey: self.VITE_FIREBASE_API_KEY || "",
  authDomain: self.VITE_FIREBASE_AUTH_DOMAIN || "",
  projectId: self.VITE_FIREBASE_PROJECT_ID || "",
  storageBucket: self.VITE_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: self.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: self.VITE_FIREBASE_APP_ID || ""
}

const app = initializeApp(firebaseConfig)
const messaging = getMessaging(app)

onBackgroundMessage(messaging, (payload) => {
  const notificationTitle = payload.notification?.title || 'TimeFlow Reminder'
  const notificationOptions = {
    body: payload.notification?.body || 'You have an upcoming task!',
    icon: '/icon-192x192.png',
    badge: '/badge-72x72.png',
    tag: payload.data?.tag || 'timeflow-notification',
    data: payload.data,
    requireInteraction: true,
    actions: [
      { action: 'view', title: 'View' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  }

  self.registration.showNotification(notificationTitle, notificationOptions)
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  
  if (event.action === 'dismiss') {
    return
  }
  
  const urlToOpen = event.notification.data?.url || '/'
  
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus()
          return
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlToOpen)
      }
    })
  )
})