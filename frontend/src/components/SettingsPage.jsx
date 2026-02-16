import { useState, useEffect, useRef, useContext } from 'react'
import { 
  Settings, Bell, Moon, Sun, Clock, Trash2,
  ChevronRight, ToggleLeft, ToggleRight, Brain, Coffee, Zap
} from 'lucide-react'
import { useNotifications } from '../contexts/NotificationContext'

const storage = {
  get: (key, def = null) => {
    try {
      const item = localStorage.getItem(`timeflow_${key}`)
      return item ? JSON.parse(item) : def
    } catch { return def }
  },
  set: (key, value) => {
    try { localStorage.setItem(`timeflow_${key}`, JSON.stringify(value)) } catch {}
  },
  remove: (key) => {
    try { localStorage.removeItem(`timeflow_${key}`) } catch {}
  },
  clear: () => {
    try {
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('timeflow_')) localStorage.removeItem(key)
      })
    } catch {}
  }
}

export const getTimerSettings = () => {
  const saved = storage.get('appSettings')
  return {
    pomodoroDuration: saved?.pomodoroDuration || 25,
    shortBreakDuration: saved?.shortBreakDuration || 5,
    longBreakDuration: saved?.longBreakDuration || 15
  }
}

export default function SettingsPage({ onNavigate }) {
  const { requestPermission, permission, scheduleDailyReminder, cancelDailyReminder } = useNotifications()
  const [settings, setSettings] = useState(() => {
    const saved = storage.get('appSettings')
    return saved || {
      darkMode: false,
      notifications: true,
      pomodoroDuration: 25,
      shortBreakDuration: 5,
      longBreakDuration: 15,
      dailyReminder: false,
      reminderTime: '09:00',
      reminderTimes: ['09:00']
    }
  })
  const [successMessage, setSuccessMessage] = useState('')
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    
    const loadSettings = () => {
      const saved = storage.get('appSettings')
      if (saved && isMountedRef.current) {
        setSettings(prev => ({ ...prev, ...saved }))
      }
    }
    
    loadSettings()
    
    const handleFocus = () => loadSettings()
    window.addEventListener('focus', handleFocus)
    
    return () => {
      isMountedRef.current = false
      window.removeEventListener('focus', handleFocus)
    }
  }, [])

  function showSuccess(msg) {
    setSuccessMessage(msg)
    setTimeout(() => {
      if (isMountedRef.current) {
        setSuccessMessage('')
      }
    }, 2000)
  }

  async function updateSettings(key, value, saveToStorage = true) {
    const newSettings = { ...settings, [key]: value }
    if (isMountedRef.current) {
      setSettings(newSettings)
    }
    if (saveToStorage) {
      storage.set('appSettings', newSettings)
    }
    
    if (key === 'darkMode') {
      storage.set('theme', value)
      document.documentElement.classList.toggle('dark', value)
    }
    
    if (key === 'dailyReminder') {
      if (value) {
        if (permission !== 'granted') {
          const granted = await requestPermission()
          if (!granted) {
            showSuccess('Please enable notifications first')
            return
          }
        }
        await scheduleDailyReminder(newSettings.reminderTime)
        showSuccess('Daily reminder enabled!')
      } else {
        await cancelDailyReminder()
        showSuccess('Daily reminder disabled')
      }
    }
    
    if (key === 'reminderTime' && settings.dailyReminder) {
      await scheduleDailyReminder(value)
      showSuccess('Reminder time updated!')
    }
    
    if (key === 'pomodoroDuration' || key === 'shortBreakDuration' || key === 'longBreakDuration') {
      showSuccess('Timer settings saved!')
    }
  }

  async function handleNotificationToggle() {
    if (permission !== 'granted') {
      const granted = await requestPermission()
      if (granted) {
        await updateSettings('notifications', true)
        showSuccess('Notifications enabled!')
      } else {
        showSuccess('Permission denied')
      }
    } else {
      await updateSettings('notifications', !settings.notifications)
      showSuccess(settings.notifications ? 'Notifications disabled' : 'Notifications enabled!')
    }
  }

  async function clearAllData() {
    if (confirm('Are you sure you want to clear all your data? This cannot be undone.')) {
      storage.clear()
      window.location.reload()
    }
  }

  return (
    <div className="space-y-4 pb-20 md:pb-4 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
          <Settings className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Settings</h1>
          <p className="text-xs text-gray-500">Customize your experience</p>
        </div>
      </div>

      <div className="card divide-y divide-gray-100 dark:divide-gray-700">
        <div className="p-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Appearance</h2>
          
          <div className="space-y-3">
            <button 
              onClick={() => updateSettings('darkMode', !settings.darkMode)}
              className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                {settings.darkMode ? <Moon className="w-5 h-5 text-indigo-500" /> : <Sun className="w-5 h-5 text-amber-500" />}
                <div className="text-left">
                  <p className="font-medium text-sm">Dark Mode</p>
                  <p className="text-xs text-gray-500">Switch between light and dark theme</p>
                </div>
              </div>
              {settings.darkMode ? (
                <ToggleRight className="w-8 h-8 text-indigo-500" />
              ) : (
                <ToggleLeft className="w-8 h-8 text-gray-400" />
              )}
            </button>
          </div>
        </div>

        <div className="p-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Notifications</h2>
          
          <div className="space-y-3">
            <button 
              onClick={handleNotificationToggle}
              className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                {settings.notifications && permission === 'granted' ? <Bell className="w-5 h-5 text-indigo-500" /> : <Bell className="w-5 h-5 text-gray-400" />}
                <div className="text-left">
                  <p className="font-medium text-sm">Push Notifications</p>
                  <p className="text-xs text-gray-500">{permission === 'granted' ? 'Enabled - get notified about tasks' : 'Click to enable notifications'}</p>
                </div>
              </div>
              {settings.notifications && permission === 'granted' ? (
                <ToggleRight className="w-8 h-8 text-indigo-500" />
              ) : (
                <ToggleLeft className="w-8 h-8 text-gray-400" />
              )}
            </button>

            <button 
              onClick={() => updateSettings('dailyReminder', !settings.dailyReminder)}
              className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Clock className={`w-5 h-5 ${settings.dailyReminder ? 'text-indigo-500' : 'text-gray-400'}`} />
                <div className="text-left">
                  <p className="font-medium text-sm">Daily Reminder</p>
                  <p className="text-xs text-gray-500">Get reminded to check your tasks</p>
                </div>
              </div>
              {settings.dailyReminder ? (
                <ToggleRight className="w-8 h-8 text-indigo-500" />
              ) : (
                <ToggleLeft className="w-8 h-8 text-gray-400" />
              )}
            </button>

            {settings.dailyReminder && (
              <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-gray-700/30">
                <div className="flex items-center gap-3">
                  <Clock className="w-5 h-5 text-gray-400" />
                  <span className="text-sm">Reminder Time</span>
                </div>
                <input
                  type="time"
                  value={settings.reminderTime}
                  onChange={(e) => updateSettings('reminderTime', e.target.value)}
                  className="input w-28 py-1.5 text-sm"
                />
              </div>
            )}
          </div>
        </div>

        <div className="p-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Timer Settings</h2>
          
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-gray-700/30">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                  <Brain className="w-4 h-4 text-white" />
                </div>
                <div>
                  <span className="text-sm font-medium">Focus Duration</span>
                  <p className="text-xs text-gray-500">Pomodoro work session</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => updateSettings('pomodoroDuration', Math.max(5, settings.pomodoroDuration - 5))}
                  className="w-8 h-8 rounded-lg bg-gray-200 dark:bg-gray-600 flex items-center justify-center hover:bg-gray-300 dark:hover:bg-gray-500 font-medium"
                >
                  -
                </button>
                <span className="w-14 text-center font-bold text-lg">{settings.pomodoroDuration}m</span>
                <button 
                  onClick={() => updateSettings('pomodoroDuration', Math.min(60, settings.pomodoroDuration + 5))}
                  className="w-8 h-8 rounded-lg bg-gray-200 dark:bg-gray-600 flex items-center justify-center hover:bg-gray-300 dark:hover:bg-gray-500 font-medium"
                >
                  +
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-gray-700/30">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                  <Coffee className="w-4 h-4 text-white" />
                </div>
                <div>
                  <span className="text-sm font-medium">Short Break</span>
                  <p className="text-xs text-gray-500">Quick rest between sessions</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => updateSettings('shortBreakDuration', Math.max(1, settings.shortBreakDuration - 1))}
                  className="w-8 h-8 rounded-lg bg-gray-200 dark:bg-gray-600 flex items-center justify-center hover:bg-gray-300 dark:hover:bg-gray-500 font-medium"
                >
                  -
                </button>
                <span className="w-14 text-center font-bold text-lg">{settings.shortBreakDuration}m</span>
                <button 
                  onClick={() => updateSettings('shortBreakDuration', Math.min(15, settings.shortBreakDuration + 1))}
                  className="w-8 h-8 rounded-lg bg-gray-200 dark:bg-gray-600 flex items-center justify-center hover:bg-gray-300 dark:hover:bg-gray-500 font-medium"
                >
                  +
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-gray-700/30">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
                  <Zap className="w-4 h-4 text-white" />
                </div>
                <div>
                  <span className="text-sm font-medium">Long Break</span>
                  <p className="text-xs text-gray-500">Extended rest after 4 sessions</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => updateSettings('longBreakDuration', Math.max(5, settings.longBreakDuration - 5))}
                  className="w-8 h-8 rounded-lg bg-gray-200 dark:bg-gray-600 flex items-center justify-center hover:bg-gray-300 dark:hover:bg-gray-500 font-medium"
                >
                  -
                </button>
                <span className="w-14 text-center font-bold text-lg">{settings.longBreakDuration}m</span>
                <button 
                  onClick={() => updateSettings('longBreakDuration', Math.min(30, settings.longBreakDuration + 5))}
                  className="w-8 h-8 rounded-lg bg-gray-200 dark:bg-gray-600 flex items-center justify-center hover:bg-gray-300 dark:hover:bg-gray-500 font-medium"
                >
                  +
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Storage</h2>
          
          <div className="space-y-2">
            <button 
              onClick={clearAllData}
              className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors text-red-600"
            >
              <Trash2 className="w-5 h-5" />
              <div className="text-left">
                <p className="font-medium text-sm">Clear All Data</p>
                <p className="text-xs text-red-400">Delete all tasks, habits, and notes</p>
              </div>
              <ChevronRight className="w-4 h-4 ml-auto" />
            </button>
          </div>
        </div>
      </div>

      <div className="card p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
            <Settings className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="font-semibold text-sm">TimeFlow</p>
            <p className="text-xs text-gray-500">Version 1.0.0</p>
          </div>
        </div>
      </div>
      
      {successMessage && (
        <div className="fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 bg-emerald-500 text-white px-4 py-2 rounded-xl shadow-lg z-50 animate-fade-in">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{successMessage}</span>
          </div>
        </div>
      )}
    </div>
  )
}
