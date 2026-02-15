import { initializeApp } from 'firebase/app'
import { getMessaging, onBackgroundMessage } from 'firebase/messaging/sw'

const firebaseConfig = {
  apiKey: "AIzaSyBe5OU-FAlkPPUPZFv3T7Due7dSlq1gS2I",
  authDomain: "timeflow-55487.firebaseapp.com",
  projectId: "timeflow-55487",
  storageBucket: "timeflow-55487.firebasestorage.app",
  messagingSenderId: "596272507645",
  appId: "1:596272507645:web:c0a3c6060318c75659ac94"
}

const app = initializeApp(firebaseConfig)
const messaging = getMessaging(app)

onBackgroundMessage(messaging, (payload) => {
  console.log('Background message received:', payload)
  const notificationTitle = payload.notification?.title || 'TimeFlow Reminder'
  const notificationOptions = {
    body: payload.notification?.body || 'You have an upcoming task!',
    icon: '/icon-192x192.png',
    badge: '/icon-192x192.png',
    tag: payload.data?.tag || 'timeflow-notification',
    data: payload.data,
    requireInteraction: true,
    vibrate: [200, 100, 200],
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
