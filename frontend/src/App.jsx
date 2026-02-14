import { useState, useEffect, createContext, useContext } from 'react'
import { format, isToday, isTomorrow, isPast, parseISO, isSameDay, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, addMonths, subMonths, startOfWeek } from 'date-fns'
import { 
  LayoutDashboard, CheckSquare, Calendar, Clock, Target, StickyNote, Moon, Sun,
  Plus, Trash2, Edit3, Search, Play, Pause, RotateCcw,
  CheckCircle2, Circle, AlertTriangle, Timer, X, Menu, Sparkles, TrendingUp,
  ChevronLeft, ChevronRight, Info, Zap, Coffee, Brain, Dumbbell, BookOpen
} from 'lucide-react'

const API_BASE = '/api'
const ThemeContext = createContext()
const useTheme = () => useContext(ThemeContext)

const api = {
  tasks: {
    list: (params) => fetch(`${API_BASE}/tasks?${new URLSearchParams(params)}`).then(r => r.json()),
    create: (data) => fetch(`${API_BASE}/tasks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json()),
    update: (id, data) => fetch(`${API_BASE}/tasks/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json()),
    delete: (id) => fetch(`${API_BASE}/tasks/${id}`, { method: 'DELETE' })
  },
  categories: {
    list: () => fetch(`${API_BASE}/categories`).then(r => r.json())
  },
  habits: {
    list: () => fetch(`${API_BASE}/habits`).then(r => r.json()),
    create: (data) => fetch(`${API_BASE}/habits`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json()),
    update: (id, data) => fetch(`${API_BASE}/habits/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json()),
    delete: (id) => fetch(`${API_BASE}/habits/${id}`, { method: 'DELETE' }),
    complete: (id) => fetch(`${API_BASE}/habits/${id}/complete`, { method: 'POST' }).then(r => r.json())
  },
  notes: {
    list: (params) => fetch(`${API_BASE}/notes?${new URLSearchParams(params)}`).then(r => r.json()),
    create: (data) => fetch(`${API_BASE}/notes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json()),
    update: (id, data) => fetch(`${API_BASE}/notes/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json()),
    delete: (id) => fetch(`${API_BASE}/notes/${id}`, { method: 'DELETE' })
  },
  stats: () => fetch(`${API_BASE}/stats`).then(r => r.json())
}

const priorityColors = { high: 'text-red-500 bg-red-50 dark:bg-red-950/30', medium: 'text-amber-500 bg-amber-50 dark:bg-amber-950/30', low: 'text-slate-400 bg-slate-50 dark:bg-slate-950/30' }
const categoryColors = { Work: '#ef4444', Personal: '#10b981', Health: '#f59e0b', Learning: '#8b5cf6', Shopping: '#ec4899', general: '#6366f1' }

function Modal({ isOpen, onClose, title, children, size = 'md' }) {
  if (!isOpen) return null
  const sizes = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg' }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose} />
      <div className={`card relative z-10 w-full ${sizes[size]} max-h-[85vh] overflow-hidden animate-in zoom-in-95 duration-200`}>
        <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 overflow-auto">{children}</div>
      </div>
    </div>
  )
}

function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900 flex items-center justify-center mb-4">
        <Icon className="w-8 h-8 text-gray-400" />
      </div>
      <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">{title}</h3>
      <p className="text-gray-500 dark:text-gray-400 mt-1 mb-4">{description}</p>
      {action}
    </div>
  )
}

function Sidebar({ activeView, setActiveView, collapsed }) {
  const { dark, setDark } = useTheme()
  const navItems = [
    { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard', desc: 'Overview & stats' },
    { id: 'tasks', icon: CheckSquare, label: 'Tasks', desc: 'Manage your tasks' },
    { id: 'calendar', icon: Calendar, label: 'Calendar', desc: 'Monthly view' },
    { id: 'timer', icon: Timer, label: 'Focus Timer', desc: 'Pomodoro technique' },
    { id: 'habits', icon: Target, label: 'Habits', desc: 'Build routines' },
    { id: 'notes', icon: StickyNote, label: 'Notes', desc: 'Quick notes' },
  ]

  return (
    <aside className={`${collapsed ? 'w-16' : 'w-60'} bg-white dark:bg-gray-900 border-r border-gray-100 dark:border-gray-800 flex flex-col transition-all duration-300 h-screen sticky top-0`}>
      <div className="p-3 flex items-center gap-2">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-5 h-5 text-white" />
        </div>
        {!collapsed && <span className="font-bold text-lg">TimeFlow</span>}
      </div>
      
      <nav className="flex-1 p-2 space-y-1">
        {navItems.map(item => (
          <button
            key={item.id}
            onClick={() => setActiveView(item.id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group relative ${
              activeView === item.id 
                ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400' 
                : 'hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
          >
            <item.icon className={`w-5 h-5 flex-shrink-0 ${activeView === item.id ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400'}`} />
            {!collapsed && (
              <div className="text-left">
                <div className="font-medium text-sm">{item.label}</div>
                <div className="text-xs text-gray-400 group-hover:text-gray-500">{item.desc}</div>
              </div>
            )}
          </button>
        ))}
      </nav>

      <div className="p-2 border-t border-gray-100 dark:border-gray-800">
        <button
          onClick={() => setDark(!dark)}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          {dark ? <Sun className="w-5 h-5 text-amber-500" /> : <Moon className="w-5 h-5 text-indigo-500" />}
          {!collapsed && <span className="text-sm">{dark ? 'Light Mode' : 'Dark Mode'}</span>}
        </button>
      </div>
    </aside>
  )
}

