import { 
  collection, doc, addDoc, updateDoc, deleteDoc, getDoc, getDocs, 
  query, where, orderBy, serverTimestamp, onSnapshot, writeBatch 
} from 'firebase/firestore'
import { db } from './firebase'

const deleteCollection = async (userRef, collectionName) => {
  const colRef = collection(userRef, collectionName)
  const snapshot = await getDocs(colRef)
  const batch = writeBatch(db)
  snapshot.docs.forEach((docSnapshot) => {
    batch.delete(docSnapshot.ref)
  })
  if (snapshot.docs.length > 0) {
    await batch.commit()
  }
  return snapshot.docs.length
}

const createUserApi = (userId) => {
  if (!userId || !db) return null

  const userRef = doc(db, 'users', userId)

  return {
    tasks: {
      list: async (params = {}) => {
        const tasksRef = collection(userRef, 'tasks')
        const q = query(tasksRef, orderBy('createdAt', 'desc'))
        const snapshot = await getDocs(q)
        let tasks = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
        
        if (params.status) tasks = tasks.filter(t => t.status === params.status)
        if (params.search) tasks = tasks.filter(t => 
          t.title?.toLowerCase().includes(params.search.toLowerCase()) ||
          t.description?.toLowerCase().includes(params.search.toLowerCase())
        )
        return tasks
      },
      create: async (data) => {
        const tasksRef = collection(userRef, 'tasks')
        const docRef = await addDoc(tasksRef, {
          ...data,
          status: data.status || 'pending',
          createdAt: new Date().toISOString(),
          reminder: data.reminder ?? true
        })
        return { id: docRef.id, ...data }
      },
      update: async (id, data) => {
        const taskRef = doc(userRef, 'tasks', id)
        await updateDoc(taskRef, { ...data, updatedAt: new Date().toISOString() })
        return { id, ...data }
      },
      delete: async (id) => {
        const taskRef = doc(userRef, 'tasks', id)
        await deleteDoc(taskRef)
      }
    },
    
    habits: {
      list: async () => {
        const habitsRef = collection(userRef, 'habits')
        const q = query(habitsRef, orderBy('createdAt', 'desc'))
        const snapshot = await getDocs(q)
        return snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
      },
      create: async (data) => {
        const habitsRef = collection(userRef, 'habits')
        const docRef = await addDoc(habitsRef, {
          ...data,
          streak: 0,
          lastCompleted: null,
          createdAt: new Date().toISOString()
        })
        return { id: docRef.id, ...data, streak: 0 }
      },
      update: async (id, data) => {
        const habitRef = doc(userRef, 'habits', id)
        await updateDoc(habitRef, data)
        return { id, ...data }
      },
      delete: async (id) => {
        const habitRef = doc(userRef, 'habits', id)
        await deleteDoc(habitRef)
      },
      complete: async (id) => {
        const habitRef = doc(userRef, 'habits', id)
        const habitSnap = await getDoc(habitRef)
        if (!habitSnap.exists()) throw new Error('Habit not found')
        
        const habit = habitSnap.data()
        const today = new Date().toISOString().split('T')[0]
        const lastCompleted = habit.lastCompleted?.split('T')[0]
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
        
        let streak = habit.streak || 0
        if (lastCompleted === yesterday) streak++
        else if (lastCompleted !== today) streak = 1
        
        const updated = { streak, lastCompleted: new Date().toISOString() }
        await updateDoc(habitRef, updated)
        return { id, ...habit, ...updated }
      }
    },
    
    notes: {
      list: async (params = {}) => {
        const notesRef = collection(userRef, 'notes')
        const q = query(notesRef, orderBy('createdAt', 'desc'))
        const snapshot = await getDocs(q)
        let notes = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
        if (params.taskId) notes = notes.filter(n => n.taskId === params.taskId)
        return notes
      },
      create: async (data) => {
        const notesRef = collection(userRef, 'notes')
        const docRef = await addDoc(notesRef, {
          ...data,
          createdAt: new Date().toISOString()
        })
        return { id: docRef.id, ...data }
      },
      update: async (id, data) => {
        const noteRef = doc(userRef, 'notes', id)
        await updateDoc(noteRef, { ...data, updatedAt: new Date().toISOString() })
        return { id, ...data }
      },
      delete: async (id) => {
        const noteRef = doc(userRef, 'notes', id)
        await deleteDoc(noteRef)
      }
    },
    
    categories: {
      list: async () => {
        const categoriesRef = collection(userRef, 'categories')
        const snapshot = await getDocs(categoriesRef)
        if (snapshot.empty) {
          const defaultCategories = [
            { id: 'work', name: 'Work', color: '#ef4444', icon: 'briefcase' },
            { id: 'personal', name: 'Personal', color: '#10b981', icon: 'user' },
            { id: 'health', name: 'Health', color: '#f59e0b', icon: 'heart' },
            { id: 'learning', name: 'Learning', color: '#8b5cf6', icon: 'book' },
            { id: 'shopping', name: 'Shopping', color: '#ec4899', icon: 'shopping-cart' },
          ]
          for (const cat of defaultCategories) {
            await addDoc(categoriesRef, cat)
          }
          return defaultCategories
        }
        return snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
      }
    },
    
    timeSessions: {
      list: async (params = {}) => {
        const sessionsRef = collection(userRef, 'timeSessions')
        const q = query(sessionsRef, orderBy('startTime', 'desc'))
        const snapshot = await getDocs(q)
        let sessions = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
        if (params.taskId) sessions = sessions.filter(s => s.taskId === params.taskId)
        return sessions
      },
      create: async (data) => {
        const sessionsRef = collection(userRef, 'timeSessions')
        const docRef = await addDoc(sessionsRef, {
          ...data,
          startTime: data.startTime || new Date().toISOString(),
          endTime: null,
          duration: 0
        })
        return { id: docRef.id, ...data }
      },
      update: async (id, data) => {
        const sessionRef = doc(userRef, 'timeSessions', id)
        await updateDoc(sessionRef, data)
        return { id, ...data }
      }
    },
    
    stats: async () => {
      const tasksRef = collection(userRef, 'tasks')
      const habitsRef = collection(userRef, 'habits')
      
      const [tasksSnap, habitsSnap] = await Promise.all([
        getDocs(tasksRef),
        getDocs(habitsRef)
      ])
      
      const tasks = tasksSnap.docs.map(d => d.data())
      const habits = habitsSnap.docs.map(d => d.data())
      
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
      
      return {
        totalTasks,
        completedTasks,
        overdueTasks,
        completionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
        habitsCompletedToday: habits.filter(h => h.lastCompleted?.startsWith(today)).length
      }
    },
    
    clearAll: async () => {
      const counts = await Promise.all([
        deleteCollection(userRef, 'tasks'),
        deleteCollection(userRef, 'habits'),
        deleteCollection(userRef, 'notes'),
        deleteCollection(userRef, 'categories'),
        deleteCollection(userRef, 'timeSessions')
      ])
      return { 
        deleted: counts.reduce((a, b) => a + b, 0),
        tasks: counts[0],
        habits: counts[1],
        notes: counts[2],
        categories: counts[3],
        timeSessions: counts[4]
      }
    }
  }
}

export { createUserApi }
