import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { getToken, onMessage, deleteToken } from 'firebase/messaging'
import { doc, setDoc, getDoc, collection, addDoc, deleteDoc, query, where, onSnapshot, orderBy } from 'firebase/firestore'
import { auth, db, messaging } from '../firebase'

const NotificationContext = createContext()

export function useNotifications() {
  return useContext(NotificationContext)
}

export function NotificationProvider({ children }) {
  const [fcmToken, setFcmToken] = useState(null)
  const [permission, setPermission] = useState('default')
  const [scheduledNotifications, setScheduledNotifications] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if ('Notification' in window) {
      setPermission(Notification.permission)
    }
  }, [])

  useEffect(() => {
    if (!auth.currentUser) return

    const q = query(
      collection(db, 'users', auth.currentUser.uid, 'notifications'),
      orderBy('scheduledFor', 'asc')
    )

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notifications = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
      setScheduledNotifications(notifications)
    })

    return unsubscribe
  }, [auth.currentUser])

  const requestPermission = async () => {
    if (!('Notification' in window)) {
      console.log('Notifications not supported')
      return false
    }

    try {
      const result = await Notification.requestPermission()
      setPermission(result)
      return result === 'granted'
    } catch (error) {
      console.error('Error requesting permission:', error)
      return false
    }
  }

  const getFCMToken = async () => {
    if (!messaging) {
      console.log('Messaging not supported')
      return null
    }

    try {
      const currentToken = await getToken(messaging, {
        vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY
      })

      if (currentToken) {
        setFcmToken(currentToken)
        
        if (auth.currentUser) {
          await setDoc(doc(db, 'users', auth.currentUser.uid), {
            fcmToken: currentToken,
            notificationEnabled: true
          }, { merge: true })
        }
        
        return currentToken
      }
    } catch (error) {
      console.error('Error getting FCM token:', error)
    }
    
    return null
  }

  const disableNotifications = async () => {
    if (messaging && fcmToken) {
      try {
        await deleteToken(messaging)
        setFcmToken(null)
        
        if (auth.currentUser) {
          await setDoc(doc(db, 'users', auth.currentUser.uid), {
            fcmToken: null,
            notificationEnabled: false
          }, { merge: true })
        }
      } catch (error) {
        console.error('Error disabling notifications:', error)
      }
    }
  }

  const scheduleTaskNotification = async (task) => {
    if (!auth.currentUser || !task.dueDate) return null

    const dueDate = new Date(task.dueDate + (task.dueTime ? `T${task.dueTime}` : 'T09:00'))
    const now = new Date()

    const notificationTimes = [
      { minutes: 60, label: '1 hour before' },
      { minutes: 30, label: '30 minutes before' },
      { minutes: 15, label: '15 minutes before' },
    ]

    const scheduledNotifications = []

    for (const { minutes, label } of notificationTimes) {
      const notifyTime = new Date(dueDate.getTime() - minutes * 60 * 1000)
      
      if (notifyTime <= now) continue

      const notificationData = {
        type: 'task',
        taskId: task.id,
        title: `⏰ ${task.title}`,
        body: `Due ${label}${task.dueTime ? ` at ${task.dueTime}` : ''}`,
        scheduledFor: notifyTime.toISOString(),
        createdAt: now.toISOString(),
        status: 'pending'
      }

      const docRef = await addDoc(
        collection(db, 'users', auth.currentUser.uid, 'notifications'),
        notificationData
      )

      scheduledNotifications.push({ id: docRef.id, ...notificationData })

      if ('serviceWorker' in navigator && 'sync' in navigator.serviceWorker) {
        const swRegistration = await navigator.serviceWorker.ready
        await swRegistration.sync.register(`notification-${docRef.id}`)
      }
    }

    return scheduledNotifications
  }

  const scheduleHabitNotification = async (habit) => {
    if (!auth.currentUser) return null

    const now = new Date()
    const today = now.toISOString().split('T')[0]
    const reminderTime = habit.reminderTime || '09:00'
    const notifyTime = new Date(`${today}T${reminderTime}`)

    if (notifyTime <= now) {
      notifyTime.setDate(notifyTime.getDate() + 1)
    }

    const notificationData = {
      type: 'habit',
      habitId: habit.id,
      title: `🎯 ${habit.name}`,
      body: "Time to complete your habit! Keep your streak going! 🔥",
      scheduledFor: notifyTime.toISOString(),
      createdAt: now.toISOString(),
      status: 'pending'
    }

    const docRef = await addDoc(
      collection(db, 'users', auth.currentUser.uid, 'notifications'),
      notificationData
    )

    return { id: docRef.id, ...notificationData }
  }

  const cancelNotification = async (notificationId) => {
    if (!auth.currentUser) return

    try {
      await deleteDoc(doc(db, 'users', auth.currentUser.uid, 'notifications', notificationId))
    } catch (error) {
      console.error('Error canceling notification:', error)
    }
  }

  const cancelTaskNotifications = async (taskId) => {
    if (!auth.currentUser) return

    const q = query(
      collection(db, 'users', auth.currentUser.uid, 'notifications'),
      where('taskId', '==', taskId)
    )

    const snapshot = await getDocs(q)
    const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref))
    await Promise.all(deletePromises)
  }

  const initializeNotifications = async () => {
    setLoading(true)
    
    if (permission === 'granted') {
      await getFCMToken()
    }

    if (messaging) {
      onMessage(messaging, (payload) => {
        console.log('Foreground message:', payload)
        
        if (Notification.permission === 'granted') {
          new Notification(payload.notification?.title || 'TimeFlow', {
            body: payload.notification?.body || '',
            icon: '/icon-192x192.png',
            badge: '/badge-72x72.png',
            tag: payload.data?.tag
          })
        }
      })
    }

    setLoading(false)
  }

  useEffect(() => {
    if (auth.currentUser && permission === 'granted') {
      initializeNotifications()
    } else {
      setLoading(false)
    }
  }, [auth.currentUser, permission])

  const value = {
    fcmToken,
    permission,
    loading,
    scheduledNotifications,
    requestPermission,
    getFCMToken,
    disableNotifications,
    scheduleTaskNotification,
    scheduleHabitNotification,
    cancelNotification,
    cancelTaskNotifications,
    initializeNotifications
  }

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  )
}