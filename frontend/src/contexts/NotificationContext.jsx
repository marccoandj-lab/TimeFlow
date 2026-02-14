import { createContext, useContext, useState, useEffect } from 'react'
import { getToken, onMessage, deleteToken, isSupported } from 'firebase/messaging'
import { doc, setDoc, collection, addDoc, deleteDoc, query, where, getDocs, onSnapshot, orderBy } from 'firebase/firestore'
import { auth, db } from '../firebase'

const NotificationContext = createContext()

export function useNotifications() {
  return useContext(NotificationContext)
}

export function NotificationProvider({ children }) {
  const [fcmToken, setFcmToken] = useState(null)
  const [permission, setPermission] = useState('default')
  const [scheduledNotifications, setScheduledNotifications] = useState([])
  const [messagingInstance, setMessagingInstance] = useState(null)

  useEffect(() => {
    if ('Notification' in window) {
      setPermission(Notification.permission)
    }
    
    isSupported().then(supported => {
      if (supported) {
        import('firebase/messaging').then(({ getMessaging }) => {
          setMessagingInstance(getMessaging())
        })
      }
    })
  }, [])

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (!user) {
        setScheduledNotifications([])
        return
      }

      const q = query(
        collection(db, 'users', user.uid, 'notifications'),
        orderBy('scheduledFor', 'asc')
      )

      const unsub = onSnapshot(q, (snapshot) => {
        const notifications = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
        setScheduledNotifications(notifications)
      }, (error) => {
        console.log('Notifications listener error:', error.message)
      })

      return unsub
    })

    return () => unsubscribe()
  }, [])

  const requestPermission = async () => {
    if (!('Notification' in window)) {
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
    if (!messagingInstance) {
      return null
    }

    try {
      const currentToken = await getToken(messagingInstance, {
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
    if (messagingInstance && fcmToken) {
      try {
        await deleteToken(messagingInstance)
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

    try {
      const dueDate = new Date(task.dueDate + (task.dueTime ? `T${task.dueTime}` : 'T09:00'))
      const now = new Date()

      const notificationTimes = [
        { minutes: 60, label: '1 hour before' },
        { minutes: 30, label: '30 minutes before' },
        { minutes: 15, label: '15 minutes before' },
      ]

      const scheduled = []

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

        scheduled.push({ id: docRef.id, ...notificationData })
      }

      return scheduled
    } catch (error) {
      console.error('Error scheduling task notification:', error)
      return null
    }
  }

  const scheduleHabitNotification = async (habit) => {
    if (!auth.currentUser) return null

    try {
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
    } catch (error) {
      console.error('Error scheduling habit notification:', error)
      return null
    }
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

  useEffect(() => {
    if (messagingInstance && auth.currentUser && permission === 'granted') {
      getFCMToken()
      
      const unsub = onMessage(messagingInstance, (payload) => {
        if (Notification.permission === 'granted') {
          new Notification(payload.notification?.title || 'TimeFlow', {
            body: payload.notification?.body || '',
            icon: '/icon-192x192.png'
          })
        }
      })
      
      return unsub
    }
  }, [messagingInstance, auth.currentUser, permission])

  const value = {
    fcmToken,
    permission,
    scheduledNotifications,
    requestPermission,
    getFCMToken,
    disableNotifications,
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