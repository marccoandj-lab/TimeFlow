import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { 
  Settings, Bell, Moon, Sun, Clock, Trash2, Download,
  Volume2, VolumeX, Smartphone, Globe, Shield, HelpCircle,
  Info, ChevronRight, ToggleLeft, ToggleRight
} from 'lucide-react'
import { doc, setDoc } from 'firebase/firestore'
import { db } from '../firebase'

export default function SettingsPage() {
  const { currentUser, userData, updateUserProfile } = useAuth()
  const [settings, setSettings] = useState({
    darkMode: false,
    notifications: true,
    soundEffects: true,
    pomodoroDuration: 25,
    shortBreakDuration: 5,
    longBreakDuration: 15,
    dailyReminder: true,
    reminderTime: '09:00',
    language: 'en'
  })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (userData?.settings) {
      setSettings(prev => ({ ...prev, ...userData.settings }))
    }
  }, [userData])

  async function updateSettings(key, value) {
    const newSettings = { ...settings, [key]: value }
    setSettings(newSettings)
    
    setLoading(true)
    try {
      await updateUserProfile({ settings: newSettings })
    } catch (err) {
      console.error('Failed to save settings')
    }
    setLoading(false)
  }

  function exportData() {
    const data = {
      user: {
        email: currentUser?.email,
        displayName: userData?.displayName,
        exportedAt: new Date().toISOString()
      },
      settings: settings
    }
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `timeflow-backup-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function clearAllData() {
    if (confirm('Are you sure you want to clear all your data? This cannot be undone.')) {
      try {
        await fetch('/api/tasks', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clearAll: true }) })
        alert('All data cleared successfully')
      } catch (err) {
        console.error('Failed to clear data')
      }
    }
  }

  return (
    <div className="space-y-4 pb-20 md:pb-4 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-gray-500 to-gray-600 flex items-center justify-center">
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
              onClick={() => updateSettings('notifications', !settings.notifications)}
              className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                {settings.notifications ? <Bell className="w-5 h-5 text-indigo-500" /> : <Bell className="w-5 h-5 text-gray-400" />}
                <div className="text-left">
                  <p className="font-medium text-sm">Push Notifications</p>
                  <p className="text-xs text-gray-500">Get notified about tasks and habits</p>
                </div>
              </div>
              {settings.notifications ? (
                <ToggleRight className="w-8 h-8 text-indigo-500" />
              ) : (
                <ToggleLeft className="w-8 h-8 text-gray-400" />
              )}
            </button>

            <button 
              onClick={() => updateSettings('soundEffects', !settings.soundEffects)}
              className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                {settings.soundEffects ? <Volume2 className="w-5 h-5 text-indigo-500" /> : <VolumeX className="w-5 h-5 text-gray-400" />}
                <div className="text-left">
                  <p className="font-medium text-sm">Sound Effects</p>
                  <p className="text-xs text-gray-500">Play sounds for timer and actions</p>
                </div>
              </div>
              {settings.soundEffects ? (
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
                <Smartphone className={`w-5 h-5 ${settings.dailyReminder ? 'text-indigo-500' : 'text-gray-400'}`} />
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
                <div className="w-5 h-5 rounded bg-indigo-500 flex items-center justify-center">
                  <span className="text-xs text-white font-bold">P</span>
                </div>
                <span className="text-sm">Pomodoro Duration</span>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => updateSettings('pomodoroDuration', Math.max(1, settings.pomodoroDuration - 5))}
                  className="w-7 h-7 rounded-lg bg-gray-200 dark:bg-gray-600 flex items-center justify-center hover:bg-gray-300 dark:hover:bg-gray-500"
                >
                  -
                </button>
                <span className="w-12 text-center font-medium">{settings.pomodoroDuration}m</span>
                <button 
                  onClick={() => updateSettings('pomodoroDuration', Math.min(60, settings.pomodoroDuration + 5))}
                  className="w-7 h-7 rounded-lg bg-gray-200 dark:bg-gray-600 flex items-center justify-center hover:bg-gray-300 dark:hover:bg-gray-500"
                >
                  +
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-gray-700/30">
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 rounded bg-emerald-500 flex items-center justify-center">
                  <span className="text-xs text-white font-bold">S</span>
                </div>
                <span className="text-sm">Short Break</span>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => updateSettings('shortBreakDuration', Math.max(1, settings.shortBreakDuration - 1))}
                  className="w-7 h-7 rounded-lg bg-gray-200 dark:bg-gray-600 flex items-center justify-center hover:bg-gray-300 dark:hover:bg-gray-500"
                >
                  -
                </button>
                <span className="w-12 text-center font-medium">{settings.shortBreakDuration}m</span>
                <button 
                  onClick={() => updateSettings('shortBreakDuration', Math.min(15, settings.shortBreakDuration + 1))}
                  className="w-7 h-7 rounded-lg bg-gray-200 dark:bg-gray-600 flex items-center justify-center hover:bg-gray-300 dark:hover:bg-gray-500"
                >
                  +
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-gray-700/30">
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 rounded bg-amber-500 flex items-center justify-center">
                  <span className="text-xs text-white font-bold">L</span>
                </div>
                <span className="text-sm">Long Break</span>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => updateSettings('longBreakDuration', Math.max(1, settings.longBreakDuration - 5))}
                  className="w-7 h-7 rounded-lg bg-gray-200 dark:bg-gray-600 flex items-center justify-center hover:bg-gray-300 dark:hover:bg-gray-500"
                >
                  -
                </button>
                <span className="w-12 text-center font-medium">{settings.longBreakDuration}m</span>
                <button 
                  onClick={() => updateSettings('longBreakDuration', Math.min(30, settings.longBreakDuration + 5))}
                  className="w-7 h-7 rounded-lg bg-gray-200 dark:bg-gray-600 flex items-center justify-center hover:bg-gray-300 dark:hover:bg-gray-500"
                >
                  +
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Data</h2>
          
          <div className="space-y-2">
            <button 
              onClick={exportData}
              className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
            >
              <Download className="w-5 h-5 text-gray-400" />
              <div className="text-left">
                <p className="font-medium text-sm">Export Data</p>
                <p className="text-xs text-gray-500">Download your data as JSON</p>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400 ml-auto" />
            </button>

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

      <div className="card divide-y divide-gray-100 dark:divide-gray-700">
        <div className="p-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">About</h2>
          
          <div className="space-y-2">
            <div className="flex items-center gap-3 p-3 rounded-xl">
              <Info className="w-5 h-5 text-gray-400" />
              <div className="text-left">
                <p className="font-medium text-sm">Version</p>
                <p className="text-xs text-gray-500">TimeFlow v1.0.0</p>
              </div>
            </div>

            <button className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
              <Shield className="w-5 h-5 text-gray-400" />
              <div className="text-left">
                <p className="font-medium text-sm">Privacy Policy</p>
                <p className="text-xs text-gray-500">How we handle your data</p>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400 ml-auto" />
            </button>

            <button className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
              <HelpCircle className="w-5 h-5 text-gray-400" />
              <div className="text-left">
                <p className="font-medium text-sm">Help & Support</p>
                <p className="text-xs text-gray-500">Get help with TimeFlow</p>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400 ml-auto" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}