import { useState, useEffect, createContext, useContext, useRef, useCallback } from 'react'
import { format, isToday, isTomorrow, isPast, parseISO, isSameDay, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, addMonths, subMonths, startOfWeek } from 'date-fns'
import { 
  LayoutDashboard, CheckSquare, Calendar, Clock, Target, StickyNote, Moon, Sun,
  Plus, Trash2, Edit3, Search, Play, Pause, RotateCcw,
  CheckCircle2, Circle, AlertTriangle, Timer, X, Menu, Sparkles, TrendingUp,
  ChevronLeft, ChevronRight, Info, Zap, Coffee, Brain, Dumbbell, BookOpen, Home,
  Settings, User, ChevronDown, Bell, BellOff, Download, LogOut, Loader2
} from 'lucide-react'
import { NotificationProvider, useNotifications } from './contexts/NotificationContext'
import { useAuth } from './contexts/AuthContext'
import AuthPage from './components/AuthPage'
import SettingsPage, { getTimerSettings } from './components/SettingsPage'
import { createUserApi } from './firebaseApi'

const API_BASE = '/api'
const ThemeContext = createContext()
const useTheme = () => useContext(ThemeContext)
const PWAContext = createContext()
export const usePWA = () => useContext(PWAContext)
const UserApiContext = createContext()
export const useUserApi = () => useContext(UserApiContext)

const useApi = () => {
  const userApi = useUserApi()
  return userApi || api
}

const mobileViews = ['dashboard', 'tasks', 'calendar', 'timer', 'habits', 'overdue']

function useSwipeNavigation(activeView, setActiveView, isMobile) {
  const touchStart = useRef({ x: 0, y: 0, time: 0 })
  const isSwiping = useRef(false)

  const handleTouchStart = useCallback((e) => {
    if (!isMobile) return
    
    const target = e.target
    const isModal = target.closest('.modal-content') || target.closest('[role="dialog"]')
    const isForm = target.closest('form')
    const isInput = target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA'
    
    if (isModal || isForm || isInput) {
      isSwiping.current = false
      return
    }
    
    const touch = e.touches[0]
    touchStart.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now()
    }
    isSwiping.current = false
  }, [isMobile])

  const handleTouchMove = useCallback((e) => {
    if (!isMobile) return
    
    const target = e.target
    const isModal = target.closest('.modal-content') || target.closest('[role="dialog"]')
    const isForm = target.closest('form')
    const isInput = target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA'
    
    if (isModal || isForm || isInput) {
      return
    }
    
    const touch = e.touches[0]
    const deltaX = touch.clientX - touchStart.current.x
    const deltaY = touch.clientY - touchStart.current.y
    
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
      isSwiping.current = true
    }
  }, [isMobile])

  const handleTouchEnd = useCallback((e) => {
    if (!isMobile || !isSwiping.current) return
    
    const target = e.target
    const isModal = target.closest('.modal-content') || target.closest('[role="dialog"]')
    
    if (isModal) {
      isSwiping.current = false
      return
    }
    
    const touch = e.changedTouches[0]
    const deltaX = touchStart.current.x - touch.clientX
    const deltaY = touchStart.current.y - touch.clientY
    const deltaTime = Date.now() - touchStart.current.time
    
    const isValidSwipe = Math.abs(deltaX) > 50 && 
                         Math.abs(deltaX) > Math.abs(deltaY) * 1.5 &&
                         deltaTime < 500
    
    if (isValidSwipe) {
      const currentIndex = mobileViews.indexOf(activeView)
      if (deltaX > 0 && currentIndex < mobileViews.length - 1) {
        setActiveView(mobileViews[currentIndex + 1])
      } else if (deltaX < 0 && currentIndex > 0) {
        setActiveView(mobileViews[currentIndex - 1])
      }
    }
    
    isSwiping.current = false
  }, [isMobile, activeView, setActiveView])

  return { handleTouchStart, handleTouchMove, handleTouchEnd, isSwiping }
}

function PageTransition({ children, viewKey, direction }) {
  const prevKeyRef = useRef(viewKey)
  const [showAnimation, setShowAnimation] = useState(false)

  useEffect(() => {
    if (prevKeyRef.current !== viewKey) {
      setShowAnimation(true)
      const timer = setTimeout(() => setShowAnimation(false), 400)
      prevKeyRef.current = viewKey
      return () => clearTimeout(timer)
    }
  }, [viewKey])

return (
    <div className={`w-full ${showAnimation ? 'animate-page-in' : ''}`}>
      {children}
    </div>
  )
}

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
  }
}

const createLocalApi = (type, storageKey) => ({
  list: async (params = {}) => {
    const cached = storage.get(storageKey, [])
    try {
      const res = await fetch(`${API_BASE}/${type}?${new URLSearchParams(params)}`)
      const data = await res.json()
      storage.set(storageKey, data)
      return data
    } catch { return cached }
  },
  create: async (data) => {
    const cached = storage.get(storageKey, [])
    try {
      const res = await fetch(`${API_BASE}/${type}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      const item = await res.json()
      storage.set(storageKey, [...cached, item])
      return item
    } catch {
      const item = { ...data, id: `local_${Date.now()}`, createdAt: new Date().toISOString() }
      storage.set(storageKey, [...cached, item])
      return item
    }
  },
  update: async (id, data) => {
    const cached = storage.get(storageKey, [])
    try {
      const res = await fetch(`${API_BASE}/${type}/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      const item = await res.json()
      storage.set(storageKey, cached.map(i => i.id === id ? item : i))
      return item
    } catch {
      const item = cached.find(i => i.id === id)
      const updated = { ...item, ...data }
      storage.set(storageKey, cached.map(i => i.id === id ? updated : i))
      return updated
    }
  },
  delete: async (id) => {
    const cached = storage.get(storageKey, [])
    try {
      await fetch(`${API_BASE}/${type}/${id}`, { method: 'DELETE' })
    } catch {}
    storage.set(storageKey, cached.filter(i => i.id !== id))
  }
})

const api = {
  tasks: createLocalApi('tasks', 'tasks'),
  categories: {
    list: async () => {
      const cached = storage.get('categories', [])
      try {
        const res = await fetch(`${API_BASE}/categories`)
        const data = await res.json()
        storage.set('categories', data)
        return data
      } catch { return cached.length ? cached : [
        { id: '1', name: 'Work', color: '#ef4444' },
        { id: '2', name: 'Personal', color: '#10b981' },
        { id: '3', name: 'Health', color: '#f59e0b' },
        { id: '4', name: 'Learning', color: '#8b5cf6' },
        { id: '5', name: 'Shopping', color: '#ec4899' }
      ]}
    }
  },
  habits: {
    ...createLocalApi('habits', 'habits'),
    complete: async (id) => {
      const cached = storage.get('habits', [])
      try {
        const res = await fetch(`${API_BASE}/habits/${id}/complete`, { method: 'POST' })
        const item = await res.json()
        storage.set('habits', cached.map(i => i.id === id ? item : i))
        return item
      } catch {
        const item = cached.find(i => i.id === id)
        const today = new Date().toISOString().split('T')[0]
        const lastCompleted = item?.lastCompleted?.split('T')[0]
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
        let streak = item?.streak || 0
        if (lastCompleted === yesterday) streak++
        else if (lastCompleted !== today) streak = 1
        const updated = { ...item, streak, lastCompleted: new Date().toISOString() }
        storage.set('habits', cached.map(i => i.id === id ? updated : i))
        return updated
      }
    }
  },
  notes: createLocalApi('notes', 'notes'),
  notifications: {
    cleanup: async () => {
      try {
        const deviceId = localStorage.getItem('timeflow_deviceId')
        if (deviceId) {
          await fetch(`${API_BASE}/notifications/cleanup/${deviceId}`)
        }
      } catch {}
    },
    list: async () => {
      try {
        const deviceId = localStorage.getItem('timeflow_deviceId')
        if (deviceId) {
          const res = await fetch(`${API_BASE}/notifications/list/${deviceId}`)
          return await res.json()
        }
      } catch {}
      return { count: 0, notifications: [] }
    }
  },
  stats: async () => {
    const tasks = storage.get('tasks', [])
    const habits = storage.get('habits', [])
    const today = new Date().toISOString().split('T')[0]
    const now = new Date()
    const totalTasks = tasks.length
    const completedTasks = tasks.filter(t => t.status === 'completed').length
    
    const overdueTasks = tasks.filter(t => {
      if (!t.dueDate || t.status === 'completed') return false
      const dueDateTime = new Date(t.dueDate)
      if (t.dueTime) {
        const [hours, minutes] = t.dueTime.split(':').map(Number)
        dueDateTime.setHours(hours, minutes, 0, 0)
      } else {
        dueDateTime.setHours(23, 59, 59, 999)
      }
      const overdueThreshold = new Date(dueDateTime.getTime() + 45 * 60 * 1000)
      return now > overdueThreshold
    }).length
    
    try {
      const res = await fetch(`${API_BASE}/stats`)
      return await res.json()
    } catch {
      return {
        totalTasks,
        completedTasks,
        overdueTasks,
        completionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
        habitsCompletedToday: habits.filter(h => h.lastCompleted?.startsWith(today)).length
      }
    }
  }
}

const priorityColors = { high: 'text-red-500 bg-red-50 dark:bg-red-950/30', medium: 'text-amber-500 bg-amber-50 dark:bg-amber-950/30', low: 'text-slate-400 bg-slate-50 dark:bg-slate-950/30' }
const categoryColors = { Work: '#ef4444', Personal: '#10b981', Health: '#f59e0b', Learning: '#8b5cf6', Shopping: '#ec4899', general: '#6366f1' }

function Modal({ isOpen, onClose, title, children, variant = 'default' }) {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640
  
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [isOpen])
  
  if (!isOpen) return null

  const variants = {
    default: {
      headerBg: 'bg-gradient-to-r from-slate-50 to-white dark:from-slate-800 dark:to-slate-900',
      iconBg: 'bg-gradient-to-br from-violet-500 to-purple-600',
      icon: Sparkles
    },
    task: {
      headerBg: 'bg-gradient-to-r from-violet-50 via-purple-50 to-indigo-50 dark:from-violet-950/50 dark:via-purple-950/50 dark:to-indigo-950/50',
      iconBg: 'bg-gradient-to-br from-violet-500 to-purple-600',
      icon: CheckSquare
    },
    habit: {
      headerBg: 'bg-gradient-to-r from-emerald-50 via-teal-50 to-cyan-50 dark:from-emerald-950/50 dark:via-teal-950/50 dark:to-cyan-950/50',
      iconBg: 'bg-gradient-to-br from-emerald-500 to-teal-600',
      icon: Target
    }
  }

  const config = variants[variant] || variants.default
  const IconComponent = config.icon
  
  if (isMobile) {
    return (
      <div className="fixed inset-0 z-50 bg-white dark:bg-slate-900 flex flex-col animate-slide-up">
        <div className={`flex items-center gap-3 p-4 ${config.headerBg} border-b border-slate-200/50 dark:border-slate-700/50 flex-shrink-0 safe-area-top`}>
          <div className={`w-10 h-10 rounded-2xl ${config.iconBg} flex items-center justify-center shadow-lg`}>
            <IconComponent className="w-5 h-5 text-white" />
          </div>
          <h2 className="text-lg font-bold gradient-text flex-1">{title}</h2>
          <button 
            onClick={onClose} 
            className="p-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div 
          className="flex-1 overflow-y-auto overflow-x-hidden p-4 pb-24" 
          style={{ 
            WebkitOverflowScrolling: 'touch',
            overscrollBehavior: 'contain',
            touchAction: 'pan-y'
          }}
        >
          {children}
        </div>
      </div>
    )
  }
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-hidden">
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-md animate-fade-in" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md bg-white dark:bg-slate-800 rounded-3xl shadow-2xl border border-slate-200/50 dark:border-slate-700/50 max-h-[90vh] flex flex-col animate-slide-up overflow-hidden">
        <div className={`flex items-center gap-3 p-5 ${config.headerBg} flex-shrink-0`}>
          <div className={`w-11 h-11 rounded-2xl ${config.iconBg} flex items-center justify-center shadow-lg animate-float`}>
            <IconComponent className="w-5 h-5 text-white" />
          </div>
          <h2 className="text-xl font-bold gradient-text flex-1">{title}</h2>
          <button 
            onClick={onClose} 
            className="p-2.5 hover:bg-white/50 dark:hover:bg-slate-700/50 rounded-xl transition-colors"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>
        <div className="p-5 overflow-y-auto overflow-x-hidden flex-1">
          {children}
        </div>
      </div>
    </div>
  )
}

