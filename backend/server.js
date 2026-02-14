import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import cron from 'node-cron';
import admin, { messaging, firestore } from './firebaseAdmin.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3456;

app.use(cors());
app.use(express.json());

const DB_PATH = path.join(__dirname, 'db.json');

const loadDB = () => {
  if (!fs.existsSync(DB_PATH)) {
    const initial = {
      tasks: [],
      categories: [
        { id: uuidv4(), name: 'Work', color: '#ef4444', icon: 'briefcase' },
        { id: uuidv4(), name: 'Personal', color: '#10b981', icon: 'user' },
        { id: uuidv4(), name: 'Health', color: '#f59e0b', icon: 'heart' },
        { id: uuidv4(), name: 'Learning', color: '#8b5cf6', icon: 'book' },
        { id: uuidv4(), name: 'Shopping', color: '#ec4899', icon: 'shopping-cart' },
      ],
      timeSessions: [],
      habits: [],
      habitLogs: [],
      notes: []
    };
    fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2));
    return initial;
  }
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
};

const saveDB = (data) => {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
};

const db = loadDB();

async function sendPushNotification(fcmToken, title, body, data = {}) {
  if (!fcmToken) return false;
  
  try {
    await messaging.send({
      token: fcmToken,
      notification: { title, body },
      data: { ...data, click_action: 'FLUTTER_NOTIFICATION_CLICK' },
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          priority: 'high',
          defaultVibrateTimings: true
        }
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1
          }
        }
      }
    });
    console.log(`Push sent: ${title}`);
    return true;
  } catch (error) {
    console.error('Push error:', error.message);
    return false;
  }
}

async function processScheduledNotifications() {
  const now = new Date();
  
  try {
    const usersSnapshot = await firestore.collection('users').get();
    
    if (usersSnapshot.empty) {
      return;
    }
    
    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data();
      const userId = userDoc.id;
      
      if (!userData.fcmToken || !userData.notificationEnabled) continue;
      
      try {
        const notificationsSnapshot = await firestore
          .collection('users')
          .doc(userId)
          .collection('notifications')
          .where('status', '==', 'pending')
          .where('scheduledFor', '<=', now.toISOString())
          .get();
        
        for (const notifDoc of notificationsSnapshot.docs) {
          const notif = notifDoc.data();
          
          await sendPushNotification(
            userData.fcmToken,
            notif.title,
            notif.body,
            { type: notif.type, id: notif.taskId || notif.habitId }
          );
          
          await notifDoc.ref.update({ 
            status: 'sent', 
            sentAt: now.toISOString() 
          });
        }
      } catch (userError) {
        console.error(`Error for user ${userId}:`, userError.message);
      }
    }
  } catch (error) {
    if (error.code !== 5) {
      console.error('Error processing notifications:', error.message);
    }
  }
}

cron.schedule('* * * * *', processScheduledNotifications);

app.post('/api/notifications/register', async (req, res) => {
  const { userId, fcmToken } = req.body;
  
  if (!userId || !fcmToken) {
    return res.status(400).json({ error: 'userId and fcmToken required' });
  }
  
  try {
    await firestore.collection('users').doc(userId).set({
      fcmToken,
      notificationEnabled: true,
      updatedAt: new Date().toISOString()
    }, { merge: true });
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to register token' });
  }
});

app.post('/api/notifications/test', async (req, res) => {
  const { fcmToken, title, body } = req.body;
  
  const result = await sendPushNotification(
    fcmToken, 
    title || 'Test Notification', 
    body || 'This is a test notification from TimeFlow!'
  );
  
  res.json({ success: result });
});

app.post('/api/notifications/schedule', async (req, res) => {
  const { userId, title, body, scheduledFor, type, relatedId } = req.body;
  
  if (!userId || !title || !scheduledFor) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  try {
    const notifRef = await firestore
      .collection('users')
      .doc(userId)
      .collection('notifications')
      .add({
        title,
        body,
        scheduledFor,
        type: type || 'general',
        relatedId: relatedId || null,
        status: 'pending',
        createdAt: new Date().toISOString()
      });
    
    res.json({ success: true, notificationId: notifRef.id });
  } catch (error) {
    res.status(500).json({ error: 'Failed to schedule notification' });
  }
});