function StatCard({ icon: Icon, label, value, color, trend }) {
  const colors = {
    blue: 'from-blue-500 to-cyan-500',
    green: 'from-emerald-500 to-teal-500',
    red: 'from-red-500 to-rose-500',
    purple: 'from-purple-500 to-indigo-500',
    amber: 'from-amber-500 to-orange-500'
  }
  return (
    <div className="card p-5 group hover:shadow-lg transition-shadow">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">{label}</p>
          <p className="text-3xl font-bold">{value}</p>
          {trend && <p className="text-xs text-emerald-500 mt-1">{trend}</p>}
        </div>
        <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${colors[color]} flex items-center justify-center opacity-90 group-hover:opacity-100 transition-opacity`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
      </div>
    </div>
  )
}

function Dashboard() {
  const [stats, setStats] = useState(null)
  const [tasks, setTasks] = useState([])
  const [habits, setHabits] = useState([])

  useEffect(() => {
    Promise.all([api.stats(), api.tasks.list({ status: 'pending' }), api.habits.list()])
      .then(([statsData, tasksData, habitsData]) => {
        setStats(statsData)
        setTasks(tasksData)
        setHabits(habitsData)
      })
  }, [])

  if (!stats) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full" />
    </div>
  )

  const upcomingTasks = tasks.filter(t => t.dueDate && !isPast(parseISO(t.dueDate))).slice(0, 5)
  const overdueTasks = tasks.filter(t => t.dueDate && isPast(parseISO(t.dueDate)) && !isToday(parseISO(t.dueDate)))

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Welcome back!</h1>
          <p className="text-gray-500 dark:text-gray-400">{format(new Date(), 'EEEE, MMMM d')}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={CheckSquare} label="Total Tasks" value={stats.totalTasks} color="blue" />
        <StatCard icon={CheckCircle2} label="Completed" value={stats.completedTasks} color="green" trend={stats.completionRate + '% done'} />
        <StatCard icon={AlertTriangle} label="Overdue" value={stats.overdueTasks} color="red" />
        <StatCard icon={Target} label="Habits Today" value={stats.habitsCompletedToday} color="purple" />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card">
          <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <h2 className="font-semibold flex items-center gap-2"><Clock className="w-4 h-4 text-indigo-500" /> Upcoming</h2>
            {upcomingTasks.length > 0 && <span className="text-xs bg-indigo-100 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-full">{upcomingTasks.length}</span>}
          </div>
          <div className="p-2">
            {upcomingTasks.length === 0 ? (
              <EmptyState icon={CheckCircle2} title="All caught up!" description="No upcoming tasks" />
            ) : (
              <div className="space-y-1">
                {upcomingTasks.map(task => (
                  <div key={task.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <Circle className={`w-2 h-2 rounded-full ${task.priority === 'high' ? 'fill-red-500' : task.priority === 'low' ? 'fill-slate-400' : 'fill-amber-500'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{task.title}</p>
                      <p className="text-xs text-gray-400">
                        {task.dueDate && (isToday(parseISO(task.dueDate)) ? 'Today' : isTomorrow(parseISO(task.dueDate)) ? 'Tomorrow' : format(parseISO(task.dueDate), 'MMM d'))}
                        {task.dueTime && <span className="ml-1">at {task.dueTime}</span>}
                      </p>
                    </div>
                    <span className="text-xs px-2 py-1 rounded-lg" style={{ color: categoryColors[task.category] || categoryColors.general, backgroundColor: `${categoryColors[task.category] || categoryColors.general}15` }}>{task.category}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="p-4 border-b border-gray-100 dark:border-gray-800">
            <h2 className="font-semibold flex items-center gap-2"><TrendingUp className="w-4 h-4 text-emerald-500" /> Habits</h2>
          </div>
          <div className="p-2">
            {habits.length === 0 ? (
              <EmptyState icon={Target} title="No habits yet" description="Start building routines" />
            ) : (
              <div className="space-y-1">
                {habits.slice(0, 4).map(habit => (
                  <div key={habit.id} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: habit.color }} />
                    <span className="flex-1 text-sm font-medium truncate">{habit.name}</span>
                    <span className="text-sm font-bold" style={{ color: habit.color }}>{habit.streak}🔥</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {overdueTasks.length > 0 && (
        <div className="card border-red-200 dark:border-red-900/50">
          <div className="p-4 border-b border-red-100 dark:border-red-900/30">
            <h2 className="font-semibold text-red-600 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Overdue ({overdueTasks.length})</h2>
          </div>
          <div className="p-2 space-y-1">
            {overdueTasks.slice(0, 3).map(task => (
              <div key={task.id} className="flex items-center gap-3 p-3 rounded-xl bg-red-50 dark:bg-red-950/20">
                <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{task.title}</p>
                  <p className="text-xs text-red-500">Due {format(parseISO(task.dueDate), 'MMM d')}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function TasksView() {
  const [tasks, setTasks] = useState([])
  const [categories, setCategories] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editingTask, setEditingTask] = useState(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')

  const load = () => Promise.all([api.tasks.list({ search }), api.categories.list()]).then(([t, c]) => { setTasks(t); setCategories(c) })
  useEffect(() => { load() }, [search])

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

  const handleDelete = async (id) => {
    if (confirm('Delete this task?')) { await api.tasks.delete(id); load() }
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tasks</h1>
          <p className="text-gray-500 text-sm">{filteredTasks.filter(t => t.status !== 'completed').length} pending</p>
        </div>
        <button onClick={() => { setEditingTask(null); setShowModal(true) }} className="btn btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add Task
        </button>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="Search tasks..." value={search} onChange={(e) => setSearch(e.target.value)} className="input pl-9" />
        </div>
        <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl">
          {['all', 'today', 'pending', 'completed'].map(f => (
            <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filter === f ? 'bg-white dark:bg-gray-700 shadow-sm' : 'hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {filteredTasks.length === 0 ? (
        <EmptyState icon={CheckSquare} title="No tasks found" description="Create a task to get started" action={<button onClick={() => setShowModal(true)} className="btn btn-primary">Create Task</button>} />
      ) : (
        <div className="space-y-2">
          {filteredTasks.map(task => (
            <div key={task.id} className={`card p-4 flex items-center gap-4 group hover:shadow-md transition-all ${task.status === 'completed' ? 'opacity-50' : ''}`}>
              <button onClick={() => handleToggle(task)} className="flex-shrink-0">
                {task.status === 'completed' ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <Circle className={`w-5 h-5 ${task.priority === 'high' ? 'text-red-500' : task.priority === 'medium' ? 'text-amber-500' : 'text-slate-400'}`} />}
              </button>
              <div className="flex-1 min-w-0">
                <p className={`font-medium ${task.status === 'completed' ? 'line-through text-gray-400' : ''}`}>{task.title}</p>
                <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
                  {task.dueDate && (
                    <span className={isPast(parseISO(task.dueDate)) && task.status !== 'completed' ? 'text-red-500' : ''}>
                      {isToday(parseISO(task.dueDate)) ? 'Today' : isTomorrow(parseISO(task.dueDate)) ? 'Tomorrow' : format(parseISO(task.dueDate), 'MMM d')}
                    </span>
                  )}
                  {task.estimatedMinutes && <span>• {task.estimatedMinutes}min</span>}
                </div>
              </div>
              <span className="hidden sm:block text-xs px-2 py-1 rounded-lg" style={{ color: categoryColors[task.category] || categoryColors.general, backgroundColor: `${categoryColors[task.category] || categoryColors.general}15` }}>{task.category}</span>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => { setEditingTask(task); setShowModal(true) }} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"><Edit3 className="w-4 h-4" /></button>
                <button onClick={() => handleDelete(task.id)} className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 rounded-lg"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={showModal} onClose={() => { setShowModal(false); load() }} title={editingTask ? 'Edit Task' : 'New Task'}>
        <TaskForm task={editingTask} categories={categories} onClose={() => { setShowModal(false); load() }} />
      </Modal>
    </div>
  )
}

function TaskForm({ task, categories, onClose }) {
  const [form, setForm] = useState({
    title: task?.title || '',
    description: task?.description || '',
    category: task?.category || 'general',
    priority: task?.priority || 'medium',
    dueDate: task?.dueDate?.split('T')[0] || '',
    dueTime: task?.dueTime || '',
    estimatedMinutes: task?.estimatedMinutes || 30
  })

  const submit = async (e) => {
    e.preventDefault()
    if (task) await api.tasks.update(task.id, form)
    else await api.tasks.create(form)
    onClose()
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="label">What needs to be done?</label>
        <input type="text" value={form.title} onChange={(e) => setForm({...form, title: e.target.value})} className="input" placeholder="Enter task title" required autoFocus />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Category</label>
          <select value={form.category} onChange={(e) => setForm({...form, category: e.target.value})} className="input">
            {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
            <option value="general">General</option>
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
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Due Date</label>
          <input type="date" value={form.dueDate} onChange={(e) => setForm({...form, dueDate: e.target.value})} className="input" />
        </div>
        <div>
          <label className="label">Time</label>
          <input type="time" value={form.dueTime} onChange={(e) => setForm({...form, dueTime: e.target.value})} className="input" />
        </div>
      </div>
      <div>
        <label className="label">Estimated Time (minutes)</label>
        <input type="number" value={form.estimatedMinutes} onChange={(e) => setForm({...form, estimatedMinutes: parseInt(e.target.value) || 30})} className="input" min="5" step="5" />
      </div>
      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onClose} className="btn btn-secondary flex-1">Cancel</button>
        <button type="submit" className="btn btn-primary flex-1">{task ? 'Save' : 'Create'}</button>
      </div>
    </form>
  )
}

function CalendarView() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [tasks, setTasks] = useState([])
  const [selectedDate, setSelectedDate] = useState(null)

  useEffect(() => { api.tasks.list({}).then(setTasks) }, [])

  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 })
  const days = eachDayOfInterval({ start: calendarStart, end: new Date(Math.max(monthEnd.getTime(), calendarStart.getTime() + 41 * 86400000)) })

  const getTasksForDay = (date) => tasks.filter(t => t.dueDate && isSameDay(parseISO(t.dueDate), date))

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Calendar</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setCurrentDate(subMonths(currentDate, 1))} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"><ChevronLeft className="w-5 h-5" /></button>
          <button onClick={() => setCurrentDate(new Date())} className="btn btn-secondary text-sm">Today</button>
          <button onClick={() => setCurrentDate(addMonths(currentDate, 1))} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"><ChevronRight className="w-5 h-5" /></button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="grid grid-cols-7 bg-gray-50 dark:bg-gray-800/50">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => <div key={d} className="p-3 text-center text-xs font-semibold text-gray-500">{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day, i) => {
            const dayTasks = getTasksForDay(day)
            const isCurrentMonth = isSameMonth(day, currentDate)
            const isSelected = selectedDate && isSameDay(day, selectedDate)
            const isTodayDate = isToday(day)
            return (
              <div key={i} onClick={() => setSelectedDate(day)} className={`min-h-24 p-2 border-t border-l border-gray-100 dark:border-gray-800 cursor-pointer transition-colors ${!isCurrentMonth ? 'bg-gray-50/50 dark:bg-gray-900/50' : ''} ${isSelected ? 'bg-indigo-50 dark:bg-indigo-950/30' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'}`}>
                <div className={`text-sm font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full ${isTodayDate ? 'bg-indigo-600 text-white' : !isCurrentMonth ? 'text-gray-400' : ''}`}>{format(day, 'd')}</div>
                <div className="space-y-0.5">
                  {dayTasks.slice(0, 2).map(t => (
                    <div key={t.id} className={`text-xs px-1.5 py-0.5 rounded truncate ${t.status === 'completed' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : t.priority === 'high' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>{t.title}</div>
                  ))}
                  {dayTasks.length > 2 && <div className="text-xs text-gray-400 px-1">+{dayTasks.length - 2}</div>}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {selectedDate && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">{isToday(selectedDate) ? 'Today' : format(selectedDate, 'EEEE, MMMM d')}</h3>
            <button onClick={() => setSelectedDate(null)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"><X className="w-4 h-4" /></button>
          </div>
          {getTasksForDay(selectedDate).length === 0 ? <p className="text-gray-400 text-sm text-center py-4">No tasks</p> : (
            <div className="space-y-1">
              {getTasksForDay(selectedDate).map(t => (
                <div key={t.id} className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                  <Circle className={`w-2 h-2 rounded-full ${t.priority === 'high' ? 'fill-red-500' : 'fill-amber-500'}`} />
                  <span className="text-sm">{t.title}</span>
                  {t.dueTime && <span className="text-xs text-gray-400 ml-auto">{t.dueTime}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function PomodoroTimer() {
  const [minutes, setMinutes] = useState(25)
  const [seconds, setSeconds] = useState(0)
  const [isRunning, setIsRunning] = useState(false)
  const [mode, setMode] = useState('focus')
  const [sessions, setSessions] = useState(0)
  const [customMinutes, setCustomMinutes] = useState(25)

  const presets = [
    { label: 'Focus', mins: 25, icon: Brain, color: 'indigo', desc: 'Deep work session' },
    { label: 'Short', mins: 5, icon: Coffee, color: 'emerald', desc: 'Quick break' },
    { label: 'Long', mins: 15, icon: Zap, color: 'amber', desc: 'Longer rest' },
    { label: 'Study', mins: 50, icon: BookOpen, color: 'purple', desc: 'Extended focus' },
    { label: 'Exercise', mins: 30, icon: Dumbbell, color: 'rose', desc: 'Workout time' },
  ]

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

  const selectPreset = (preset) => {
    setMinutes(preset.mins)
    setSeconds(0)
    setMode(preset.label.toLowerCase())
    setIsRunning(false)
  }

  const setCustom = () => {
    setMinutes(customMinutes)
    setSeconds(0)
    setMode('custom')
    setIsRunning(false)
  }

  const reset = () => {
    const currentPreset = presets.find(p => p.label.toLowerCase() === mode)
    setMinutes(currentPreset ? currentPreset.mins : customMinutes)
    setSeconds(0)
    setIsRunning(false)
  }

  const progress = () => {
    const total = presets.find(p => p.label.toLowerCase() === mode)?.mins || customMinutes
    return 1 - (minutes + seconds / 60) / total
  }

  const formatTime = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`

  return (
    <div className="space-y-6 max-w-xl mx-auto">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Focus Timer</h1>
        <p className="text-gray-500 text-sm">Stay productive with timed sessions</p>
      </div>

      <div className="card p-6">
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {presets.map(p => (
            <button key={p.label} onClick={() => selectPreset(p)} className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-all min-w-[70px] ${mode === p.label.toLowerCase() ? `bg-${p.color}-100 dark:bg-${p.color}-950/50 text-${p.color}-600 dark:text-${p.color}-400 ring-1 ring-${p.color}-200 dark:ring-${p.color}-800` : 'hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
              <p.icon className="w-4 h-4" />
              <span className="text-xs font-medium">{p.label}</span>
              <span className="text-xs text-gray-400">{p.mins}m</span>
            </button>
          ))}
        </div>

        <div className="relative w-56 h-56 mx-auto mb-6">
          <svg className="w-full h-full transform -rotate-90">
            <circle cx="112" cy="112" r="104" fill="none" stroke="currentColor" strokeWidth="6" className="text-gray-200 dark:text-gray-800" />
            <circle cx="112" cy="112" r="104" fill="none" stroke="url(#gradient)" strokeWidth="6" strokeDasharray={653} strokeDashoffset={653 * (1 - progress())} strokeLinecap="round" className="transition-all duration-1000" />
            <defs>
              <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#6366f1" />
                <stop offset="100%" stopColor="#8b5cf6" />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-5xl font-bold tracking-tight">{formatTime}</span>
            <span className="text-gray-400 text-sm mt-1 capitalize">{mode}</span>
          </div>
        </div>

        <div className="flex justify-center gap-3 mb-6">
          <button onClick={() => setIsRunning(!isRunning)} className={`btn ${isRunning ? 'btn-secondary' : 'btn-primary'} flex items-center gap-2`}>
            {isRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            {isRunning ? 'Pause' : 'Start'}
          </button>
          <button onClick={reset} className="btn btn-secondary flex items-center gap-2"><RotateCcw className="w-4 h-4" /> Reset</button>
        </div>

        <div className="flex items-center gap-3 pt-4 border-t border-gray-100 dark:border-gray-800">
          <input type="number" value={customMinutes} onChange={(e) => setCustomMinutes(Math.max(1, parseInt(e.target.value) || 1))} className="input w-20 text-center" min="1" max="120" />
          <span className="text-sm text-gray-500">minutes</span>
          <button onClick={setCustom} className="btn btn-secondary text-sm ml-auto">Set Custom</button>
        </div>
      </div>

      <div className="card p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">Sessions completed</p>
            <p className="text-2xl font-bold">{sessions}</p>
          </div>
          <div className="flex gap-1">
            {[...Array(4)].map((_, i) => <div key={i} className={`w-3 h-3 rounded-full ${i < sessions ? 'bg-indigo-500' : 'bg-gray-200 dark:bg-gray-700'}`} />)}
          </div>
        </div>
      </div>

      <div className="card p-4 bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30 border-0">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-indigo-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-sm">How to use</p>
            <p className="text-xs text-gray-500 mt-1">Choose a preset or set a custom time. Focus on your task until the timer ends. Take breaks between sessions to stay productive!</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function HabitsView() {
  const [habits, setHabits] = useState([])
  const [showModal, setShowModal] = useState(false)

  useEffect(() => { api.habits.list().then(setHabits) }, [])

  const handleComplete = async (id) => {
    try {
      const updated = await api.habits.complete(id)
      setHabits(habits.map(h => h.id === id ? updated : h))
    } catch { alert('Already completed today!') }
  }

  const handleDelete = async (id) => {
    if (confirm('Delete this habit?')) { await api.habits.delete(id); setHabits(habits.filter(h => h.id !== id)) }
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Habits</h1>
          <p className="text-gray-500 text-sm">Build consistent daily routines</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> Add Habit</button>
      </div>

      {habits.length === 0 ? (
        <EmptyState icon={Target} title="No habits yet" description="Start building better habits" action={<button onClick={() => setShowModal(true)} className="btn btn-primary">Create Habit</button>} />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {habits.map(h => (
            <div key={h.id} className="card p-4 group hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: h.color }} />
                  <span className="font-medium">{h.name}</span>
                </div>
                <button onClick={() => handleDelete(h.id)} className="p-1 opacity-0 group-hover:opacity-100 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-red-500 transition-all"><Trash2 className="w-4 h-4" /></button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold" style={{ color: h.color }}>{h.streak}</p>
                  <p className="text-xs text-gray-400">day streak</p>
                </div>
                <button onClick={() => handleComplete(h.id)} className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 hover:bg-emerald-200 dark:hover:bg-emerald-900/50 flex items-center justify-center transition-colors"><CheckCircle2 className="w-5 h-5 text-emerald-600" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="New Habit">
        <HabitForm onClose={() => { setShowModal(false); api.habits.list().then(setHabits) }} />
      </Modal>
    </div>
  )
}

function HabitForm({ onClose }) {
  const [form, setForm] = useState({ name: '', color: '#6366f1' })
  const colors = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#6366f1']

  const submit = async (e) => {
    e.preventDefault()
    await api.habits.create(form)
    onClose()
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="label">Habit Name</label>
        <input type="text" value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} className="input" placeholder="e.g., Exercise, Read" required autoFocus />
      </div>
      <div>
        <label className="label">Color</label>
        <div className="flex gap-2">{colors.map(c => <button type="button" key={c} onClick={() => setForm({...form, color: c})} className={`w-8 h-8 rounded-full transition-transform ${form.color === c ? 'ring-2 ring-offset-2 ring-indigo-500 scale-110' : ''}`} style={{ backgroundColor: c }} />)}</div>
      </div>
      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onClose} className="btn btn-secondary flex-1">Cancel</button>
        <button type="submit" className="btn btn-primary flex-1">Create</button>
      </div>
    </form>
  )
}

function NotesView() {
  const [notes, setNotes] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)

  useEffect(() => { api.notes.list({}).then(setNotes) }, [])

  const handleDelete = async (id) => {
    if (confirm('Delete this note?')) { await api.notes.delete(id); setNotes(notes.filter(n => n.id !== id)) }
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Notes</h1>
          <p className="text-gray-500 text-sm">Quick thoughts and ideas</p>
        </div>
        <button onClick={() => { setEditing(null); setShowModal(true) }} className="btn btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> New Note</button>
      </div>

      {notes.length === 0 ? (
        <EmptyState icon={StickyNote} title="No notes yet" description="Jot down your thoughts" action={<button onClick={() => setShowModal(true)} className="btn btn-primary">Create Note</button>} />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {notes.map(n => (
            <div key={n.id} className="card p-4 group hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-medium">{n.title || 'Untitled'}</h3>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => { setEditing(n); setShowModal(true) }} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"><Edit3 className="w-3 h-3" /></button>
                  <button onClick={() => handleDelete(n.id)} className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-red-500"><Trash2 className="w-3 h-3" /></button>
                </div>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-3 whitespace-pre-wrap">{n.content}</p>
              <p className="text-xs text-gray-400 mt-3">{format(new Date(n.createdAt), 'MMM d, h:mm a')}</p>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={showModal} onClose={() => { setShowModal(false); api.notes.list({}).then(setNotes) }} title={editing ? 'Edit Note' : 'New Note'}>
        <NoteForm note={editing} onClose={() => { setShowModal(false); api.notes.list({}).then(setNotes) }} />
      </Modal>
    </div>
  )
}

function NoteForm({ note, onClose }) {
  const [form, setForm] = useState({ title: note?.title || '', content: note?.content || '' })

  const submit = async (e) => {
    e.preventDefault()
    if (note) await api.notes.update(note.id, form)
    else await api.notes.create(form)
    onClose()
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="label">Title</label>
        <input type="text" value={form.title} onChange={(e) => setForm({...form, title: e.target.value})} className="input" placeholder="Note title" autoFocus />
      </div>
      <div>
        <label className="label">Content</label>
        <textarea value={form.content} onChange={(e) => setForm({...form, content: e.target.value})} className="input min-h-[150px]" placeholder="Write your note..." />
      </div>
      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onClose} className="btn btn-secondary flex-1">Cancel</button>
        <button type="submit" className="btn btn-primary flex-1">{note ? 'Save' : 'Create'}</button>
      </div>
    </form>
  )
}

export default function App() {
  const [dark, setDark] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  const [activeView, setActiveView] = useState('dashboard')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])

  const views = { dashboard: Dashboard, tasks: TasksView, calendar: CalendarView, timer: PomodoroTimer, habits: HabitsView, notes: NotesView }
  const View = views[activeView] || Dashboard

  return (
    <ThemeContext.Provider value={{ dark, setDark }}>
      <div className="flex min-h-screen bg-gray-50 dark:bg-gray-950">
        <Sidebar activeView={activeView} setActiveView={setActiveView} collapsed={sidebarCollapsed} />
        <main className="flex-1 p-6 overflow-auto">
          <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)} className="lg:hidden mb-4 p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"><Menu className="w-5 h-5" /></button>
          <View />
        </main>
      </div>
    </ThemeContext.Provider>
  )
}