function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center px-4">
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-700 dark:to-slate-800 flex items-center justify-center mb-3">
        <Icon className="w-7 h-7 text-slate-400" />
      </div>
      <h3 className="text-base font-semibold text-slate-700 dark:text-slate-200">{title}</h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 mb-3">{description}</p>
      {action}
    </div>
  )
}

const isTaskOverdue = (task) => {
  if (!task.dueDate || task.status === 'completed') return false
  
  const now = new Date()
  const dueDateTime = new Date(task.dueDate)
  
  if (task.dueTime) {
    const [hours, minutes] = task.dueTime.split(':').map(Number)
    dueDateTime.setHours(hours, minutes, 0, 0)
  } else {
    dueDateTime.setHours(23, 59, 59, 999)
  }
  
  const overdueThreshold = new Date(dueDateTime.getTime() + 45 * 60 * 1000)
  
  return now > overdueThreshold
}

const getOverdueMinutes = (task) => {
  if (!task.dueDate) return null
  
  const now = new Date()
  const dueDateTime = new Date(task.dueDate)
  
  if (task.dueTime) {
    const [hours, minutes] = task.dueTime.split(':').map(Number)
    dueDateTime.setHours(hours, minutes, 0, 0)
  } else {
    dueDateTime.setHours(23, 59, 59, 999)
  }
  
  const overdueThreshold = new Date(dueDateTime.getTime() + 45 * 60 * 1000)
  const diffMs = now.getTime() - overdueThreshold.getTime()
  
  if (diffMs <= 0) return null
  return Math.floor(diffMs / (1000 * 60))
}