app.delete('/api/notifications/:userId/:notificationId', async (req, res) => {
  const { userId, notificationId } = req.params;
  
  try {
    await firestore
      .collection('users')
      .doc(userId)
      .collection('notifications')
      .doc(notificationId)
      .delete();
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

app.get('/api/notifications/:userId', async (req, res) => {
  const { userId } = req.params;
  
  try {
    const snapshot = await firestore
      .collection('users')
      .doc(userId)
      .collection('notifications')
      .orderBy('scheduledFor', 'asc')
      .limit(50)
      .get();
    
    const notifications = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    res.json(notifications);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// Tasks CRUD
app.get('/api/tasks', (req, res) => {
  const { status, category, priority, search, sortBy = 'dueDate', sortOrder = 'asc' } = req.query;
  let tasks = [...db.tasks];

  if (status) tasks = tasks.filter(t => t.status === status);
  if (category) tasks = tasks.filter(t => t.category === category);
  if (priority) tasks = tasks.filter(t => t.priority === priority);
  if (search) tasks = tasks.filter(t => 
    t.title.toLowerCase().includes(search.toLowerCase()) || 
    (t.description && t.description.toLowerCase().includes(search.toLowerCase()))
  );

  const sortKey = sortBy;
  tasks.sort((a, b) => {
    let aVal = a[sortKey] || '';
    let bVal = b[sortKey] || '';
    if (sortKey === 'priority') {
      const order = { high: 3, medium: 2, low: 1 };
      aVal = order[aVal] || 0;
      bVal = order[bVal] || 0;
    }
    if (sortOrder === 'desc') return bVal > aVal ? 1 : -1;
    return aVal > bVal ? 1 : -1;
  });

  res.json(tasks);
});

app.get('/api/tasks/:id', (req, res) => {
  const task = db.tasks.find(t => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.json(task);
});

app.post('/api/tasks', (req, res) => {
  const id = uuidv4();
  const task = {
    id,
    title: req.body.title,
    description: req.body.description || '',
    category: req.body.category || 'general',
    priority: req.body.priority || 'medium',
    status: 'pending',
    dueDate: req.body.dueDate || null,
    dueTime: req.body.dueTime || null,
    estimatedMinutes: req.body.estimatedMinutes || 30,
    actualMinutes: 0,
    createdAt: new Date().toISOString(),
    completedAt: null,
    recurrence: req.body.recurrence || null,
    reminder: req.body.reminder || true
  };
  db.tasks.push(task);
  saveDB(db);
  res.status(201).json(task);
});

app.put('/api/tasks/:id', (req, res) => {
  const idx = db.tasks.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Task not found' });
  
  const task = db.tasks[idx];
  Object.keys(req.body).forEach(key => {
    if (req.body[key] !== undefined) {
      task[key] = req.body[key];
    }
  });
  if (req.body.status === 'completed' && !task.completedAt) {
    task.completedAt = new Date().toISOString();
  }
  saveDB(db);
  res.json(task);
});

app.delete('/api/tasks/:id', (req, res) => {
  db.tasks = db.tasks.filter(t => t.id !== req.params.id);
  db.timeSessions = db.timeSessions.filter(s => s.taskId !== req.params.id);
  saveDB(db);
  res.status(204).send();
});

// Categories
app.get('/api/categories', (req, res) => {
  res.json(db.categories.sort((a, b) => a.name.localeCompare(b.name)));
});

app.post('/api/categories', (req, res) => {
  if (db.categories.find(c => c.name === req.body.name)) {
    return res.status(400).json({ error: 'Category already exists' });
  }
  const cat = { id: uuidv4(), name: req.body.name, color: req.body.color || '#6366f1', icon: req.body.icon || 'folder' };
  db.categories.push(cat);
  saveDB(db);
  res.status(201).json(cat);
});

app.delete('/api/categories/:id', (req, res) => {
  db.categories = db.categories.filter(c => c.id !== req.params.id);
  saveDB(db);
  res.status(204).send();
});

// Time Sessions
app.get('/api/time-sessions', (req, res) => {
  let sessions = [...db.timeSessions];
  if (req.query.taskId) sessions = sessions.filter(s => s.taskId === req.query.taskId);
  if (req.query.startDate) sessions = sessions.filter(s => s.startTime >= req.query.startDate);
  if (req.query.endDate) sessions = sessions.filter(s => s.startTime <= req.query.endDate);
  res.json(sessions);
});

app.post('/api/time-sessions', (req, res) => {
  const session = {
    id: uuidv4(),
    taskId: req.body.taskId || null,
    startTime: req.body.startTime || new Date().toISOString(),
    endTime: null,
    duration: 0,
    type: req.body.type || 'work',
    notes: req.body.notes || ''
  };
  db.timeSessions.push(session);
  saveDB(db);
  res.status(201).json(session);
});

app.put('/api/time-sessions/:id', (req, res) => {
  const session = db.timeSessions.find(s => s.id === req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  Object.keys(req.body).forEach(key => {
    if (req.body[key] !== undefined) session[key] = req.body[key];
  });
  saveDB(db);
  res.json(session);
});

// Habits
app.get('/api/habits', (req, res) => {
  res.json(db.habits.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
});

app.post('/api/habits', (req, res) => {
  const habit = {
    id: uuidv4(),
    name: req.body.name,
    frequency: req.body.frequency || 'daily',
    targetDays: req.body.targetDays || 'mon,tue,wed,thu,fri,sat,sun',
    streak: 0,
    lastCompleted: null,
    color: req.body.color || '#10b981',
    reminder: req.body.reminder || true,
    reminderTime: req.body.reminderTime || '09:00',
    createdAt: new Date().toISOString()
  };
  db.habits.push(habit);
  saveDB(db);
  res.status(201).json(habit);
});

app.put('/api/habits/:id', (req, res) => {
  const habit = db.habits.find(h => h.id === req.params.id);
  if (!habit) return res.status(404).json({ error: 'Habit not found' });
  Object.keys(req.body).forEach(key => {
    if (req.body[key] !== undefined) habit[key] = req.body[key];
  });
  saveDB(db);
  res.json(habit);
});

app.delete('/api/habits/:id', (req, res) => {
  db.habits = db.habits.filter(h => h.id !== req.params.id);
  db.habitLogs = db.habitLogs.filter(l => l.habitId !== req.params.id);
  saveDB(db);
  res.status(204).send();
});

app.post('/api/habits/:id/complete', (req, res) => {
  const habit = db.habits.find(h => h.id === req.params.id);
  if (!habit) return res.status(404).json({ error: 'Habit not found' });
  
  const today = new Date().toISOString().split('T')[0];
  const existing = db.habitLogs.find(l => l.habitId === req.params.id && l.completedAt.startsWith(today));
  if (existing) return res.status(400).json({ error: 'Already completed today' });

  db.habitLogs.push({ id: uuidv4(), habitId: req.params.id, completedAt: new Date().toISOString() });
  
  const lastCompleted = habit.lastCompleted ? habit.lastCompleted.split('T')[0] : null;
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  
  if (lastCompleted === yesterday) {
    habit.streak += 1;
  } else if (lastCompleted !== today) {
    habit.streak = 1;
  }
  habit.lastCompleted = new Date().toISOString();
  
  saveDB(db);
  res.json(habit);
});

app.get('/api/habits/:id/logs', (req, res) => {
  res.json(db.habitLogs.filter(l => l.habitId === req.params.id).sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt)));
});

// Notes
app.get('/api/notes', (req, res) => {
  let notes = [...db.notes];
  if (req.query.taskId) notes = notes.filter(n => n.taskId === req.query.taskId);
  res.json(notes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
});

app.post('/api/notes', (req, res) => {
  const note = {
    id: uuidv4(),
    title: req.body.title || '',
    content: req.body.content || '',
    taskId: req.body.taskId || null,
    createdAt: new Date().toISOString(),
    updatedAt: null
  };
  db.notes.push(note);
  saveDB(db);
  res.status(201).json(note);
});

app.put('/api/notes/:id', (req, res) => {
  const note = db.notes.find(n => n.id === req.params.id);
  if (!note) return res.status(404).json({ error: 'Note not found' });
  if (req.body.title !== undefined) note.title = req.body.title;
  if (req.body.content !== undefined) note.content = req.body.content;
  note.updatedAt = new Date().toISOString();
  saveDB(db);
  res.json(note);
});

app.delete('/api/notes/:id', (req, res) => {
  db.notes = db.notes.filter(n => n.id !== req.params.id);
  saveDB(db);
  res.status(204).send();
});

// Statistics
app.get('/api/stats', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const startOfWeek = new Date();
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
  const startOfWeekStr = startOfWeek.toISOString().split('T')[0];

  const totalTasks = db.tasks.length;
  const completedTasks = db.tasks.filter(t => t.status === 'completed').length;
  const pendingTasks = db.tasks.filter(t => t.status !== 'completed').length;
  const overdueTasks = db.tasks.filter(t => t.status !== 'completed' && t.dueDate && t.dueDate < today).length;
  const todayTasks = db.tasks.filter(t => t.dueDate && t.dueDate.startsWith(today)).length;
  const todayCompleted = db.tasks.filter(t => t.status === 'completed' && t.completedAt && t.completedAt.startsWith(today)).length;
  const totalTimeThisWeek = db.timeSessions.filter(s => s.startTime >= startOfWeekStr).reduce((sum, s) => sum + (s.duration || 0), 0);

  const categoryBreakdown = {};
  db.tasks.forEach(t => {
    categoryBreakdown[t.category] = (categoryBreakdown[t.category] || 0) + 1;
  });

  const priorityBreakdown = {};
  db.tasks.filter(t => t.status !== 'completed').forEach(t => {
    priorityBreakdown[t.priority] = (priorityBreakdown[t.priority] || 0) + 1;
  });

  const habitsCompletedToday = db.habitLogs.filter(l => l.completedAt.startsWith(today)).length;

  res.json({
    totalTasks,
    completedTasks,
    pendingTasks,
    overdueTasks,
    todayTasks,
    todayCompleted,
    totalTimeThisWeek,
    completionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
    categoryBreakdown: Object.entries(categoryBreakdown).map(([category, count]) => ({ category, count })),
    priorityBreakdown: Object.entries(priorityBreakdown).map(([priority, count]) => ({ priority, count })),
    habitsCompletedToday
  });
});

// Serve frontend in production
const frontendPath = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(frontendPath)) {
  app.use(express.static(frontendPath));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(frontendPath, 'index.html'));
    }
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});