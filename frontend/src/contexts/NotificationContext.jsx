import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging'
import { auth, app } from '../firebase'

const NotificationContext = createContext()

export function useNotifications() {
  return useContext(NotificationContext)
}

const scheduledNotificationsLocal = new Map()
const API_BASE = '/api'

export function NotificationProvider({ children }) {
  const [fcmToken, setFcmToken] = useState(null)
  const [permission, setPermission] = useState('default')
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
            if (Notification.permission === 'granted' && payload.notification) {
              new Notification(payload.notification.title, {
                body: payload.notification.body,
                icon: '/icon-192x192.png',
                tag: payload.data?.tag || 'timeflow',
                requireInteraction: true
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

  useEffect(() => {
    if (auth?.currentUser && permission === 'granted' && messaging) {
      registerFCMToken()
    }
  }, [auth?.currentUser, permission, messaging])

  useEffect(() => {
    if (fcmToken && auth?.currentUser) {
      console.log('FCM token available, ensuring registered with backend')
    }
  }, [fcmToken])

  const registerFCMToken = async () => {
    if (!messaging || !auth?.currentUser) return
    
    try {
      const token = await getToken(messaging, {
        vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY
      })
      
      if (token) {
        setFcmToken(token)
        await fetch(`${API_BASE}/notifications/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            userId: auth.currentUser.uid, 
            fcmToken: token 
          })
        })
        console.log('FCM token registered:', token.substring(0, 20) + '...')
      }
    } catch (e) {
      console.error('FCM token registration error:', e)
    }
  }

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
        
        await registerFCMToken()
      }
      return result === 'granted'
    } catch (error) {
      console.error('Error requesting permission:', error)
      return false
    }
  }

  const scheduleTaskNotification = async (task) => {
    if (!task.dueDate) {
      console.log('No due date for task')
      return null
    }

    if (Notification.permission !== 'granted') {
      const granted = await requestPermission()
      if (!granted) {
        console.log('Notification permission not granted')
        return null
      }
    }

    if (!fcmToken) {
      console.warn('No FCM token - notifications may not work when app is closed')
      await registerFCMToken()
    }

    const dueDate = new Date(task.dueDate + 'T' + (task.dueTime || '09:00'))
    const now = new Date()

    console.log('Scheduling notifications for task:', task.title)
    console.log('Due date:', dueDate.toISOString())

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
      
      if (notifyTime <= now) {
        console.log(`Skipping ${label} - already passed`)
        continue
      }

      const notificationId = `${task.id}-${minutes}`
      const delay = notifyTime.getTime() - now.getTime()

      console.log(`Scheduling ${label} notification at ${notifyTime.toLocaleTimeString()} (in ${Math.round(delay/1000)}s)`)

      if (delay < 2147483647) {
        const timeoutId = setTimeout(() => {
          console.log(`Triggering local notification: ${task.title} - ${label}`)
          if (Notification.permission === 'granted') {
            try {
              new Notification(`⏰ ${task.title}`, {
                body: `Due ${label}${task.dueTime ? ` at ${task.dueTime}` : ''}`,
                icon: '/icon-192x192.png',
                tag: notificationId,
                requireInteraction: true
              })
            } catch (e) {
              console.error('Local notification error:', e)
            }
          }
        }, delay)
        scheduledNotificationsLocal.set(notificationId, timeoutId)
      }
      scheduled.push({ id: notificationId, minutes })
    }

    if (auth?.currentUser && fcmToken) {
      try {
        for (const { minutes, label } of notificationTimes) {
          const notifyTime = new Date(dueDate.getTime() - minutes * 60 * 1000)
          if (notifyTime <= now) continue
          
          const response = await fetch(`${API_BASE}/notifications/schedule`, {
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
          
          if (response.ok) {
            console.log(`Scheduled FCM push notification for ${label}`)
          }
        }
      } catch (error) {
        console.error('Error scheduling FCM notification:', error)
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

    console.log(`Scheduling habit notification for ${habit.name} at ${notifyTime.toLocaleTimeString()}`)

    if (delay < 2147483647) {
      const timeoutId = setTimeout(() => {
        if (Notification.permission === 'granted') {
          new Notification(`🎯 ${habit.name}`, {
            body: "Time to complete your habit! Keep your streak going! 🔥",
            icon: '/icon-192x192.png',
            tag: notificationId,
            requireInteraction: true
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
    const timeoutId = scheduledNotificationsLocal.get(notificationId)
    if (timeoutId) {
      clearTimeout(timeoutId)
      scheduledNotificationsLocal.delete(notificationId)
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

    if (auth?.currentUser) {
      try {
        await fetch(`${API_BASE}/notifications/${auth.currentUser.uid}/task/${taskId}`, {
          method: 'DELETE'
        })
      } catch (error) {
        console.error('Error canceling task notifications:', error)
      }
    }
  }

  const value = {
    permission,
    fcmToken,
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