function UserMenu({ onNavigate }) {
  const [isOpen, setIsOpen] = useState(false)
  
  return (
    <div className="relative">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      >
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
          <User className="w-4 h-4 text-white" />
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-full mt-1 w-48 card p-1 z-50 shadow-lg">
            <button 
              onClick={() => { setIsOpen(false); onNavigate('settings') }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-sm"
            >
              <Settings className="w-4 h-4" /> Settings
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function MobileNav({ activeView, setActiveView }) {
  const navItems = [
    { id: 'dashboard', icon: Home, label: 'Home' },
    { id: 'tasks', icon: CheckSquare, label: 'Tasks' },
    { id: 'calendar', icon: Calendar, label: 'Calendar' },
    { id: 'timer', icon: Timer, label: 'Focus' },
    { id: 'habits', icon: Target, label: 'Habits' },
  ]
  
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-t border-slate-200/50 dark:border-slate-800/50 safe-area-bottom z-40">
      <div className="flex items-center justify-around px-2 py-1.5">
        {navItems.map(item => (
          <button
            key={item.id}
            onClick={() => setActiveView(item.id)}
            className={`flex flex-col items-center justify-center py-2 px-4 rounded-xl transition-all touch-target relative ${
              activeView === item.id 
                ? 'text-violet-600 dark:text-violet-400' 
                : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
            }`}
          >
            <item.icon className={`w-5 h-5 transition-transform ${activeView === item.id ? 'scale-110' : ''}`} />
            <span className="text-[10px] font-medium mt-0.5">{item.label}</span>
            {activeView === item.id && (
              <div className="absolute -top-0.5 w-8 h-1 bg-gradient-to-r from-violet-500 to-purple-500 rounded-full" />
            )}
          </button>
        ))}
      </div>
    </nav>
  )
}

function Sidebar({ activeView, setActiveView, collapsed }) {
  const navItems = [
    { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard', desc: 'Overview & stats' },
    { id: 'tasks', icon: CheckSquare, label: 'Tasks', desc: 'Manage your tasks' },
    { id: 'overdue', icon: AlertTriangle, label: 'Overdue', desc: 'Past due tasks' },
    { id: 'calendar', icon: Calendar, label: 'Calendar', desc: 'Monthly view' },
    { id: 'timer', icon: Timer, label: 'Focus Timer', desc: 'Pomodoro technique' },
    { id: 'habits', icon: Target, label: 'Habits', desc: 'Build routines' },
    { id: 'notes', icon: StickyNote, label: 'Notes', desc: 'Quick notes' },
  ]

  return (
    <aside className={`${collapsed ? 'w-16' : 'w-60'} bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-r border-slate-200/50 dark:border-slate-800/50 flex flex-col transition-all duration-300 h-screen sticky top-0`}>
      <div className="p-3 flex items-center gap-2">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-violet-500/30">
          <Sparkles className="w-5 h-5 text-white" />
        </div>
        {!collapsed && <span className="font-bold text-lg gradient-text">TimeFlow</span>}
      </div>
      
      <nav className="flex-1 p-2 space-y-1">
        {navItems.map(item => (
          <button
            key={item.id}
            onClick={() => setActiveView(item.id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group relative touch-target ${
              activeView === item.id 
                ? 'bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-950/50 dark:to-purple-950/50 text-violet-600 dark:text-violet-400 shadow-sm' 
                : 'hover:bg-slate-100 dark:hover:bg-slate-800/50'
            }`}
          >
            <item.icon className={`w-5 h-5 flex-shrink-0 transition-colors ${activeView === item.id ? 'text-violet-600 dark:text-violet-400' : 'text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300'}`} />
            {!collapsed && (
              <div className="text-left">
                <div className="font-medium text-sm">{item.label}</div>
                <div className="text-xs text-slate-400 group-hover:text-slate-500">{item.desc}</div>
              </div>
            )}
          </button>
        ))}
      </nav>

      <div className="p-2 border-t border-slate-200/50 dark:border-slate-800/50">
        <button
          onClick={() => setActiveView('settings')}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors touch-target ${activeView === 'settings' ? 'bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-950/50 dark:to-purple-950/50 text-violet-600 dark:text-violet-400' : 'hover:bg-slate-100 dark:hover:bg-slate-800/50'}`}
        >
          <Settings className={`w-5 h-5 ${activeView === 'settings' ? 'text-violet-600 dark:text-violet-400' : 'text-slate-400'}`} />
          {!collapsed && <span className="text-sm">Settings</span>}
        </button>
      </div>
    </aside>
  )
}

function StatCard({ icon: Icon, label, value, color, trend, onClick }) {
  const colors = {
    blue: 'from-blue-500 via-blue-600 to-indigo-600',
    green: 'from-emerald-500 via-green-500 to-teal-600',
    red: 'from-rose-500 via-red-500 to-pink-600',
    purple: 'from-violet-500 via-purple-500 to-fuchsia-600',
    amber: 'from-amber-500 via-orange-500 to-red-500'
  }
  const bgColors = {
    blue: 'bg-blue-50 dark:bg-blue-950/30',
    green: 'bg-emerald-50 dark:bg-emerald-950/30',
    red: 'bg-rose-50 dark:bg-rose-950/30',
    purple: 'bg-violet-50 dark:bg-violet-950/30',
    amber: 'bg-amber-50 dark:bg-amber-950/30'
  }
  return (
    <div 
      onClick={onClick}
      className={`card p-4 sm:p-5 group hover:shadow-lg hover:shadow-slate-200/50 dark:hover:shadow-none transition-all duration-300 cursor-pointer ${onClick ? 'hover:scale-[1.02] active:scale-[0.98]' : ''}`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{label}</p>
          <p className="text-2xl sm:text-3xl font-bold tracking-tight">{value}</p>
          {trend && (
            <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />{trend}
            </p>
          )}
        </div>
        <div className={`w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br ${colors[color]} flex items-center justify-center shadow-lg ${bgColors[color]} group-hover:scale-110 transition-transform duration-300`}>
          <Icon className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
        </div>
      </div>
    </div>
  )
}

function Dashboard({ onNavigate }) {
  const api = useApi()
  const isMountedRef = useRef(true)
  const [stats, setStats] = useState(() => {
    const tasks = storage.get('tasks', [])
    const habits = storage.get('habits', [])
    const today = new Date().toISOString().split('T')[0]
    return {
      totalTasks: tasks.length,
      completedTasks: tasks.filter(t => t.status === 'completed').length,
      overdueTasks: tasks.filter(t => isTaskOverdue(t)).length,
      completionRate: tasks.length > 0 ? Math.round((tasks.filter(t => t.status === 'completed').length / tasks.length) * 100) : 0,
      habitsCompletedToday: habits.filter(h => h.lastCompleted?.startsWith(today)).length,
      totalHabits: habits.length
    }
  })
  const [tasks, setTasks] = useState(() => storage.get('tasks', []).filter(t => t.status !== 'completed'))
  const [habits, setHabits] = useState(() => storage.get('habits', []))
  const { scheduleHabitNotification, cancelHabitNotifications, permission, requestPermission } = useNotifications()

  useEffect(() => {
    isMountedRef.current = true
    Promise.all([api.stats(), api.tasks.list({ status: 'pending' }), api.habits.list()])
      .then(([statsData, tasksData, habitsData]) => {
        if (isMountedRef.current) {
          setStats({ ...statsData, totalHabits: habitsData.length })
          setTasks(tasksData)
          setHabits(habitsData)
        }
      })
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const today = new Date().toISOString().split('T')[0]
  const upcomingTasks = tasks.filter(t => t.dueDate && t.dueDate >= today && !isTaskOverdue(t)).slice(0, 5)
  const overdueTasks = tasks.filter(t => isTaskOverdue(t))
  const todayHabits = habits.filter(h => {
    const lastCompleted = h.lastCompleted?.split('T')[0]
    return lastCompleted !== today
  })

  const handleToggleTask = async (task) => {
    const newStatus = task.status === 'completed' ? 'pending' : 'completed'
    await api.tasks.update(task.id, { status: newStatus })
    Promise.all([api.stats(), api.tasks.list({ status: 'pending' })])
      .then(([statsData, tasksData]) => {
        setStats(prev => ({ ...prev, ...statsData }))
        setTasks(tasksData)
      })
  }

  const handleCompleteHabit = async (habit) => {
    try {
      const updated = await api.habits.complete(habit.id)
      setHabits(habits.map(h => h.id === habit.id ? updated : h))
      setStats(prev => ({ ...prev, habitsCompletedToday: prev.habitsCompletedToday + 1 }))
    } catch {
      console.log('Already completed today')
    }
  }

return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Welcome back!</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{format(new Date(), 'EEEE, MMMM d')}</p>
        </div>
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
          <Sparkles className="w-6 h-6 text-white" />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={CheckSquare} label="Tasks" value={stats.totalTasks} color="blue" onClick={() => onNavigate?.('tasks')} />
        <StatCard icon={CheckCircle2} label="Done" value={stats.completedTasks} color="green" trend={stats.completionRate + '%'} />
        <StatCard icon={AlertTriangle} label="Overdue" value={stats.overdueTasks} color="red" onClick={() => onNavigate?.('overdue')} />
        <StatCard icon={Target} label="Habits" value={`${stats.habitsCompletedToday}/${stats.totalHabits}`} color="purple" onClick={() => onNavigate?.('habits')} />
      </div>

      {todayHabits.length > 0 && (
        <div className="card-glass p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-sm flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                <Target className="w-4 h-4 text-white" />
              </span>
              Today's Habits
            </h2>
            <span className="text-xs font-medium text-slate-500">{todayHabits.length} remaining</span>
          </div>
<div className="flex gap-3 flex-wrap">
            {todayHabits.slice(0, 4).map(habit => (
              <button
                key={habit.id}
                onClick={() => handleCompleteHabit(habit)}
                className="flex flex-col items-center gap-2 min-w-[72px] p-3 rounded-2xl bg-white/60 dark:bg-slate-700/40 hover:bg-white dark:hover:bg-slate-700/60 transition-all group"
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-lg shadow-lg transition-transform group-hover:scale-110"
                  style={{ backgroundColor: habit.color || '#6366f1' }}
                >
                  {(habit.name?.[0] || 'H').toUpperCase()}
                </div>
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate w-full text-center">{habit.name || 'Habit'}</span>
                <span className="text-[10px] text-slate-400">{habit.streak || 0}🔥</span>
              </button>
            ))}
            {todayHabits.length > 4 && (
              <button
                onClick={() => onNavigate?.('habits')}
                className="flex flex-col items-center justify-center gap-2 min-w-[72px] p-3 rounded-2xl bg-violet-100/50 dark:bg-violet-900/30 hover:bg-violet-100 dark:hover:bg-violet-900/50 transition-all"
              >
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white font-bold">
                  +{todayHabits.length - 4}
                </div>
                <span className="text-xs font-medium text-violet-600 dark:text-violet-400">More</span>
              </button>
            )}
          </div>
        </div>
      )}

      {overdueTasks.length > 0 && (
        <div 
          onClick={() => onNavigate?.('overdue')}
          className="card border-rose-200 dark:border-rose-900/50 bg-rose-50/50 dark:bg-rose-950/20 p-4 cursor-pointer hover:shadow-lg transition-all"
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-sm text-rose-700 dark:text-rose-400 flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center animate-pulse-glow">
                <AlertTriangle className="w-4 h-4 text-white" />
              </span>
              Overdue Tasks
            </h2>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-rose-100 dark:bg-rose-900/50 text-rose-600 dark:text-rose-400">{overdueTasks.length}</span>
          </div>
          <div className="space-y-2">
            {overdueTasks.slice(0, 3).map(task => {
              const now = new Date()
              const dueDateTime = new Date(task.dueDate)
              if (task.dueTime) {
                const [hours, minutes] = task.dueTime.split(':').map(Number)
                dueDateTime.setHours(hours, minutes, 0, 0)
              }
              const overdueThreshold = new Date(dueDateTime.getTime() + 45 * 60 * 1000)
              const diffMs = now.getTime() - overdueThreshold.getTime()
              const diffMins = Math.floor(diffMs / (1000 * 60))
              const diffHours = Math.floor(diffMins / 60)
              const diffDays = Math.floor(diffHours / 24)
              
              return (
                <div
                  key={task.id}
                  className="flex items-center gap-3 p-3 rounded-xl bg-white/60 dark:bg-slate-800/40 group"
                >
                  <div className="w-5 h-5 rounded-full border-2 border-rose-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{task.title}</p>
                    <p className="text-xs text-rose-500 font-medium">
                      {diffDays > 0 ? `${diffDays}d overdue` : diffHours > 0 ? `${diffHours}h overdue` : `${diffMins}m overdue`}
                    </p>
                  </div>
                  <span className="text-xs px-2 py-1 rounded-lg font-medium" style={{ color: categoryColors[task.category] || categoryColors.general, backgroundColor: `${categoryColors[task.category] || categoryColors.general}15` }}>
                    {task.category}
                  </span>
                </div>
              )
            })}
          </div>
          <button className="w-full mt-2 py-2 text-sm font-medium text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 transition-colors flex items-center justify-center gap-1">
            <span>View all overdue tasks</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="card-glass p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-sm flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
              <Clock className="w-4 h-4 text-white" />
            </span>
            Upcoming Tasks
          </h2>
          {upcomingTasks.length > 0 && (
            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-violet-100 dark:bg-violet-900/50 text-violet-600 dark:text-violet-400">{upcomingTasks.length}</span>
          )}
        </div>
        {upcomingTasks.length === 0 ? (
          <div className="flex flex-col items-center py-6 text-center">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-900/30 dark:to-teal-900/30 flex items-center justify-center mb-3">
              <CheckCircle2 className="w-7 h-7 text-emerald-500" />
            </div>
            <p className="font-medium text-slate-700 dark:text-slate-300">All caught up!</p>
            <p className="text-xs text-slate-500 mt-1">No upcoming tasks</p>
          </div>
        ) : (
          <div className="space-y-2">
            {upcomingTasks.map(task => (
              <div
                key={task.id}
                onClick={() => handleToggleTask(task)}
                className="flex items-center gap-3 p-3 rounded-xl bg-white/60 dark:bg-slate-700/40 hover:bg-white dark:hover:bg-slate-700/60 transition-all cursor-pointer group"
              >
                <div className={`task-checkbox ${task.status === 'completed' ? 'checked' : ''}`}>
                  {task.status === 'completed' && <CheckCircle2 className="w-4 h-4 text-white" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{task.title}</p>
                  <p className="text-xs text-slate-500">
                    {task.dueDate && (isToday(parseISO(task.dueDate)) ? 'Today' : isTomorrow(parseISO(task.dueDate)) ? 'Tomorrow' : format(parseISO(task.dueDate), 'MMM d'))}
                    {task.dueTime && <span className="ml-1 font-medium">at {task.dueTime}</span>}
                  </p>
                </div>
                <span className="text-xs px-2 py-1 rounded-lg font-medium hidden sm:inline" style={{ color: categoryColors[task.category] || categoryColors.general, backgroundColor: `${categoryColors[task.category] || categoryColors.general}15` }}>
                  {task.category}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function TasksView() {
  const api = useApi()
  const isMountedRef = useRef(true)
  const [tasks, setTasks] = useState(() => storage.get('tasks', []))
  const [categories, setCategories] = useState(() => storage.get('categories', []))
  const [showModal, setShowModal] = useState(false)
  const [editingTask, setEditingTask] = useState(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [successMessage, setSuccessMessage] = useState('')
  const successTimeoutRef = useRef(null)
  const { cancelTaskNotifications } = useNotifications()

  const load = () => Promise.all([api.tasks.list({ search }), api.categories.list()]).then(([t, c]) => {
    if (isMountedRef.current) {
      setTasks(t)
      setCategories(c)
    }
  })
  
  useEffect(() => {
    isMountedRef.current = true
    load()
    return () => {
      isMountedRef.current = false
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current)
      }
    }
  }, [search])

  const showSuccess = (msg) => {
    setSuccessMessage(msg)
    successTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        setSuccessMessage('')
      }
    }, 2000)
  }

  const filteredTasks = tasks.filter(t => {
    if (filter === 'pending') return t.status !== 'completed'
    if (filter === 'completed') return t.status === 'completed'
    if (filter === 'today') return t.dueDate && isToday(parseISO(t.dueDate))
    return true
  })

  const handleToggle = async (task) => {
    await api.tasks.update(task.id, { status: task.status === 'completed' ? 'pending' : 'completed' })
    load()
  }

  const handleDelete = async (task) => {
    if (confirm('Delete this task?')) {
      await cancelTaskNotifications(task.id)
      await api.tasks.delete(task.id)
      load()
    }
  }

return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex items-center justify-between sticky top-0 bg-slate-50 dark:bg-slate-950 z-10 py-2 -mt-2 -mx-1 px-1">
        <div>
          <h1 className="text-xl font-bold">Tasks</h1>
          <p className="text-xs text-gray-500">{filteredTasks.filter(t => t.status !== 'completed').length} pending</p>
        </div>
        <button onClick={() => { setEditingTask(null); setShowModal(true) }} className="btn btn-primary flex items-center gap-2 text-sm shadow-lg shadow-violet-500/25">
          <Plus className="w-4 h-4" /> Add
        </button>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="input pl-9 text-sm" />
        </div>
      </div>

<div className="flex gap-1 flex-wrap pb-1">
        {['all', 'today', 'pending', 'completed'].map(f => (
          <button key={f} onClick={() => setFilter(f)} className={`px-3 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors touch-target ${filter === f ? 'bg-indigo-100 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400' : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {filteredTasks.length === 0 ? (
        <EmptyState icon={CheckSquare} title="No tasks found" description="Create a task to get started" action={<button onClick={() => setShowModal(true)} className="btn btn-primary text-sm">Create Task</button>} />
      ) : (
        <div className="space-y-3">
          {filteredTasks.map(task => {
            const isOverdue = isTaskOverdue(task)
            const priorityConfig = {
              high: { 
                gradient: 'from-rose-500 via-red-500 to-pink-500', 
                bg: 'bg-rose-50 dark:bg-rose-950/20',
                border: 'border-l-rose-500',
                glow: 'shadow-rose-500/20',
                icon: '🔥',
                pulse: true
              },
              medium: { 
                gradient: 'from-amber-400 via-orange-500 to-yellow-500', 
                bg: 'bg-amber-50 dark:bg-amber-950/20',
                border: 'border-l-amber-500',
                glow: 'shadow-amber-500/20',
                icon: '⚡',
                pulse: false
              },
              low: { 
                gradient: 'from-slate-400 via-slate-500 to-slate-600', 
                bg: 'bg-slate-50 dark:bg-slate-800/30',
                border: 'border-l-slate-400',
                glow: 'shadow-slate-500/20',
                icon: '💤',
                pulse: false
              }
            }
            const config = priorityConfig[task.priority] || priorityConfig.medium
            
return (
              <div 
                key={task.id} 
                onClick={() => { setEditingTask(task); setShowModal(true) }} 
                className={`relative card overflow-hidden border-l-4 ${config.border} ${task.status === 'completed' ? 'opacity-60' : ''} group hover:shadow-lg ${config.glow} transition-all duration-300 cursor-pointer`}
              >
                {isOverdue && task.status !== 'completed' && (
                  <div className="absolute top-0 right-0 w-20 h-20 overflow-hidden pointer-events-none">
                    <div className="absolute top-2 -right-6 bg-gradient-to-r from-rose-500 to-pink-500 text-white text-[10px] font-bold px-6 py-0.5 rotate-45 shadow-lg">
                      OVERDUE
                    </div>
                  </div>
                )}
                
                <div className="p-3 sm:p-4">
                  <div className="flex items-start gap-2 sm:gap-3">
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleToggle(task) }} 
                      className={`relative flex-shrink-0 w-6 h-6 sm:w-7 sm:h-7 rounded-full border-2 transition-all duration-300 flex items-center justify-center ${
                        task.status === 'completed' 
                          ? 'bg-gradient-to-r from-emerald-500 to-teal-500 border-transparent scale-110' 
                          : `border-2 hover:scale-110 ${task.priority === 'high' ? 'border-rose-400 hover:bg-rose-100' : task.priority === 'medium' ? 'border-amber-400 hover:bg-amber-100' : 'border-slate-300 hover:bg-slate-100'}`
                      }`}
                    >
                      {task.status === 'completed' && (
                        <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white animate-scale-in" />
                      )}
                    </button>
                    
                    <div className="flex-1 min-w-0 overflow-hidden">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className={`font-medium text-sm truncate max-w-[140px] sm:max-w-none ${task.status === 'completed' ? 'line-through text-gray-400' : ''}`}>
                          {task.title}
                        </p>
                        <span className={`text-xs px-1.5 sm:px-2 py-0.5 rounded-full bg-gradient-to-r ${config.gradient} text-white font-medium flex-shrink-0 ${config.pulse ? 'animate-pulse-subtle' : ''}`}>
                          {config.icon}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-2 sm:gap-3 mt-1.5 sm:mt-2 text-xs flex-wrap">
                        {task.dueDate && (
                          <span className={`flex items-center gap-1 ${isOverdue && task.status !== 'completed' ? 'text-rose-500 font-semibold' : 'text-slate-500'}`}>
                            <Calendar className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate">{isToday(parseISO(task.dueDate)) ? 'Today' : isTomorrow(parseISO(task.dueDate)) ? 'Tomorrow' : format(parseISO(task.dueDate), 'MMM d')}</span>
                            {task.dueTime && <span className="font-medium hidden sm:inline">at {task.dueTime}</span>}
                          </span>
                        )}
                        
                        {task.estimatedMinutes && (
                          <span className="flex items-center gap-1 text-slate-400 flex-shrink-0">
                            <Clock className="w-3 h-3" />
                            {task.estimatedMinutes}m
                          </span>
                        )}
                        
                        <span 
                          className="text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-lg font-medium flex-shrink-0" 
                          style={{ 
                            color: categoryColors[task.category] || categoryColors.general, 
                            backgroundColor: `${categoryColors[task.category] || categoryColors.general}20` 
                          }}
                        >
                          {task.category}
                        </span>
                      </div>
                    </div>
                    
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleDelete(task) }} 
                      className="p-1.5 sm:p-2 opacity-0 group-hover:opacity-100 hover:bg-rose-100 dark:hover:bg-rose-900/30 text-rose-500 rounded-lg transition-all flex-shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

<Modal isOpen={showModal} onClose={() => { setShowModal(false); load() }} title={editingTask ? 'Edit Task' : 'New Task'} variant="task">
        <TaskForm task={editingTask} categories={categories} onClose={() => { setShowModal(false); load(); showSuccess(editingTask ? 'Task updated!' : 'Task created!') }} />
      </Modal>
      
      {successMessage && (
        <div className="fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 bg-gradient-to-r from-emerald-500 to-teal-500 text-white px-5 py-3 rounded-2xl shadow-xl z-50 animate-slide-up">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5" />
            <span className="text-sm font-medium">{successMessage}</span>
          </div>
        </div>
      )}
    </div>
  )
}

function TaskForm({ task, categories, onClose }) {
  const api = useApi()
  const { scheduleTaskNotification, cancelTaskNotifications, permission, requestPermission } = useNotifications()
  const [form, setForm] = useState({
    title: task?.title || '',
    description: task?.description || '',
    category: task?.category || 'general',
    priority: task?.priority || 'medium',
    dueDate: task?.dueDate?.split('T')[0] || '',
    dueTime: task?.dueTime || '',
    reminder: task?.reminder ?? true
  })
  const [errors, setErrors] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  const validate = () => {
    const newErrors = {}
    if (!form.title.trim()) newErrors.title = 'Title is required'
    if (!form.dueDate) newErrors.dueDate = 'Due date is required'
    if (!form.dueTime) newErrors.dueTime = 'Due time is required'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const submit = async (e) => {
    e.preventDefault()
    
    if (!validate()) return
    
    setIsSubmitting(true)
    
    try {
      if (form.reminder && form.dueDate && permission !== 'granted') {
        const granted = await requestPermission()
        if (!granted) {
          alert('Please allow notifications to receive reminders')
        }
      }
      
      if (task) {
        await api.tasks.update(task.id, form)
        if (form.reminder && form.dueDate) {
          await scheduleTaskNotification({ ...form, id: task.id })
        } else {
          await cancelTaskNotifications(task.id)
        }
      } else {
        const newTask = await api.tasks.create(form)
        if (form.reminder && form.dueDate) {
          await scheduleTaskNotification({ ...form, id: newTask.id })
        }
      }
      onClose()
    } catch (error) {
      console.error('Error saving task:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const priorityOptions = [
    { value: 'low', label: 'Low', icon: '💤', color: 'from-slate-400 to-slate-500', desc: 'No rush' },
    { value: 'medium', label: 'Medium', icon: '⚡', color: 'from-amber-400 to-orange-500', desc: 'Normal' },
    { value: 'high', label: 'High', icon: '🔥', color: 'from-rose-500 to-pink-500', desc: 'Urgent' }
  ]

  return (
    <form onSubmit={submit} className="space-y-5" style={{ touchAction: 'pan-y' }}>
      <div className="relative">
        <label className="label flex items-center gap-2">
          <span className="w-5 h-5 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
            <Edit3 className="w-3 h-3 text-white" />
          </span>
          Task Title *
        </label>
        <input 
          type="text" 
          value={form.title} 
          onChange={(e) => setForm({...form, title: e.target.value})} 
          className={`input ${errors.title ? 'border-red-500 ring-2 ring-red-500/20' : ''}`} 
          placeholder="What needs to be done?" 
          autoFocus 
        />
        {errors.title && <p className="text-red-500 text-xs mt-1.5 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{errors.title}</p>}
      </div>
      
      <div>
        <label className="label flex items-center gap-2">
          <span className="w-5 h-5 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white text-[10px] font-bold">P</span>
          Priority Level
        </label>
        <div className="grid grid-cols-3 gap-2">
          {priorityOptions.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setForm({...form, priority: opt.value})}
              className={`relative p-3 rounded-2xl border-2 transition-all text-center ${
                form.priority === opt.value 
                  ? `border-transparent bg-gradient-to-br ${opt.color} text-white shadow-lg scale-105` 
                  : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
              }`}
            >
              <span className="text-lg block">{opt.icon}</span>
              <span className={`text-xs font-semibold ${form.priority === opt.value ? 'text-white' : 'text-slate-600 dark:text-slate-300'}`}>{opt.label}</span>
              {form.priority === opt.value && (
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-white rounded-full flex items-center justify-center shadow">
                  <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
      
      <div>
        <label className="label flex items-center gap-2">
          <span className="w-5 h-5 rounded-lg flex items-center justify-center" style={{ backgroundColor: categoryColors[form.category] || categoryColors.general }}>
            <span className="text-white text-[8px] font-bold">{form.category?.[0]?.toUpperCase() || 'G'}</span>
          </span>
          Category
        </label>
        <select value={form.category} onChange={(e) => setForm({...form, category: e.target.value})} className="input">
          <option value="general">General</option>
          {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
        </select>
      </div>
      
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label flex items-center gap-2">
            <Calendar className="w-5 h-5 text-violet-500" />
            Due Date *
          </label>
          <input 
            type="date" 
            value={form.dueDate} 
            onChange={(e) => setForm({...form, dueDate: e.target.value})} 
            className={`input ${errors.dueDate ? 'border-red-500 ring-2 ring-red-500/20' : ''}`} 
          />
          {errors.dueDate && <p className="text-red-500 text-xs mt-1.5 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{errors.dueDate}</p>}
        </div>
        <div>
          <label className="label flex items-center gap-2">
            <Clock className="w-5 h-5 text-violet-500" />
            Time *
          </label>
          <input 
            type="time" 
            value={form.dueTime} 
            onChange={(e) => setForm({...form, dueTime: e.target.value})} 
            className={`input ${errors.dueTime ? 'border-red-500 ring-2 ring-red-500/20' : ''}`} 
          />
          {errors.dueTime && <p className="text-red-500 text-xs mt-1.5 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{errors.dueTime}</p>}
        </div>
      </div>
      
      <div className={`flex items-center justify-between p-4 rounded-2xl transition-all ${
        form.reminder 
          ? 'bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-950/30 dark:to-purple-950/30 border-2 border-violet-200 dark:border-violet-800' 
          : 'bg-slate-50 dark:bg-slate-700/30'
      }`}>
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
            form.reminder ? 'bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg shadow-violet-500/30' : 'bg-slate-200 dark:bg-slate-600'
          }`}>
            {form.reminder ? <Bell className="w-5 h-5 text-white" /> : <BellOff className="w-5 h-5 text-slate-500 dark:text-slate-400" />}
          </div>
          <div>
            <span className="text-sm font-semibold block">Reminder</span>
            <span className="text-xs text-slate-500">{form.reminder ? 'Get notified before due' : 'No notification'}</span>
          </div>
        </div>
        <button 
          type="button" 
          onClick={() => setForm({...form, reminder: !form.reminder})} 
          className={`w-12 h-7 rounded-full transition-all duration-300 ${form.reminder ? 'bg-gradient-to-r from-violet-500 to-purple-600 shadow-lg shadow-violet-500/30' : 'bg-slate-300 dark:bg-slate-600'}`}
        >
          <div className={`w-5 h-5 bg-white rounded-full shadow-lg transition-transform duration-300 ${form.reminder ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
      </div>
      
      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onClose} className="btn btn-secondary flex-1 py-3.5" disabled={isSubmitting}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary flex-1 py-3.5 shadow-lg shadow-violet-500/25" disabled={isSubmitting}>
          {isSubmitting ? (
            <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Saving...</span>
          ) : (
            <span className="flex items-center gap-2">{task ? <CheckCircle2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />} {task ? 'Save Task' : 'Create Task'}</span>
          )}
        </button>
      </div>
    </form>
  )
}

function CalendarView() {
  const api = useApi()
  const isMountedRef = useRef(true)
  const [currentDate, setCurrentDate] = useState(new Date())
  const [tasks, setTasks] = useState(() => storage.get('tasks', []))
  const [habits, setHabits] = useState(() => storage.get('habits', []))
  const [selectedDate, setSelectedDate] = useState(null)
  const [viewMode, setViewMode] = useState('month')

  useEffect(() => {
    isMountedRef.current = true
    Promise.all([api.tasks.list({}), api.habits.list()]).then(([tasksData, habitsData]) => {
      if (isMountedRef.current) {
        setTasks(tasksData)
        setHabits(habitsData)
      }
    })
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 })
  const days = eachDayOfInterval({ start: calendarStart, end: new Date(Math.max(monthEnd.getTime(), calendarStart.getTime() + 41 * 86400000)) })

  const getTasksForDay = (date) => tasks.filter(t => t.dueDate && isSameDay(parseISO(t.dueDate), date))
  const getHabitsForDay = (date) => {
    const dateStr = format(date, 'yyyy-MM-dd')
    return habits.filter(h => {
      const lastCompleted = h.lastCompleted?.split('T')[0]
      return lastCompleted === dateStr
    })
  }

  const getDayStats = (date) => {
    const dayTasks = getTasksForDay(date)
    const completed = dayTasks.filter(t => t.status === 'completed').length
    const total = dayTasks.length
    const habitsCompleted = getHabitsForDay(date).length
    return { completed, total, habitsCompleted }
  }

  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Calendar</h1>
          <p className="text-xs text-gray-500">{monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}</p>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setCurrentDate(subMonths(currentDate, 1))} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl touch-target transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button onClick={() => setCurrentDate(new Date())} className="btn btn-secondary text-sm px-3">Today</button>
          <button onClick={() => setCurrentDate(addMonths(currentDate, 1))} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl touch-target transition-colors">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="card-glass p-4">
        <div className="grid grid-cols-7 gap-1 mb-2">
          {weekDays.map((d, i) => (
            <div key={i} className={`text-center text-xs font-semibold py-2 ${i === 0 || i === 6 ? 'text-violet-500 dark:text-violet-400' : 'text-gray-500 dark:text-gray-400'}`}>
              {d}
            </div>
          ))}
        </div>
        
        <div className="grid grid-cols-7 gap-1">
          {days.map((day, i) => {
            const dayTasks = getTasksForDay(day)
            const stats = getDayStats(day)
            const isCurrentMonth = isSameMonth(day, currentDate)
            const isSelected = selectedDate && isSameDay(day, selectedDate)
            const isTodayDate = isToday(day)
            const hasCompleted = stats.completed > 0
            const allComplete = stats.total > 0 && stats.completed === stats.total
            
            return (
              <button
                key={i}
                onClick={() => setSelectedDate(day)}
                className={`relative aspect-square flex flex-col items-center justify-center rounded-xl transition-all touch-target ${
                  !isCurrentMonth ? 'opacity-30' : ''
                } ${isSelected 
                  ? 'bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-lg shadow-violet-500/30 scale-105' 
                  : isTodayDate 
                    ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-800/50'
                }`}
              >
                <span className={`text-sm font-semibold ${isSelected ? 'text-white' : ''}`}>{format(day, 'd')}</span>
                
                {dayTasks.length > 0 && (
                  <div className="flex gap-0.5 mt-1">
                    {[...Array(Math.min(dayTasks.length, 3))].map((_, j) => (
                      <div
                        key={j}
                        className={`w-1.5 h-1.5 rounded-full ${
                          isSelected 
                            ? 'bg-white/80' 
                            : allComplete 
                              ? 'bg-emerald-500' 
                              : dayTasks[j]?.priority === 'high' 
                                ? 'bg-red-500' 
                                : 'bg-violet-400'
                        }`}
                      />
                    ))}
                  </div>
                )}
                
                {stats.total > 0 && !isSelected && (
                  <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-8 h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-full transition-all"
                      style={{ width: `${(stats.completed / stats.total) * 100}%` }}
                    />
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="card p-3 text-center">
          <p className="text-2xl font-bold text-violet-600 dark:text-violet-400">{tasks.filter(t => isToday(parseISO(t.dueDate))).length}</p>
          <p className="text-xs text-gray-500">Today</p>
        </div>
        <div className="card p-3 text-center">
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{tasks.filter(t => t.status === 'completed').length}</p>
          <p className="text-xs text-gray-500">Completed</p>
        </div>
        <div className="card p-3 text-center">
          <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{tasks.filter(t => t.dueDate && isPast(parseISO(t.dueDate)) && t.status !== 'completed').length}</p>
          <p className="text-xs text-gray-500">Overdue</p>
        </div>
      </div>

      {selectedDate && (
        <div className="card p-4 animate-slide-up">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-bold text-base">{isToday(selectedDate) ? 'Today' : format(selectedDate, 'EEEE')}</h3>
              <p className="text-xs text-gray-500">{format(selectedDate, 'MMMM d, yyyy')}</p>
            </div>
            <button onClick={() => setSelectedDate(null)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
          
          {getTasksForDay(selectedDate).length === 0 ? (
            <div className="flex flex-col items-center py-6">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-900/30 dark:to-teal-900/30 flex items-center justify-center mb-3">
                <CheckCircle2 className="w-7 h-7 text-emerald-500" />
              </div>
              <p className="font-medium text-slate-700 dark:text-slate-300">No tasks</p>
              <p className="text-xs text-slate-500">Enjoy your free time!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {getTasksForDay(selectedDate).map(t => (
                <div 
                  key={t.id} 
                  className={`flex items-center gap-3 p-3 rounded-xl transition-colors ${
                    t.status === 'completed' 
                      ? 'bg-emerald-50 dark:bg-emerald-900/20' 
                      : 'bg-gray-50 dark:bg-gray-800/50'
                  }`}
                >
                  <div className={`w-3 h-3 rounded-full flex-shrink-0 ${
                    t.status === 'completed' 
                      ? 'bg-emerald-500' 
                      : t.priority === 'high' 
                        ? 'bg-red-500' 
                        : t.priority === 'medium' 
                          ? 'bg-amber-500' 
                          : 'bg-gray-400'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${t.status === 'completed' ? 'line-through text-gray-400' : ''}`}>
                      {t.title}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {t.dueTime && (
                        <span className="text-xs text-gray-500 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {t.dueTime}
                        </span>
                      )}
                      {t.category && (
                        <span 
                          className="text-xs px-1.5 py-0.5 rounded-full"
                          style={{ 
                            color: categoryColors[t.category] || categoryColors.general, 
                            backgroundColor: `${categoryColors[t.category] || categoryColors.general}20` 
                          }}
                        >
                          {t.category}
                        </span>
                      )}
                    </div>
                  </div>
                  {t.status === 'completed' && (
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                  )}
                </div>
              ))}
            </div>
          )}
          
          {getHabitsForDay(selectedDate).length > 0 && (
            <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700">
              <p className="text-xs font-semibold text-gray-500 mb-2">Habits Completed</p>
              <div className="flex flex-wrap gap-2">
                {getHabitsForDay(selectedDate).map(h => (
                  <div 
                    key={h.id}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-gray-50 dark:bg-gray-800/50"
                  >
                    <div 
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: h.color || '#6366f1' }}
                    />
                    <span className="text-xs font-medium">{h.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function OverdueView({ onNavigate }) {
  const api = useApi()
  const isMountedRef = useRef(true)
  const [tasks, setTasks] = useState(() => storage.get('tasks', []))
  const [categories, setCategories] = useState(() => storage.get('categories', []))
  const [showModal, setShowModal] = useState(false)
  const [editingTask, setEditingTask] = useState(null)
  const [successMessage, setSuccessMessage] = useState('')
  const successTimeoutRef = useRef(null)
  const { cancelTaskNotifications } = useNotifications()

  const load = () => Promise.all([api.tasks.list({}), api.categories.list()]).then(([t, c]) => {
    if (isMountedRef.current) {
      setTasks(t)
      setCategories(c)
    }
  })
  
  useEffect(() => {
    isMountedRef.current = true
    load()
    return () => {
      isMountedRef.current = false
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current)
      }
    }
  }, [])

  const showSuccess = (msg) => {
    setSuccessMessage(msg)
    successTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        setSuccessMessage('')
      }
    }, 2000)
  }

  const overdueTasks = tasks.filter(t => isTaskOverdue(t))

  const formatOverdueTime = (task) => {
    const now = new Date()
    const dueDateTime = new Date(task.dueDate)
    
    if (task.dueTime) {
      const [hours, minutes] = task.dueTime.split(':').map(Number)
      dueDateTime.setHours(hours, minutes, 0, 0)
    } else {
      dueDateTime.setHours(23, 59, 59, 999)
    }
    
    const overdueThreshold = new Date(dueDateTime.getTime() + 45 * 60 * 1000)
    const diffMs = now.getTime() - overdueThreshold.getTime()
    const diffMins = Math.floor(diffMs / (1000 * 60))
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)
    
    if (diffDays > 0) return `${diffDays}d overdue`
    if (diffHours > 0) return `${diffHours}h overdue`
    if (diffMins > 0) return `${diffMins}m overdue`
    return 'Just overdue'
  }

  const handleToggle = async (task) => {
    await api.tasks.update(task.id, { status: 'completed', completedAt: new Date().toISOString() })
    load()
    showSuccess('Task completed!')
  }

  const handleEdit = (task) => {
    setEditingTask(task)
    setShowModal(true)
  }

  const handleDelete = async (task) => {
    if (confirm('Delete this task?')) {
      await cancelTaskNotifications(task.id)
      await api.tasks.delete(task.id)
      load()
      showSuccess('Task deleted!')
    }
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-rose-600 dark:text-rose-400">Overdue Tasks</h1>
          <p className="text-xs text-gray-500">{overdueTasks.length} tasks need attention</p>
        </div>
        {overdueTasks.length > 0 && (
          <div className="px-3 py-1.5 rounded-xl bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 text-sm font-semibold animate-pulse-glow">
            {overdueTasks.length} overdue
          </div>
        )}
      </div>

      {overdueTasks.length === 0 ? (
        <div className="card p-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-900/30 dark:to-teal-900/30 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-emerald-500" />
          </div>
          <h3 className="font-semibold text-lg">No overdue tasks!</h3>
          <p className="text-sm text-gray-500 mt-1">You're all caught up. Great job!</p>
          <button onClick={() => onNavigate?.('dashboard')} className="btn btn-primary mt-4 text-sm">
            Back to Dashboard
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {overdueTasks.map(task => (
            <div 
              key={task.id} 
              className="card p-4 border-rose-200 dark:border-rose-900/50 bg-rose-50/30 dark:bg-rose-950/10"
            >
              <div className="flex items-start gap-3">
                <button 
                  onClick={() => handleToggle(task)}
                  className="mt-0.5 w-6 h-6 rounded-full border-2 border-rose-400 hover:bg-rose-500 hover:border-rose-500 transition-colors flex items-center justify-center flex-shrink-0 group"
                >
                  <CheckCircle2 className="w-4 h-4 text-transparent group-hover:text-white transition-colors" />
                </button>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{task.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-rose-500 font-semibold flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      {formatOverdueTime(task)}
                    </span>
                    {task.dueTime && (
                      <span className="text-xs text-gray-500">
                        Was due at {task.dueTime}
                      </span>
                    )}
                  </div>
                  {task.description && (
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">{task.description}</p>
                  )}
                </div>
                <span className="text-xs px-2 py-1 rounded-lg font-medium flex-shrink-0" style={{ color: categoryColors[task.category] || categoryColors.general, backgroundColor: `${categoryColors[task.category] || categoryColors.general}15` }}>
                  {task.category}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-rose-100 dark:border-rose-900/30">
                <button 
                  onClick={() => handleEdit(task)}
                  className="flex-1 btn btn-secondary text-sm py-2 flex items-center justify-center gap-1"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  Edit Task
                </button>
                <button 
                  onClick={() => handleDelete(task)}
                  className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 rounded-lg"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={showModal} onClose={() => { setShowModal(false); load() }} title="Edit Overdue Task">
        <OverdueTaskForm 
          task={editingTask} 
          categories={categories} 
          onClose={() => { setShowModal(false); load(); showSuccess('Task updated!') }} 
        />
      </Modal>
      
      {successMessage && (
        <div className="fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 bg-emerald-500 text-white px-4 py-2 rounded-xl shadow-lg z-50 animate-fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            <span className="text-sm font-medium">{successMessage}</span>
          </div>
        </div>
      )}
    </div>
  )
}

function OverdueTaskForm({ task, categories, onClose }) {
  const api = useApi()
  const [form, setForm] = useState({
    title: task?.title || '',
    description: task?.description || '',
    category: task?.category || 'general',
    priority: task?.priority || 'medium',
    dueDate: task?.dueDate?.split('T')[0] || '',
    dueTime: task?.dueTime || '',
    status: task?.status || 'pending',
    markCompleted: false
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setIsSubmitting(true)
    
    try {
      const updateData = {
        title: form.title,
        description: form.description,
        category: form.category,
        priority: form.priority,
        dueDate: form.dueDate,
        dueTime: form.dueTime,
        status: form.markCompleted ? 'completed' : 'pending'
      }
      
      if (form.markCompleted) {
        updateData.completedAt = new Date().toISOString()
      }
      
      await api.tasks.update(task.id, updateData)
      onClose()
    } catch (error) {
      console.error('Error saving task:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5" style={{ touchAction: 'pan-y' }}>
      <div>
        <label className="label">Task Title</label>
        <input 
          type="text" 
          value={form.title} 
          onChange={(e) => setForm({...form, title: e.target.value})} 
          className="input" 
        />
      </div>
      
      <div>
        <label className="label">Description</label>
        <textarea 
          value={form.description} 
          onChange={(e) => setForm({...form, description: e.target.value})} 
          className="input min-h-[80px] resize-none" 
        />
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Category</label>
          <select value={form.category} onChange={(e) => setForm({...form, category: e.target.value})} className="input">
            <option value="general">General</option>
            {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Priority</label>
          <select value={form.priority} onChange={(e) => setForm({...form, priority: e.target.value})} className="input">
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Due Date</label>
          <input 
            type="date" 
            value={form.dueDate} 
            onChange={(e) => setForm({...form, dueDate: e.target.value})} 
            className="input" 
          />
        </div>
        <div>
          <label className="label">Time</label>
          <input 
            type="time" 
            value={form.dueTime} 
            onChange={(e) => setForm({...form, dueTime: e.target.value})} 
            className="input" 
          />
        </div>
      </div>
      
      <div className="flex items-center justify-between p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-900/30">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-500" />
          <div>
            <span className="text-sm font-medium">Mark as completed</span>
            <p className="text-xs text-gray-500">If you actually finished this task</p>
          </div>
        </div>
        <button 
          type="button" 
          onClick={() => setForm({...form, markCompleted: !form.markCompleted})} 
          className={`w-12 h-7 rounded-full transition-colors ${form.markCompleted ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`}
        >
          <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${form.markCompleted ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
      </div>
      
      <div className="flex gap-3 pt-4">
        <button type="button" onClick={onClose} className="btn btn-secondary flex-1" disabled={isSubmitting}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary flex-1" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </form>
  )
}

function PomodoroTimer() {
  const [timerSettings, setTimerSettings] = useState(() => getTimerSettings())
  const [minutes, setMinutes] = useState(() => getTimerSettings().pomodoroDuration)
  const [seconds, setSeconds] = useState(0)
  const [totalSeconds, setTotalSeconds] = useState(() => getTimerSettings().pomodoroDuration * 60)
  const [isRunning, setIsRunning] = useState(false)
  const [mode, setMode] = useState('focus')
  const [sessions, setSessions] = useState(() => {
    const today = new Date().toISOString().split('T')[0]
    const saved = storage.get('timerSessions')
    if (saved?.date === today) return saved.count
    return 0
  })
  const [customMinutes, setCustomMinutes] = useState(() => getTimerSettings().pomodoroDuration)

  const saveTimerSetting = (key, value) => {
    const saved = storage.get('appSettings') || {}
    const newSettings = { ...saved, [key]: value }
    storage.set('appSettings', newSettings)
    setTimerSettings(getTimerSettings())
  }

  const getSettingKeyForMode = (modeName) => {
    const mapping = {
      focus: 'pomodoroDuration',
      short: 'shortBreakDuration',
      long: 'longBreakDuration',
      study: 'studyDuration',
      workout: 'workoutDuration'
    }
    return mapping[modeName] || 'pomodoroDuration'
  }

  const getDurationForMode = (modeName) => {
    const mapping = {
      focus: timerSettings.pomodoroDuration,
      short: timerSettings.shortBreakDuration,
      long: timerSettings.longBreakDuration,
      study: timerSettings.studyDuration || 50,
      workout: timerSettings.workoutDuration || 30
    }
    return mapping[modeName] || timerSettings.pomodoroDuration
  }

  const updateCustomMinutes = (value) => {
    const clampedValue = Math.max(1, Math.min(120, value))
    setCustomMinutes(clampedValue)
    const settingKey = getSettingKeyForMode(mode)
    saveTimerSetting(settingKey, clampedValue)
    setMinutes(clampedValue)
    setSeconds(0)
    setTotalSeconds(clampedValue * 60)
  }

  useEffect(() => {
    setCustomMinutes(getDurationForMode(mode))
  }, [mode, timerSettings])

  const presets = [
    { label: 'Focus', mins: timerSettings.pomodoroDuration, icon: Brain, desc: 'Deep work', color: 'from-violet-500 to-purple-600' },
    { label: 'Short', mins: timerSettings.shortBreakDuration, icon: Coffee, desc: 'Break', color: 'from-emerald-500 to-teal-600' },
    { label: 'Long', mins: timerSettings.longBreakDuration, icon: Zap, desc: 'Rest', color: 'from-amber-500 to-orange-600' },
    { label: 'Study', mins: timerSettings.studyDuration || 50, icon: BookOpen, desc: 'Extended', color: 'from-blue-500 to-indigo-600' },
    { label: 'Workout', mins: timerSettings.workoutDuration || 30, icon: Dumbbell, desc: 'Exercise', color: 'from-rose-500 to-pink-600' },
  ]

  const startTimer = () => {
    setTotalSeconds(minutes * 60 + seconds)
    setIsRunning(true)
  }

  useEffect(() => {
    let interval
    if (isRunning && (minutes > 0 || seconds > 0)) {
      interval = setInterval(() => {
        if (seconds === 0) {
          if (minutes === 0) {
            setIsRunning(false)
            if (mode === 'focus') setSessions(s => s + 1)
            new Notification('Timer Complete!').catch(() => {})
          } else {
            setMinutes(m => m - 1)
            setSeconds(59)
          }
        } else {
          setSeconds(s => s - 1)
        }
      }, 1000)
    }
    return () => clearInterval(interval)
  }, [isRunning, minutes, seconds, mode])

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0]
    storage.set('timerSessions', { date: today, count: sessions })
  }, [sessions])

  const selectPreset = (preset) => {
    setMinutes(preset.mins)
    setSeconds(0)
    setTotalSeconds(preset.mins * 60)
    setMode(preset.label.toLowerCase())
    setCustomMinutes(preset.mins)
    setIsRunning(false)
  }

  const reset = () => {
    const duration = getDurationForMode(mode)
    setMinutes(duration)
    setSeconds(0)
    setTotalSeconds(duration * 60)
    setIsRunning(false)
  }

  const progress = () => {
    const remaining = minutes * 60 + seconds
    return (totalSeconds - remaining) / totalSeconds
  }

  const formatTime = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  const currentPreset = presets.find(p => p.label.toLowerCase() === mode)

  return (
    <div className="space-y-5 pb-24 md:pb-4">
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Focus Timer</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Stay productive with timed sessions</p>
      </div>

      <div className="card-glass p-6 sm:p-8">
        <div className="grid grid-cols-5 gap-2 sm:gap-3 mb-8">
          {presets.map(p => (
            <button
              key={p.label}
              onClick={() => selectPreset(p)}
              className={`flex flex-col items-center gap-1.5 py-3 px-2 sm:px-3 rounded-2xl transition-all touch-target ${
                mode === p.label.toLowerCase()
                  ? `bg-gradient-to-br ${p.color} text-white shadow-lg scale-105`
                  : 'bg-white/60 dark:bg-slate-700/40 hover:bg-white dark:hover:bg-slate-700/60'
              }`}
            >
              <p.icon className={`w-5 h-5 ${mode === p.label.toLowerCase() ? 'text-white' : 'text-slate-500 dark:text-slate-400'}`} />
              <span className={`text-xs font-semibold ${mode === p.label.toLowerCase() ? 'text-white' : 'text-slate-600 dark:text-slate-300'}`}>{p.label}</span>
              <span className={`text-[10px] ${mode === p.label.toLowerCase() ? 'text-white/80' : 'text-slate-400'}`}>{p.mins}m</span>
            </button>
          ))}
        </div>

        <div className="relative w-56 h-56 sm:w-64 sm:h-64 mx-auto mb-8">
          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-violet-100 to-purple-100 dark:from-violet-900/30 dark:to-purple-900/30 blur-xl opacity-50" />
          <svg className="w-full h-full progress-ring relative z-10">
            <circle
              cx="50%"
              cy="50%"
              r="45%"
              fill="none"
              stroke="currentColor"
              strokeWidth="8"
              className="text-slate-200 dark:text-slate-700"
            />
            <circle
              cx="50%"
              cy="50%"
              r="45%"
              fill="none"
              stroke="url(#timerGradient)"
              strokeWidth="8"
              strokeDasharray={1000}
              strokeDashoffset={1000 * (1 - progress())}
              strokeLinecap="round"
              className="transition-all duration-1000 drop-shadow-lg"
            />
            <defs>
              <linearGradient id="timerGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#8b5cf6" />
                <stop offset="50%" stopColor="#a855f7" />
                <stop offset="100%" stopColor="#c084fc" />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center z-20">
            <span className="timer-display text-5xl sm:text-6xl font-bold tracking-tight">{formatTime}</span>
            <span className="text-slate-400 text-sm mt-2 font-medium capitalize">{mode}</span>
          </div>
        </div>

        <div className="flex justify-center gap-3 mb-6">
          <button
            onClick={() => {
              if (isRunning) {
                setIsRunning(false)
              } else {
                if (totalSeconds === 0 || (!isRunning && minutes === 0 && seconds === 0)) {
                  const duration = getDurationForMode(mode)
                  setMinutes(duration)
                  setSeconds(0)
                  setTotalSeconds(duration * 60)
                }
                setIsRunning(true)
              }
            }}
            className={`btn ${isRunning ? 'btn-secondary' : 'btn-primary'} px-8 py-3 rounded-2xl text-base font-semibold`}
          >
            {isRunning ? <><Pause className="w-5 h-5" /> Pause</> : <><Play className="w-5 h-5" /> Start</>}
          </button>
          <button onClick={reset} className="btn btn-secondary p-3 rounded-2xl">
            <RotateCcw className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-3 p-4 rounded-2xl bg-white/40 dark:bg-slate-700/30">
          <div className="flex items-center gap-2">
            <button 
              onClick={() => updateCustomMinutes(customMinutes - 5)}
              className="w-10 h-10 rounded-xl bg-gray-200 dark:bg-gray-600 flex items-center justify-center hover:bg-gray-300 dark:hover:bg-gray-500 font-bold text-lg"
            >
              -
            </button>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={customMinutes}
              onChange={(e) => {
                const val = e.target.value.replace(/[^0-9]/g, '')
                if (val === '' || val === '0') {
                  setCustomMinutes(1)
                } else {
                  const num = Math.min(120, parseInt(val))
                  setCustomMinutes(num)
                }
              }}
              onBlur={() => {
                const settingKey = getSettingKeyForMode(mode)
                if (!customMinutes || customMinutes < 1) {
                  setCustomMinutes(1)
                  saveTimerSetting(settingKey, 1)
                  setMinutes(1)
                } else {
                  saveTimerSetting(settingKey, customMinutes)
                  setMinutes(customMinutes)
                }
              }}
              className="input w-16 text-center font-bold text-lg"
            />
            <button 
              onClick={() => updateCustomMinutes(customMinutes + 5)}
              className="w-10 h-10 rounded-xl bg-gray-200 dark:bg-gray-600 flex items-center justify-center hover:bg-gray-300 dark:hover:bg-gray-500 font-bold text-lg"
            >
              +
            </button>
          </div>
          <span className="text-sm text-slate-500 font-medium">min</span>
          <button 
            onClick={() => {
              setMinutes(customMinutes)
              setSeconds(0)
              setTotalSeconds(customMinutes * 60)
              setIsRunning(false)
            }} 
            className="btn btn-primary ml-auto text-sm font-semibold"
          >
            Apply
          </button>
        </div>
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium">Sessions Today</p>
              <p className="text-2xl font-bold">{sessions}</p>
            </div>
          </div>
          <div className="flex gap-2">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className={`w-3 h-8 rounded-full transition-all duration-300 ${
                  i < sessions
                    ? 'bg-gradient-to-t from-violet-500 to-purple-500 shadow-sm shadow-violet-500/30'
                    : 'bg-slate-200 dark:bg-slate-700'
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function HabitsView() {
  const api = useApi()
  const isMountedRef = useRef(true)
  const successTimeoutRef = useRef(null)
  const [habits, setHabits] = useState(() => storage.get('habits', []))
  const [showModal, setShowModal] = useState(false)
  const [editingHabit, setEditingHabit] = useState(null)
  const [successMessage, setSuccessMessage] = useState('')
  const { scheduleHabitNotification, cancelHabitNotifications } = useNotifications()

  useEffect(() => {
    isMountedRef.current = true
    api.habits.list().then(data => {
      if (isMountedRef.current) {
        setHabits(data)
      }
    })
    return () => {
      isMountedRef.current = false
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current)
      }
    }
  }, [])

  const showSuccess = (msg) => {
    setSuccessMessage(msg)
    successTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        setSuccessMessage('')
      }
    }, 2000)
  }

  const handleComplete = async (id) => {
    try {
      const updated = await api.habits.complete(id)
      setHabits(habits.map(h => h.id === id ? updated : h))
      showSuccess('Habit completed! +1 streak')
    } catch { alert('Already completed today!') }
  }

  const handleDelete = async (habit) => {
    if (confirm('Delete this habit?')) {
      await cancelHabitNotifications(habit.id)
      await api.habits.delete(habit.id)
      setHabits(habits.filter(h => h.id !== habit.id))
    }
  }

return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex items-center justify-between sticky top-0 bg-slate-50 dark:bg-slate-950 z-10 py-2 -mt-2 -mx-1 px-1">
        <div>
          <h1 className="text-xl font-bold">Habits</h1>
          <p className="text-xs text-gray-500">Build consistent daily routines</p>
        </div>
        <button onClick={() => { setEditingHabit(null); setShowModal(true) }} className="btn btn-primary flex items-center gap-2 text-sm shadow-lg shadow-violet-500/25"><Plus className="w-4 h-4" /> Add</button>
      </div>

      {habits.length === 0 ? (
        <EmptyState icon={Target} title="No habits yet" description="Start building better habits" action={<button onClick={() => setShowModal(true)} className="btn btn-primary text-sm">Create Habit</button>} />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:gap-4">
          {habits.map(h => {
            const today = new Date().toISOString().split('T')[0]
            const isCompletedToday = h.lastCompleted?.startsWith(today)
            const streakLevel = h.streak >= 30 ? 'master' : h.streak >= 14 ? 'pro' : h.streak >= 7 ? 'consistent' : h.streak >= 3 ? 'starter' : 'beginner'
            const streakConfig = {
              master: { emoji: '👑', label: 'Master', bg: 'from-amber-400 via-yellow-500 to-orange-500', ring: '#f59e0b' },
              pro: { emoji: '🔥', label: 'Pro', bg: 'from-rose-400 via-red-500 to-pink-500', ring: '#ef4444' },
              consistent: { emoji: '⚡', label: 'Consistent', bg: 'from-violet-400 via-purple-500 to-indigo-500', ring: '#8b5cf6' },
              starter: { emoji: '🌱', label: 'Starter', bg: 'from-emerald-400 via-green-500 to-teal-500', ring: '#10b981' },
              beginner: { emoji: '⭐', label: 'Beginner', bg: 'from-slate-400 via-slate-500 to-slate-600', ring: '#64748b' }
            }
            const config = streakConfig[streakLevel]
            const progress = Math.min((h.streak / 30) * 100, 100)
            
return (
              <div 
                key={h.id} 
                onClick={() => { setEditingHabit(h); setShowModal(true) }} 
                className={`relative card overflow-hidden group hover:shadow-xl transition-all duration-300 cursor-pointer ${isCompletedToday ? 'ring-2 ring-emerald-400 ring-offset-2 dark:ring-offset-slate-900' : ''}`}
              >
                <div 
                  className="absolute inset-0 opacity-5"
                  style={{ background: `linear-gradient(135deg, ${h.color}33 0%, transparent 50%)` }}
                />
                
                <div className="relative p-3 sm:p-4">
                  <div className="flex items-center justify-between mb-2 sm:mb-3">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div 
                        className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl flex items-center justify-center text-white font-bold text-base sm:text-lg shadow-lg flex-shrink-0"
                        style={{ backgroundColor: h.color || '#6366f1' }}
                      >
                        {(h.name?.[0] || 'H').toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="font-semibold text-sm truncate block">{h.name}</span>
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gradient-to-r ${config.bg} text-white inline-block mt-0.5`}>
                          {config.emoji} {config.label}
                        </span>
                      </div>
                    </div>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleDelete(h) }} 
                      className="p-1 sm:p-1.5 opacity-0 group-hover:opacity-100 hover:bg-rose-100 dark:hover:bg-rose-900/30 rounded-lg text-rose-500 transition-all flex-shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 sm:gap-3">
                      <div className="relative w-12 h-12 sm:w-16 sm:h-16 flex-shrink-0">
                        <svg className="w-full h-full progress-ring" viewBox="0 0 36 36">
                          <circle
                            cx="18"
                            cy="18"
                            r="16"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            className="text-slate-200 dark:text-slate-700"
                          />
                          <circle
                            cx="18"
                            cy="18"
                            r="16"
                            fill="none"
                            stroke={config.ring}
                            strokeWidth="3"
                            strokeDasharray={`${progress} 100`}
                            strokeLinecap="round"
                            className="transition-all duration-500"
                          />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-sm sm:text-lg font-bold" style={{ color: h.color }}>{h.streak}</span>
                        </div>
                      </div>
                      <div className="hidden sm:block">
                        <p className="text-xs text-gray-500">day streak</p>
                        <p className="text-[10px] text-gray-400">Best: {h.bestStreak || h.streak}</p>
                      </div>
                    </div>
                    
                    <button 
                      onClick={(e) => { 
                        e.stopPropagation()
                        if (!isCompletedToday) handleComplete(h.id)
                      }} 
                      className={`w-12 h-12 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl flex items-center justify-center transition-all duration-300 flex-shrink-0 ${
                        isCompletedToday 
                          ? 'bg-gradient-to-br from-emerald-400 to-teal-500 shadow-lg shadow-emerald-500/30' 
                          : 'bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 hover:scale-105'
                      }`}
                      disabled={isCompletedToday}
                    >
                      {isCompletedToday ? (
                        <CheckCircle2 className="w-6 h-6 sm:w-7 sm:h-7 text-white animate-scale-in" />
                      ) : (
                        <div className="text-slate-400 dark:text-slate-300">
                          <Target className="w-5 h-5 sm:w-6 sm:h-6" />
                        </div>
                      )}
                    </button>
                  </div>
                  
                  {isCompletedToday && (
                    <div className="mt-2 sm:mt-3 pt-2 sm:pt-3 border-t border-slate-100 dark:border-slate-700">
                      <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        Completed today!
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

<Modal isOpen={showModal} onClose={() => { setShowModal(false); api.habits.list().then(setHabits) }} title={editingHabit ? 'Edit Habit' : 'New Habit'} variant="habit">
        <HabitForm habit={editingHabit} onClose={() => { setShowModal(false); api.habits.list().then(setHabits); showSuccess(editingHabit ? 'Habit updated!' : 'Habit created!') }} />
      </Modal>
      
      {successMessage && (
        <div className="fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 bg-gradient-to-r from-emerald-500 to-teal-500 text-white px-5 py-3 rounded-2xl shadow-xl z-50 animate-slide-up">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5" />
            <span className="text-sm font-medium">{successMessage}</span>
          </div>
        </div>
      )}
    </div>
  )
}

function HabitForm({ habit, onClose }) {
  const api = useApi()
  const { scheduleHabitNotification, cancelHabitNotifications, permission, requestPermission } = useNotifications()
const [form, setForm] = useState({
    name: habit?.name || '',
    color: habit?.color || '#6366f1',
    icon: habit?.icon || '💪',
    reminder: habit?.reminder ?? true,
    reminderTime: habit?.reminderTime || '09:00'
  })
  const [errors, setErrors] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const colors = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#6366f1']

  const validate = () => {
    const newErrors = {}
    if (!form.name.trim()) newErrors.name = 'Habit name is required'
    if (!form.reminderTime) newErrors.reminderTime = 'Reminder time is required'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const submit = async (e) => {
    e.preventDefault()
    
    if (!validate()) return
    
    setIsSubmitting(true)
    
    try {
      if (form.reminder && permission !== 'granted') {
        await requestPermission()
      }
      
      if (habit) {
        await api.habits.update(habit.id, form)
        if (form.reminder) {
          await scheduleHabitNotification({ ...form, id: habit.id })
        } else {
          await cancelHabitNotifications(habit.id)
        }
      } else {
        const newHabit = await api.habits.create(form)
        if (form.reminder) {
          await scheduleHabitNotification({ ...form, id: newHabit.id })
        }
      }
      onClose()
    } catch (error) {
      console.error('Error saving habit:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

const habitIcons = ['💪', '📚', '🧘', '🏃', '💧', '🎯', '✨', '🍎']
  
  return (
    <form onSubmit={submit} className="space-y-5" style={{ touchAction: 'pan-y' }}>
      <div className="relative">
        <label className="label flex items-center gap-2">
          <span className="w-5 h-5 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
            <Edit3 className="w-3 h-3 text-white" />
          </span>
          Habit Name *
        </label>
        <input 
          type="text" 
          value={form.name} 
          onChange={(e) => setForm({...form, name: e.target.value})} 
          className={`input ${errors.name ? 'border-red-500 ring-2 ring-red-500/20' : ''}`} 
          placeholder="e.g., Exercise, Read, Meditate" 
          autoFocus 
        />
        {errors.name && <p className="text-red-500 text-xs mt-1.5 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{errors.name}</p>}
      </div>
      
      <div>
        <label className="label flex items-center gap-2">
          <span className="w-5 h-5 rounded-lg" style={{ backgroundColor: form.color }}>
            <span className="flex items-center justify-center w-full h-full text-white text-[8px] font-bold">{form.name?.[0]?.toUpperCase() || 'H'}</span>
          </span>
          Choose Color
        </label>
        <div className="flex gap-3 flex-wrap">
          {colors.map(c => (
            <button 
              type="button" 
              key={c} 
              onClick={() => setForm({...form, color: c})} 
              className={`w-12 h-12 rounded-2xl transition-all ${form.color === c ? 'ring-2 ring-offset-2 ring-emerald-500 scale-110 shadow-lg' : 'hover:scale-105'} flex items-center justify-center`}
              style={{ backgroundColor: c }} 
            >
              {form.color === c && <CheckCircle2 className="w-5 h-5 text-white" />}
            </button>
          ))}
        </div>
      </div>
      
      <div>
        <label className="label flex items-center gap-2">
          <span className="w-5 h-5 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white text-[10px] font-bold">
            ✨
          </span>
          Icon
        </label>
        <div className="flex gap-2 flex-wrap">
          {habitIcons.map(icon => (
            <button
              type="button"
              key={icon}
              onClick={() => setForm({...form, icon})}
              className={`w-12 h-12 rounded-2xl text-xl flex items-center justify-center transition-all ${
                form.icon === icon 
                  ? 'bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-900/30 dark:to-teal-900/30 ring-2 ring-emerald-500 scale-105' 
                  : 'bg-slate-100 dark:bg-slate-700/50 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {icon}
            </button>
          ))}
        </div>
      </div>
      
      <div className={`flex items-center justify-between p-4 rounded-2xl transition-all ${
        form.reminder 
          ? 'bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 border-2 border-emerald-200 dark:border-emerald-800' 
          : 'bg-slate-50 dark:bg-slate-700/30'
      }`}>
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
            form.reminder ? 'bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/30' : 'bg-slate-200 dark:bg-slate-600'
          }`}>
            {form.reminder ? <Bell className="w-5 h-5 text-white" /> : <BellOff className="w-5 h-5 text-slate-500 dark:text-slate-400" />}
          </div>
          <div>
            <span className="text-sm font-semibold block">Daily Reminder</span>
            <span className="text-xs text-slate-500">{form.reminder ? 'Get notified daily' : 'No notification'}</span>
          </div>
        </div>
        <button 
          type="button" 
          onClick={() => setForm({...form, reminder: !form.reminder})} 
          className={`w-12 h-7 rounded-full transition-all duration-300 ${form.reminder ? 'bg-gradient-to-r from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/30' : 'bg-slate-300 dark:bg-slate-600'}`}
        >
          <div className={`w-5 h-5 bg-white rounded-full shadow-lg transition-transform duration-300 ${form.reminder ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
      </div>
      
      {form.reminder && (
        <div>
          <label className="label flex items-center gap-2">
            <Clock className="w-5 h-5 text-emerald-500" />
            Reminder Time *
          </label>
          <input 
            type="time" 
            value={form.reminderTime} 
            onChange={(e) => setForm({...form, reminderTime: e.target.value})} 
            className={`input ${errors.reminderTime ? 'border-red-500 ring-2 ring-red-500/20' : ''}`} 
          />
          {errors.reminderTime && <p className="text-red-500 text-xs mt-1.5 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{errors.reminderTime}</p>}
        </div>
      )}
      
      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onClose} className="btn btn-secondary flex-1 py-3.5" disabled={isSubmitting}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary flex-1 py-3.5 shadow-lg shadow-emerald-500/25" disabled={isSubmitting}>
          {isSubmitting ? (
            <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Saving...</span>
          ) : (
            <span className="flex items-center gap-2">{habit ? <CheckCircle2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />} {habit ? 'Save Habit' : 'Create Habit'}</span>
          )}
        </button>
      </div>
    </form>
  )
}

function NotesView() {
  const api = useApi()
  const isMountedRef = useRef(true)
  const successTimeoutRef = useRef(null)
  const [notes, setNotes] = useState(() => storage.get('notes', []))
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [successMessage, setSuccessMessage] = useState('')

  useEffect(() => {
    isMountedRef.current = true
    api.notes.list({}).then(data => {
      if (isMountedRef.current) {
        setNotes(data)
      }
    })
    return () => {
      isMountedRef.current = false
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current)
      }
    }
  }, [])

  const showSuccess = (msg) => {
    setSuccessMessage(msg)
    successTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        setSuccessMessage('')
      }
    }, 2000)
  }

  const handleDelete = async (id) => {
    if (confirm('Delete this note?')) { await api.notes.delete(id); setNotes(notes.filter(n => n.id !== id)) }
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Notes</h1>
          <p className="text-xs text-gray-500">Quick thoughts and ideas</p>
        </div>
        <button onClick={() => { setEditing(null); setShowModal(true) }} className="btn btn-primary flex items-center gap-2 text-sm"><Plus className="w-4 h-4" /> New</button>
      </div>

      {notes.length === 0 ? (
        <EmptyState icon={StickyNote} title="No notes yet" description="Jot down your thoughts" action={<button onClick={() => setShowModal(true)} className="btn btn-primary text-sm">Create Note</button>} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
          {notes.map(n => (
            <div key={n.id} className="card p-3 group active:bg-gray-50 dark:active:bg-gray-700/50 transition-colors">
              <div className="flex items-start justify-between mb-1">
                <h3 className="font-medium text-sm truncate flex-1">{n.title || 'Untitled'}</h3>
                <div className="flex gap-0.5">
                  <button onClick={() => { setEditing(n); setShowModal(true) }} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg touch-target"><Edit3 className="w-3.5 h-3.5" /></button>
                  <button onClick={() => handleDelete(n.id)} className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg text-red-500 touch-target"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-3 whitespace-pre-wrap">{n.content}</p>
              <p className="text-[10px] text-gray-400 mt-2">{format(new Date(n.createdAt), 'MMM d, h:mm a')}</p>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={showModal} onClose={() => { setShowModal(false); api.notes.list({}).then(setNotes) }} title={editing ? 'Edit Note' : 'New Note'}>
        <NoteForm note={editing} onClose={() => { setShowModal(false); api.notes.list({}).then(setNotes); showSuccess(editing ? 'Note updated!' : 'Note created!') }} />
      </Modal>
      
      {successMessage && (
        <div className="fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 bg-emerald-500 text-white px-4 py-2 rounded-xl shadow-lg z-50 animate-fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            <span className="text-sm font-medium">{successMessage}</span>
          </div>
        </div>
      )}
    </div>
  )
}

function NoteForm({ note, onClose }) {
  const api = useApi()
  const [form, setForm] = useState({ title: note?.title || '', content: note?.content || '' })
  const [errors, setErrors] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  const validate = () => {
    const newErrors = {}
    if (!form.title.trim()) newErrors.title = 'Title is required'
    if (!form.content.trim()) newErrors.content = 'Content is required'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const submit = async (e) => {
    e.preventDefault()
    
    if (!validate()) return
    
    setIsSubmitting(true)
    
    try {
      if (note) await api.notes.update(note.id, form)
      else await api.notes.create(form)
      onClose()
    } catch (error) {
      console.error('Error saving note:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="label">Title *</label>
        <input type="text" value={form.title} onChange={(e) => setForm({...form, title: e.target.value})} className={`input ${errors.title ? 'border-red-500' : ''}`} placeholder="Note title" autoFocus />
        {errors.title && <p className="text-red-500 text-xs mt-1">{errors.title}</p>}
      </div>
      <div>
        <label className="label">Content *</label>
        <textarea value={form.content} onChange={(e) => setForm({...form, content: e.target.value})} className={`input min-h-[150px] resize-none ${errors.content ? 'border-red-500' : ''}`} placeholder="Write your note..." />
        {errors.content && <p className="text-red-500 text-xs mt-1">{errors.content}</p>}
      </div>
      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onClose} className="btn btn-secondary flex-1" disabled={isSubmitting}>Cancel</button>
        <button type="submit" className="btn btn-primary flex-1" disabled={isSubmitting}>{isSubmitting ? 'Saving...' : (note ? 'Save' : 'Create')}</button>
      </div>
    </form>
  )
}

function InstallPrompt({ onInstall, onDismiss }) {
  return (
    <div className="fixed bottom-20 md:bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 bg-white/95 dark:bg-slate-800/95 backdrop-blur-xl rounded-3xl shadow-xl border border-slate-200/50 dark:border-slate-700/50 p-4 z-50 animate-slide-up">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-violet-500/30">
          <Download className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-sm">Install TimeFlow</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Add to home screen for quick access</p>
        </div>
        <button onClick={onDismiss} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
          <X className="w-4 h-4 text-slate-400" />
        </button>
      </div>
      <div className="flex gap-2 mt-3">
        <button onClick={onDismiss} className="btn btn-secondary flex-1 text-sm py-2">Later</button>
        <button onClick={onInstall} className="btn btn-primary flex-1 text-sm py-2">Install</button>
      </div>
    </div>
  )
}

function AppContent() {
  const { currentUser, loading } = useAuth()
  const userApi = currentUser ? createUserApi(currentUser.uid) : null
  
  const isMountedRef = useRef(true)
  const [dark, setDark] = useState(() => {
    const saved = storage.get('theme')
    if (saved !== null) return saved
    return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
  })
  const [activeView, setActiveView] = useState('dashboard')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [showInstallPrompt, setShowInstallPrompt] = useState(false)
  const prevViewRef = useRef(activeView)
  const { handleTouchStart, handleTouchMove, handleTouchEnd } = useSwipeNavigation(activeView, setActiveView, isMobile)

  useEffect(() => {
    isMountedRef.current = true
    api.notifications.cleanup().catch(err => console.error('Cleanup error:', err))
    return () => {
      isMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    const checkMobile = () => {
      if (isMountedRef.current) {
        setIsMobile(window.innerWidth < 768)
      }
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    storage.set('theme', dark)
  }, [dark])

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
      const dismissed = storage.get('installPromptDismissed')
      if (!dismissed) setShowInstallPrompt(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const getDirection = () => {
    const mobileViewOrder = ['dashboard', 'tasks', 'calendar', 'timer', 'habits', 'notes', 'settings', 'overdue']
    const prevIndex = mobileViewOrder.indexOf(prevViewRef.current)
    const currentIndex = mobileViewOrder.indexOf(activeView)
    prevViewRef.current = activeView
    return currentIndex > prevIndex ? 'right' : 'left'
  }

  const handleInstall = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    setDeferredPrompt(null)
    setShowInstallPrompt(false)
    if (outcome === 'dismissed') storage.set('installPromptDismissed', true)
  }

  const handleDismissInstall = () => {
    setShowInstallPrompt(false)
    storage.set('installPromptDismissed', true)
  }

  const views = { 
    dashboard: Dashboard, 
    tasks: TasksView, 
    calendar: CalendarView, 
    timer: PomodoroTimer, 
    habits: HabitsView, 
    notes: NotesView,
    settings: SettingsPage,
    overdue: OverdueView
  }
  const View = views[activeView] || Dashboard

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
      </div>
    )
  }

  if (!currentUser) {
    return <AuthPage />
  }

return (
    <UserApiContext.Provider value={userApi}>
      <PWAContext.Provider value={{ deferredPrompt, showInstallPrompt }}>
      <ThemeContext.Provider value={{ dark, setDark }}>
        <div className="h-screen flex bg-slate-50 dark:bg-slate-950">
          {!isMobile && (
            <Sidebar activeView={activeView} setActiveView={setActiveView} collapsed={sidebarCollapsed} />
          )}
          <main 
            className="flex-1 flex flex-col h-full overflow-hidden"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            {isMobile && (
              <div className="flex items-center justify-between px-4 pt-4 pb-2 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
                    <Sparkles className="w-5 h-5 text-white" />
                  </div>
                  <span className="font-bold text-lg">TimeFlow</span>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setDark(!dark)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl touch-target transition-colors">
                    {dark ? <Sun className="w-5 h-5 text-amber-500" /> : <Moon className="w-5 h-5 text-violet-500" />}
                  </button>
                  <button 
                    onClick={() => setActiveView('settings')} 
                    className={`p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl touch-target transition-colors ${activeView === 'settings' ? 'text-violet-600 dark:text-violet-400' : ''}`}
                  >
                    <Settings className="w-5 h-5" />
                  </button>
                </div>
              </div>
            )}
            <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 md:px-6">
              <div className="py-4 pb-20">
                <PageTransition viewKey={activeView} direction={getDirection()}>
                  <View onNavigate={setActiveView} />
                </PageTransition>
              </div>
            </div>
          </main>
          {isMobile && <MobileNav activeView={activeView} setActiveView={setActiveView} />}
          {showInstallPrompt && <InstallPrompt onInstall={handleInstall} onDismiss={handleDismissInstall} />}
        </div>
      </ThemeContext.Provider>
    </PWAContext.Provider>
  </UserApiContext.Provider>
  )
}

export default function App() {
  return (
    <NotificationProvider>
      <AppContent />
    </NotificationProvider>
  )
}