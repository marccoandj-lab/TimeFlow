import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
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
  const [messagingInstance, setMessagingInstance] = useState(null)
  const [isReady, setIsReady] = useState(false)
  const registeringRef = useRef(false)

  useEffect(() => {
    const init = async () => {
      if (typeof window !== 'undefined' && 'Notification' in window) {
        setPermission(Notification.permission)
        console.log('📢 Notification permission:', Notification.permission)
      }
      
      try {
        if (!app) {
          console.error('❌ Firebase app not initialized')
          return
        }
        
        const supported = await isSupported()
        if (!supported) {
          console.error('❌ Firebase messaging not supported')
          return
        }
        
        const msg = getMessaging(app)
        setMessagingInstance(msg)
        console.log('✅ Firebase messaging initialized')
        
        onMessage(msg, (payload) => {
          console.log('📨 Foreground FCM message:', payload)
          const title = payload.data?.title || payload.notification?.title || 'TimeFlow'
          const body = payload.data?.body || payload.notification?.body || ''
          showNotification(title, {
            body,
            tag: payload.data?.tag || 'timeflow-foreground'
          })
        })
        
        setIsReady(true)
      } catch (error) {
        console.error('❌ Messaging init error:', error)
      }
    }
    init()
  }, [])

  const showNotification = useCallback((title, options = {}) => {
    if (Notification.permission === 'granted') {
      try {
        const notification = new Notification(title, {
          body: options.body || '',
          icon: '/icon-192x192.png',
          badge: '/icon-192x192.png',
          tag: options.tag || 'timeflow',
          requireInteraction: true,
          vibrate: [200, 100, 200],
          ...options
        })
        console.log('✅ Notification shown:', title)
        return notification
      } catch (e) {
        console.error('❌ Notification error:', e)
        return null
      }
    }
    return null
  }, [])

  const registerFCMToken = useCallback(async () => {
    if (registeringRef.current) {
      console.log('FCM registration already in progress...')
      return null
    }
    registeringRef.current = true
    
    console.log('🔄 Registering FCM token...')
    console.log('  messagingInstance:', !!messagingInstance)
    console.log('  auth.currentUser:', !!auth?.currentUser)
    
    if (!messagingInstance) {
      console.error('❌ Messaging not initialized')
      registeringRef.current = false
      return null
    }
    
    if (!auth?.currentUser) {
      console.error('❌ No current user')
      registeringRef.current = false
      return null
    }
    
    try {
      const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY
      if (!vapidKey) {
        console.error('❌ VAPID key missing')
        registeringRef.current = false
        return null
      }
      
      const token = await getToken(messagingInstance, { vapidKey })
      
      if (token) {
        setFcmToken(token)
        console.log('✅ FCM token:', token.substring(0, 30) + '...')
        console.log('✅ User ID:', auth.currentUser.uid)
        
        try {
          const response = await fetch(`${API_BASE}/notifications/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              userId: auth.currentUser.uid, 
              fcmToken: token 
            })
          })
          
          if (response.ok) {
            console.log('✅ FCM token registered with backend')
          } else {
            console.error('❌ Backend registration failed:', response.status)
          }
        } catch (e) {
          console.error('❌ Backend registration error:', e)
        }
        
        registeringRef.current = false
        return token
      } else {
        console.error('❌ No FCM token received')
        registeringRef.current = false
        return null
      }
    } catch (e) {
      console.error('❌ FCM token error:', e.code, e.message)
      registeringRef.current = false
      return null
    }
  }, [messagingInstance])

  useEffect(() => {
    if (isReady && auth?.currentUser && messagingInstance && Notification.permission === 'granted') {
      registerFCMToken()
    }
  }, [isReady, auth?.currentUser, messagingInstance, registerFCMToken])

  const requestPermission = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      console.error('❌ Notifications not supported')
      return false
    }

    try {
      console.log('🔄 Requesting notification permission...')
      const result = await Notification.requestPermission()
      setPermission(result)
      console.log('📢 Permission result:', result)
      
      if (result === 'granted') {
        showNotification('✅ TimeFlow Notifications Enabled', {
          body: 'You will receive reminders for your tasks and habits!'
        })
        await registerFCMToken()
        return true
      }
      return false
    } catch (error) {
      console.error('❌ Permission error:', error)
      return false
    }
  }

  const checkNotificationSupport = useCallback(() => {
    const support = {
      notificationAPI: typeof Notification !== 'undefined',
      serviceWorker: 'serviceWorker' in navigator,
      permission: Notification.permission,
      fcmToken: !!fcmToken,
      ready: isReady
    }
    console.log('📊 Notification support:', support)
    return support
  }, [fcmToken, isReady])

  const scheduleTaskNotification = async (task) => {
    console.log('🔔 scheduleTaskNotification called for:', task.title)
    
    const support = checkNotificationSupport()
    
    if (!support.notificationAPI) {
      console.error('❌ Notifications not supported in this browser')
      return null
    }

    if (Notification.permission !== 'granted') {
      console.log('Permission not granted, requesting...')
      const granted = await requestPermission()
      if (!granted) {
        console.error('❌ Notification permission denied')
        return null
      }
    }

    if (!task.dueDate) {
      console.error('❌ No due date for task')
      return null
    }

    let currentToken = fcmToken
    if (!currentToken && messagingInstance && auth?.currentUser) {
      console.log('No FCM token, attempting to register...')
      currentToken = await registerFCMToken()
    }

    if (auth?.currentUser) {
      try {
        await fetch(`${API_BASE}/notifications/${auth.currentUser.uid}/task/${task.id}`, {
          method: 'DELETE'
        })
        console.log('🧹 Cleared existing notifications for task')
      } catch (e) {
        console.error('❌ Failed to clear existing notifications:', e)
      }
    }

    const dueDate = new Date(task.dueDate + 'T' + (task.dueTime || '09:00'))
    const now = new Date()

    console.log('📅 Due date:', dueDate.toISOString())
    console.log('🕐 Now:', now.toISOString())

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
        console.log(`⏭️ Skipping ${label} - already passed`)
        continue
      }

      const notificationId = `${task.id}-${minutes}`
      const delay = notifyTime.getTime() - now.getTime()

      console.log(`⏰ Scheduling ${label} notification in ${Math.round(delay/1000)}s`)

      if (auth?.currentUser && currentToken) {
        try {
          const response = await fetch(`${API_BASE}/notifications/schedule`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: auth.currentUser.uid,
              title: `⏰ ${task.title}`,
              body: `Due ${label}${task.dueTime ? ` at ${task.dueTime}` : ''}`,
              scheduledFor: notifyTime.toISOString(),
              type: 'task',
              relatedId: task.id,
              tag: notificationId
            })
          })
          
          if (response.ok) {
            console.log(`✅ FCM notification scheduled for ${label}`)
          } else {
            console.error(`❌ FCM schedule failed for ${label}:`, response.status)
          }
        } catch (e) {
          console.error(`❌ FCM schedule error for ${label}:`, e)
        }
      } else {
        console.log(`⚠️ No FCM token - using local notification for ${label}`)
        if (delay < 2147483647) {
          const timeoutId = setTimeout(() => {
            console.log(`🔔 TRIGGERING LOCAL: ${task.title} - ${label}`)
            showNotification(`⏰ ${task.title}`, {
              body: `Due ${label}${task.dueTime ? ` at ${task.dueTime}` : ''}`,
              tag: notificationId
            })
          }, delay)
          scheduledNotificationsLocal.set(notificationId, timeoutId)
        }
      }
      
      scheduled.push({ id: notificationId, minutes })
    }

    console.log(`📋 Total scheduled: ${scheduled.length} notifications`)
    return scheduled
  }

  const scheduleHabitNotification = async (habit) => {
    console.log('🔔 scheduleHabitNotification called for:', habit.name)
    
    const support = checkNotificationSupport()
    
    if (!support.notificationAPI) {
      console.error('❌ Notifications not supported in this browser')
      return null
    }

    if (Notification.permission !== 'granted') {
      console.log('Permission not granted, requesting...')
      const granted = await requestPermission()
      if (!granted) {
        console.error('❌ Notification permission denied')
        return null
      }
    }

    let currentToken = fcmToken
    if (!currentToken && messagingInstance && auth?.currentUser) {
      console.log('No FCM token, attempting to register...')
      currentToken = await registerFCMToken()
    }

    if (auth?.currentUser) {
      try {
        await fetch(`${API_BASE}/notifications/${auth.currentUser.uid}/habit/${habit.id}`, {
          method: 'DELETE'
        })
        console.log('🧹 Cleared existing notifications for habit')
      } catch (e) {
        console.error('❌ Failed to clear existing habit notifications:', e)
      }
    }

    const now = new Date()
    const today = now.toISOString().split('T')[0]
    const reminderTime = habit.reminderTime || '09:00'
    const habitTime = new Date(`${today}T${reminderTime}`)

    console.log('📅 Habit time:', habitTime.toISOString())
    console.log('🕐 Now:', now.toISOString())

    const notificationTimes = [
      { minutes: 60, label: '1 hour before' },
      { minutes: 30, label: '30 minutes before' },
      { minutes: 15, label: '15 minutes before' },
      { minutes: 5, label: '5 minutes before' },
      { minutes: 1, label: '1 minute before' },
    ]

    const scheduled = []

    for (const { minutes, label } of notificationTimes) {
      const notifyTime = new Date(habitTime.getTime() - minutes * 60 * 1000)
      
      if (notifyTime <= now) {
        console.log(`⏭️ Skipping ${label} - already passed`)
        continue
      }

      const notificationId = `habit-${habit.id}-${minutes}`
      const delay = notifyTime.getTime() - now.getTime()

      console.log(`⏰ Scheduling ${label} notification in ${Math.round(delay/1000)}s`)

      if (auth?.currentUser && currentToken) {
        try {
          const response = await fetch(`${API_BASE}/notifications/schedule`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: auth.currentUser.uid,
              title: `🎯 ${habit.name}`,
              body: `Time to complete your habit! ${label}${habit.reminderTime ? ` at ${habit.reminderTime}` : ''}`,
              scheduledFor: notifyTime.toISOString(),
              type: 'habit',
              relatedId: habit.id,
              tag: notificationId
            })
          })
          
          if (response.ok) {
            console.log(`✅ FCM notification scheduled for ${label}`)
          } else {
            console.error(`❌ FCM schedule failed for ${label}:`, response.status)
          }
        } catch (e) {
          console.error(`❌ FCM schedule error for ${label}:`, e)
        }
      } else {
        console.log(`⚠️ No FCM token - using local notification for ${label}`)
        if (delay < 2147483647) {
          const timeoutId = setTimeout(() => {
            console.log(`🔔 TRIGGERING LOCAL: ${habit.name} - ${label}`)
            showNotification(`🎯 ${habit.name}`, {
              body: `Time to complete your habit! ${label}${habit.reminderTime ? ` at ${habit.reminderTime}` : ''}`,
              tag: notificationId
            })
          }, delay)
          scheduledNotificationsLocal.set(notificationId, timeoutId)
        }
      }
      
      scheduled.push({ id: notificationId, minutes })
    }

    console.log(`📋 Total scheduled: ${scheduled.length} notifications`)
    return scheduled
  }

  const cancelNotification = async (notificationId) => {
    const timeoutId = scheduledNotificationsLocal.get(notificationId)
    if (timeoutId) {
      clearTimeout(timeoutId)
      scheduledNotificationsLocal.delete(notificationId)
    }
  }

  const cancelTaskNotifications = async (taskId) => {
    console.log('🗑️ Canceling all notifications for task:', taskId)
    
    const notificationTimes = [60, 30, 15, 5, 1]
    for (const minutes of notificationTimes) {
      const notificationId = `${taskId}-${minutes}`
      const timeoutId = scheduledNotificationsLocal.get(notificationId)
      if (timeoutId) {
        clearTimeout(timeoutId)
        scheduledNotificationsLocal.delete(notificationId)
        console.log(`  ✓ Canceled local: ${notificationId}`)
      }
    }

    if (auth?.currentUser) {
      try {
        const response = await fetch(`${API_BASE}/notifications/${auth.currentUser.uid}/task/${taskId}`, {
          method: 'DELETE'
        })
        const data = await response.json()
        console.log(`  ✓ Deleted ${data.deleted || 0} scheduled notifications from server`)
      } catch (error) {
        console.error('Error canceling task notifications:', error)
      }
    }
  }

  const cancelHabitNotifications = async (habitId) => {
    console.log('🗑️ Canceling all notifications for habit:', habitId)
    
    const notificationTimes = [60, 30, 15, 5, 1]
    for (const minutes of notificationTimes) {
      const notificationId = `habit-${habitId}-${minutes}`
      const timeoutId = scheduledNotificationsLocal.get(notificationId)
      if (timeoutId) {
        clearTimeout(timeoutId)
        scheduledNotificationsLocal.delete(notificationId)
        console.log(`  ✓ Canceled local: ${notificationId}`)
      }
    }

    if (auth?.currentUser) {
      try {
        const response = await fetch(`${API_BASE}/notifications/${auth.currentUser.uid}/habit/${habitId}`, {
          method: 'DELETE'
        })
        const data = await response.json()
        console.log(`  ✓ Deleted ${data.deleted || 0} scheduled notifications from server`)
      } catch (error) {
        console.error('Error canceling habit notifications:', error)
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
    cancelTaskNotifications,
    cancelHabitNotifications,
    checkNotificationSupport
  }

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  )
}
