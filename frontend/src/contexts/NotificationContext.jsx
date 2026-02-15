import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { doc, setDoc, collection, addDoc, deleteDoc, query, where, getDocs } from 'firebase/firestore'
import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging'
import { auth, db, app } from '../firebase'

const NotificationContext = createContext()

export function useNotifications() {
  return useContext(NotificationContext)
}

const scheduledNotificationsLocal = new Map()
const API_BASE = '/api'

export function NotificationProvider({ children }) {
  const [fcmToken, setFcmToken] = useState(null)
  const [permission, setPermission] = useState('default')
  const [scheduledNotifications, setScheduledNotifications] = useState([])
  const [messaging, setMessaging] = useState(null)

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPermission(Notification.permission)
    }
    
    const initMessaging = async () => {
      try {
        if (app && await isSupported()) {
          const msg = getMessaging(app)
          setMessaging(msg)
          
          onMessage(msg, (payload) => {
            console.log('Foreground message:', payload)
            if (Notification.permission === 'granted') {
              new Notification(payload.notification.title, {
                body: payload.notification.body,
                icon: '/icon-192x192.png'
              })
            }
          })
        }
      } catch (error) {
        console.log('Messaging not supported:', error)
      }
    }
    initMessaging()
  }, [])

  const requestPermission = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return false
    }

    try {
      const result = await Notification.requestPermission()
      setPermission(result)
      
      if (result === 'granted') {
        new Notification('✅ TimeFlow Notifications Enabled', {
          body: 'You will receive reminders for your tasks and habits!',
          icon: '/icon-192x192.png'
        })
        
        if (messaging && auth?.currentUser) {
          try {
            const token = await getToken(messaging, {
              vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY
            })
            if (token) {
              setFcmToken(token)
              await fetch(`${API_BASE}/notifications/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: auth.currentUser.uid, fcmToken: token })
              })
            }
          } catch (e) {
            console.log('FCM token error:', e)
          }
        }
      }
      return result === 'granted'
    } catch (error) {
      console.error('Error requesting permission:', error)
      return false
    }
  }

  const scheduleTaskNotification = async (task) => {
    if (!task.dueDate) return null

    if (Notification.permission !== 'granted') {
      const granted = await requestPermission()
      if (!granted) return null
    }

    const dueDate = new Date(task.dueDate + (task.dueTime ? `T${task.dueTime}` : 'T09:00'))
    const now = new Date()

    const notificationTimes = [
      { minutes: 60, label: '1 hour before' },
      { minutes: 30, label: '30 minutes before' },
      { minutes: 15, label: '15 minutes before' },
      { minutes: 5, label: '5 minutes before' },
      { minutes: 1, label: '1 minute before' },
    ]

    const scheduled = []

    for (const { minutes, label } of notificationTimes) {
      const notifyTime = new Date(dueDate.getTime() - minutes * 60 * 1000)
      if (notifyTime <= now) continue

      const notificationId = `${task.id}-${minutes}`
      const delay = notifyTime.getTime() - now.getTime()

      if (delay < 2147483647) {
        const timeoutId = setTimeout(() => {
          if (Notification.permission === 'granted') {
            try {
              new Notification(`⏰ ${task.title}`, {
                body: `Due ${label}${task.dueTime ? ` at ${task.dueTime}` : ''}`,
                icon: '/icon-192x192.png',
                tag: notificationId,
                requireInteraction: true
              })
            } catch (e) {
              console.error('Notification error:', e)
            }
          }
        }, delay)
        scheduledNotificationsLocal.set(notificationId, timeoutId)
      }
      scheduled.push({ id: notificationId, minutes })
    }

    if (auth?.currentUser) {
      try {
        for (const { minutes, label } of notificationTimes) {
          const notifyTime = new Date(dueDate.getTime() - minutes * 60 * 1000)
          if (notifyTime <= now) continue
          
          await fetch(`${API_BASE}/notifications/schedule`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: auth.currentUser.uid,
              title: `⏰ ${task.title}`,
              body: `Due ${label}${task.dueTime ? ` at ${task.dueTime}` : ''}`,
              scheduledFor: notifyTime.toISOString(),
              type: 'task',
              relatedId: task.id
            })
          })
        }
      } catch (error) {
        console.error('Error scheduling via backend:', error)
      }
    }

    return scheduled
  }

  const scheduleHabitNotification = async (habit) => {
    if (Notification.permission !== 'granted') {
      const granted = await requestPermission()
      if (!granted) return null
    }

    const now = new Date()
    const today = now.toISOString().split('T')[0]
    const reminderTime = habit.reminderTime || '09:00'
    const notifyTime = new Date(`${today}T${reminderTime}`)

    if (notifyTime <= now) {
      notifyTime.setDate(notifyTime.getDate() + 1)
    }

    const delay = notifyTime.getTime() - now.getTime()
    const notificationId = `habit-${habit.id}`

    if (delay < 2147483647) {
      const timeoutId = setTimeout(() => {
        if (Notification.permission === 'granted') {
          new Notification(`🎯 ${habit.name}`, {
            body: "Time to complete your habit! Keep your streak going! 🔥",
            icon: '/icon-192x192.png',
            tag: notificationId
          })
        }
      }, delay)
      scheduledNotificationsLocal.set(notificationId, timeoutId)
    }

    if (auth?.currentUser) {
      try {
        await fetch(`${API_BASE}/notifications/schedule`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: auth.currentUser.uid,
            title: `🎯 ${habit.name}`,
            body: "Time to complete your habit! Keep your streak going! 🔥",
            scheduledFor: notifyTime.toISOString(),
            type: 'habit',
            relatedId: habit.id
          })
        })
      } catch (error) {
        console.error('Error scheduling via backend:', error)
      }
    }

    return { id: notificationId }
  }

  const cancelNotification = async (notificationId) => {
    if (!auth?.currentUser || !db) return

    try {
      await deleteDoc(doc(db, 'users', auth.currentUser.uid, 'notifications', notificationId))
    } catch (error) {
      console.error('Error canceling notification:', error)
    }
  }

  const cancelTaskNotifications = async (taskId) => {
    const notificationTimes = [60, 30, 15, 5, 1]
    for (const minutes of notificationTimes) {
      const notificationId = `${taskId}-${minutes}`
      const timeoutId = scheduledNotificationsLocal.get(notificationId)
      if (timeoutId) {
        clearTimeout(timeoutId)
        scheduledNotificationsLocal.delete(notificationId)
      }
    }

    if (auth?.currentUser && db) {
      try {
        const q = query(
          collection(db, 'users', auth.currentUser.uid, 'notifications'),
          where('taskId', '==', taskId)
        )
        const snapshot = await getDocs(q)
        const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref))
        await Promise.all(deletePromises)
      } catch (error) {
        console.error('Error canceling task notifications:', error)
      }
    }
  }

  const value = {
    permission,
    scheduledNotifications,
    requestPermission,
    scheduleTaskNotification,
    scheduleHabitNotification,
    cancelNotification,
    cancelTaskNotifications
  }

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  )
}