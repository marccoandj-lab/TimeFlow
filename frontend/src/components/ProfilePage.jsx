import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { 
  User, Mail, Calendar, Trophy, Target, CheckCircle2, 
  Clock, TrendingUp, Camera, Edit3, Save, X, LogOut,
  BarChart3
} from 'lucide-react'
import { format } from 'date-fns'
import { doc, setDoc } from 'firebase/firestore'
import { db } from '../firebase'

export default function ProfilePage() {
  const { currentUser, userData, updateUserProfile, logout } = useAuth()
  const [editing, setEditing] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState({
    totalTasks: 0,
    completedTasks: 0,
    habitsStreak: 0,
    totalFocusTime: 0
  })

  useEffect(() => {
    if (userData) {
      setDisplayName(userData.displayName || '')
    }
    fetchStats()
  }, [userData])

  async function fetchStats() {
    try {
      const res = await fetch('/api/stats')
      const data = await res.json()
      setStats({
        totalTasks: data.totalTasks || 0,
        completedTasks: data.completedTasks || 0,
        habitsStreak: data.habitsCompletedToday || 0,
        totalFocusTime: data.totalTimeThisWeek || 0
      })
    } catch (err) {
      console.error('Failed to fetch stats')
    }
  }

  async function handleSave() {
    setLoading(true)
    try {
      await updateUserProfile({ displayName })
      setEditing(false)
    } catch (err) {
      console.error('Failed to update profile')
    }
    setLoading(false)
  }

  async function handleLogout() {
    try {
      await logout()
    } catch (err) {
      console.error('Failed to logout')
    }
  }

  const completionRate = stats.totalTasks > 0 
    ? Math.round((stats.completedTasks / stats.totalTasks) * 100) 
    : 0

  return (
    <div className="space-y-4 pb-20 md:pb-4 max-w-2xl mx-auto">
      <div className="card overflow-hidden">
        <div className="h-24 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />
        
        <div className="px-4 pb-4">
          <div className="flex items-end gap-4 -mt-10 mb-4">
            <div className="relative">
              <div className="w-20 h-20 rounded-2xl bg-white dark:bg-gray-800 shadow-lg flex items-center justify-center border-4 border-white dark:border-gray-800">
                {currentUser?.photoURL ? (
                  <img 
                    src={currentUser.photoURL} 
                    alt="Profile" 
                    className="w-full h-full rounded-xl object-cover"
                  />
                ) : (
                  <User className="w-8 h-8 text-gray-400" />
                )}
              </div>
              <button className="absolute -bottom-1 -right-1 w-7 h-7 rounded-lg bg-indigo-500 text-white flex items-center justify-center shadow-lg hover:bg-indigo-600 transition-colors">
                <Camera className="w-3.5 h-3.5" />
              </button>
            </div>
            
            <div className="flex-1 pb-1">
              {editing ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="input py-1.5 text-lg font-semibold"
                    placeholder="Your name"
                  />
                  <button 
                    onClick={handleSave}
                    disabled={loading}
                    className="p-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600"
                  >
                    <Save className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => { setEditing(false); setDisplayName(userData?.displayName || '') }}
                    className="p-2 bg-gray-200 dark:bg-gray-700 rounded-lg"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold">{userData?.displayName || 'User'}</h1>
                  <button 
                    onClick={() => setEditing(true)}
                    className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                  >
                    <Edit3 className="w-4 h-4 text-gray-400" />
                  </button>
                </div>
              )}
              <p className="text-sm text-gray-500 flex items-center gap-1 mt-0.5">
                <Mail className="w-3.5 h-3.5" />
                {currentUser?.email}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Calendar className="w-3.5 h-3.5" />
            Joined {userData?.createdAt ? format(userData.createdAt.toDate(), 'MMMM yyyy') : 'Recently'}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="card p-3 text-center">
          <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-950/50 flex items-center justify-center mx-auto mb-2">
            <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </div>
          <p className="text-xl font-bold">{stats.completedTasks}</p>
          <p className="text-xs text-gray-500">Completed</p>
        </div>
        
        <div className="card p-3 text-center">
          <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950/50 flex items-center justify-center mx-auto mb-2">
            <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <p className="text-xl font-bold">{completionRate}%</p>
          <p className="text-xs text-gray-500">Success Rate</p>
        </div>
        
        <div className="card p-3 text-center">
          <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-950/50 flex items-center justify-center mx-auto mb-2">
            <Target className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          </div>
          <p className="text-xl font-bold">{stats.habitsStreak}</p>
          <p className="text-xs text-gray-500">Day Streak</p>
        </div>
        
        <div className="card p-3 text-center">
          <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-950/50 flex items-center justify-center mx-auto mb-2">
            <Clock className="w-4 h-4 text-purple-600 dark:text-purple-400" />
          </div>
          <p className="text-xl font-bold">{Math.round(stats.totalFocusTime / 60)}h</p>
          <p className="text-xs text-gray-500">Focus Time</p>
        </div>
      </div>

      <div className="card p-4">
        <h2 className="font-semibold mb-3 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-indigo-500" />
          Progress Overview
        </h2>
        
        <div className="space-y-3">
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-500">Tasks Completion</span>
              <span className="font-medium">{completionRate}%</span>
            </div>
            <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500"
                style={{ width: `${completionRate}%` }}
              />
            </div>
          </div>
          
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-500">Weekly Goal</span>
              <span className="font-medium">{Math.min(stats.habitsStreak * 14, 100)}%</span>
            </div>
            <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(stats.habitsStreak * 14, 100)}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="card p-4">
        <h2 className="font-semibold mb-3 flex items-center gap-2">
          <Trophy className="w-4 h-4 text-amber-500" />
          Achievements
        </h2>
        
        <div className="grid grid-cols-4 gap-2">
          {[
            { icon: '🎯', label: 'First Task', unlocked: stats.completedTasks > 0 },
            { icon: '🔥', label: '3 Day Streak', unlocked: stats.habitsStreak >= 3 },
            { icon: '⏰', label: '1h Focus', unlocked: stats.totalFocusTime >= 60 },
            { icon: '🏆', label: '10 Tasks', unlocked: stats.completedTasks >= 10 },
            { icon: '💪', label: '7 Day Streak', unlocked: stats.habitsStreak >= 7 },
            { icon: '📚', label: '5h Focus', unlocked: stats.totalFocusTime >= 300 },
            { icon: '⭐', label: '50 Tasks', unlocked: stats.completedTasks >= 50 },
            { icon: '👑', label: 'Master', unlocked: stats.completedTasks >= 100 },
          ].map((achievement, i) => (
            <div 
              key={i}
              className={`p-2 rounded-xl text-center transition-all ${
                achievement.unlocked 
                  ? 'bg-amber-50 dark:bg-amber-950/30' 
                  : 'bg-gray-100 dark:bg-gray-800 opacity-40'
              }`}
            >
              <span className="text-xl">{achievement.icon}</span>
              <p className="text-[10px] mt-1 font-medium truncate">{achievement.label}</p>
            </div>
          ))}
        </div>
      </div>

      <button 
        onClick={handleLogout}
        className="w-full btn btn-secondary flex items-center justify-center gap-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
      >
        <LogOut className="w-4 h-4" />
        Sign Out
      </button>
    </div>
  )
}