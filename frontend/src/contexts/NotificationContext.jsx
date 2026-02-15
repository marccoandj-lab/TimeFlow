import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { doc, setDoc, collection, addDoc, deleteDoc, query, where, getDocs } from 'firebase/firestore'
import { auth, db } from '../firebase'

const NotificationContext = createContext()

export function useNotifications() {
  return useContext(NotificationContext)
}

const scheduledNotificationsLocal = new Map()

export function NotificationProvider({ children }) {
  const [fcmToken, setFcmToken] = useState(null)
  const [permission, setPermission] = useState('default')
  const [scheduledNotifications, setScheduledNotifications] = useState([])

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPermission(Notification.permission)
    }
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

      console.log(`Scheduling notification for ${task.title} at ${notifyTime.toLocaleTimeString()} (in ${Math.round(delay/1000)}s)`)

      const timeoutId = setTimeout(() => {
        console.log(`Triggering notification: ${task.title}`)
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
      scheduled.push({ id: notificationId, minutes })
    }

    if (auth?.currentUser && db) {
      try {
        for (const { minutes, label } of notificationTimes) {
          const notifyTime = new Date(dueDate.getTime() - minutes * 60 * 1000)
          if (notifyTime <= now) continue
          
          await addDoc(
            collection(db, 'users', auth.currentUser.uid, 'notifications'),
            {
              type: 'task',
              taskId: task.id,
              title: `⏰ ${task.title}`,
              body: `Due ${label}${task.dueTime ? ` at ${task.dueTime}` : ''}`,
              scheduledFor: notifyTime.toISOString(),
              createdAt: now.toISOString(),
              status: 'pending'
            }
          )
        }
      } catch (error) {
        console.error('Error saving to Firestore:', error)
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

    if (auth?.currentUser && db) {
      try {
        await addDoc(
          collection(db, 'users', auth.currentUser.uid, 'notifications'),
          {
            type: 'habit',
            habitId: habit.id,
            title: `🎯 ${habit.name}`,
            body: "Time to complete your habit! Keep your streak going! 🔥",
            scheduledFor: notifyTime.toISOString(),
            createdAt: now.toISOString(),
            status: 'pending'
          }
        )
      } catch (error) {
        console.error('Error saving to Firestore:', error)
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