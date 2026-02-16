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
  if (!fcmToken) {
    console.error('❌ No FCM token provided');
    return false;
  }
  
  try {
    const message = {
      token: fcmToken,
      notification: {
        title: title,
        body: body
      },
      data: { 
        title: title,
        body: body,
        ...data, 
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
        url: data.url || '/'
      },
      android: {
        priority: 'high',
        notification: {
          title: title,
          body: body,
          sound: 'default',
          priority: 'high',
          channelId: 'timeflow-notifications'
        }
      },
      apns: {
        payload: {
          aps: {
            alert: {
              title: title,
              body: body
            },
            sound: 'default',
            badge: 1,
            contentAvailable: true
          }
        }
      },
      webpush: {
        headers: {
          Urgency: 'high',
          'Content-Type': 'application/json'
        },
        notification: {
          title: title,
          body: body,
          icon: '/icon-192x192.png',
          badge: '/icon-192x192.png',
          tag: data.tag || 'timeflow',
          requireInteraction: true,
          vibrate: [200, 100, 200]
        }
      }
    };
    
    const messageId = await messaging.send(message);
    console.log(`✅ Push sent (messageId: ${messageId}): ${title}`);
    console.log(`   Body: ${body}`);
    console.log(`   Token: ${fcmToken.substring(0, 30)}...`);
    return true;
  } catch (error) {
    console.error('❌ Push error:', error.message);
    console.error('   Error code:', error.code);
    console.error('   Token:', fcmToken.substring(0, 30) + '...');
    if (error.code === 'messaging/registration-token-not-registered') {
      console.log('⚠️ Token not registered - should be removed from database');
    }
    return false;
  }
}

async function processScheduledNotifications() {
  const now = new Date();
  
  try {
    const usersSnapshot = await firestore.collection('users').get();
    
    if (usersSnapshot.empty) {
      console.log('ℹ️ No users found in Firestore');
      return;
    }
    
    console.log(`📋 Found ${usersSnapshot.size} users`);
    let processedCount = 0;
    let sentCount = 0;
    
    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data();
      const userId = userDoc.id;
      
      console.log(`👤 Checking user ${userId}...`);
      
      if (!userData.fcmToken) {
        console.log(`  ⚠️ No FCM token for user ${userId}`);
        continue;
      }
      
      console.log(`  📱 FCM token: ${userData.fcmToken.substring(0, 30)}...`);
      
      try {
        const notificationsSnapshot = await firestore
          .collection('users')
          .doc(userId)
          .collection('notifications')
          .where('status', '==', 'pending')
          .get();
        
        if (notificationsSnapshot.empty) {
          console.log(`  ℹ️ No pending notifications for user ${userId}`);
          continue;
        }
        
        console.log(`  📬 Found ${notificationsSnapshot.size} pending notifications`);
        
        const nowTime = now.getTime();
        
        const dueNotifications = [];
        const futureNotifications = [];
        
        for (const notifDoc of notificationsSnapshot.docs) {
          const notif = notifDoc.data();
          const scheduledTime = new Date(notif.scheduledFor).getTime();
          const diff = Math.round((scheduledTime - nowTime) / 1000);
          
          if (scheduledTime > nowTime) {
            console.log(`  ⏳ "${notif.title}" scheduled in ${diff}s (${notif.scheduledFor})`);
            futureNotifications.push({ doc: notifDoc, data: notif });
          } else {
            dueNotifications.push({ doc: notifDoc, data: notif, scheduledTime });
          }
        }
        
        const taskNotifications = new Map();
        const habitNotifications = new Map();
        const otherNotifications = [];
        
        for (const item of dueNotifications) {
          const { doc, data, scheduledTime } = item;
          const key = data.relatedId || 'general';
          
          if (data.type === 'task' && data.relatedId) {
            if (!taskNotifications.has(key) || taskNotifications.get(key).scheduledTime < scheduledTime) {
              taskNotifications.set(key, item);
            }
          } else if (data.type === 'habit' && data.relatedId) {
            if (!habitNotifications.has(key) || habitNotifications.get(key).scheduledTime < scheduledTime) {
              habitNotifications.set(key, item);
            }
          } else {
            otherNotifications.push(item);
          }
        }
        
        const toSend = [
          ...taskNotifications.values(),
          ...habitNotifications.values(),
          ...otherNotifications
        ];
        
        const toMarkSent = dueNotifications.filter(item => !toSend.includes(item));
        
        for (const { doc } of toMarkSent) {
          await doc.ref.update({ status: 'superseded', supersededAt: now.toISOString() });
          console.log(`  🔄 Marked as superseded: "${doc.data().title}"`);
        }
        
        for (const { doc, data: notif } of toSend) {
          processedCount++;
          console.log(`  🔔 SENDING: "${notif.title}" - ${notif.body}`);
          
          const sent = await sendPushNotification(
            userData.fcmToken,
            notif.title,
            notif.body,
            { type: notif.type, id: notif.relatedId || '', tag: notif.tag || doc.id }
          );
          
          if (sent) {
            await doc.ref.update({ 
              status: 'sent', 
              sentAt: now.toISOString() 
            });
            sentCount++;
            console.log(`  ✅ Notification sent successfully`);
          } else {
            console.log(`  ❌ Failed to send notification`);
          }
        }
      } catch (userError) {
        console.error(`  ❌ Error for user ${userId}:`, userError.message);
      }
    }
    
    console.log(`📊 Summary: processed=${processedCount}, sent=${sentCount}`);
  } catch (error) {
    console.error('❌ Error processing notifications:', error.message);
    console.error('Error code:', error.code);
  }
}

cron.schedule('* * * * *', () => {
  console.log(`[${new Date().toISOString()}] Running notification check...`);
  processScheduledNotifications();
});

cron.schedule('0 * * * *', async () => {
  console.log(`[${new Date().toISOString()}] Cleaning up old notifications...`);
  try {
    const usersSnapshot = await firestore.collection('users').get();
    
    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      
      const oldNotifs = await firestore
        .collection('users')
        .doc(userId)
        .collection('notifications')
        .where('status', 'in', ['sent', 'superseded'])
        .get();
      
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
      let deleted = 0;
      
      for (const doc of oldNotifs.docs) {
        const data = doc.data();
        const sentTime = data.sentAt || data.supersededAt || data.createdAt;
        if (sentTime && new Date(sentTime).getTime() < oneDayAgo) {
          await doc.ref.delete();
          deleted++;
        }
      }
      
      if (deleted > 0) {
        console.log(`  🧹 Deleted ${deleted} old notifications for user ${userId}`);
      }
    }
  } catch (error) {
    console.error('Cleanup error:', error.message);
  }
});

app.get('/api/notifications/test-direct/:userId', async (req, res) => {
  const { userId } = req.params;
  
  try {
    const userDoc = await firestore.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userData = userDoc.data();
    
    if (!userData.fcmToken) {
      return res.status(400).json({ error: 'User has no FCM token registered' });
    }
    
    console.log(`\n🎯 DIRECT TEST for user ${userId}`);
    console.log(`📱 Token: ${userData.fcmToken}`);
    
    const message = {
      token: userData.fcmToken,
      notification: {
        title: '🔔 DIRECT TEST',
        body: 'This is a direct test notification!'
      },
      data: {
        title: '🔔 DIRECT TEST',
        body: 'This is a direct test notification!',
        url: '/',
        click_action: 'FLUTTER_NOTIFICATION_CLICK'
      },
      android: {
        priority: 'high',
        notification: {
          title: '🔔 DIRECT TEST',
          body: 'This is a direct test notification!',
          sound: 'default',
          priority: 'high',
          channelId: 'timeflow-notifications',
          visibility: 'public'
        }
      },
      apns: {
        payload: {
          aps: {
            alert: {
              title: '🔔 DIRECT TEST',
              body: 'This is a direct test notification!'
            },
            sound: 'default',
            badge: 1
          }
        }
      },
      webpush: {
        headers: {
          Urgency: 'high',
          TTL: '60'
        },
        notification: {
          title: '🔔 DIRECT TEST',
          body: 'This is a direct test notification!',
          icon: '/icon-192x192.png',
          badge: '/icon-192x192.png',
          tag: 'test-direct',
          requireInteraction: true,
          vibrate: [200, 100, 200, 100, 200]
        }
      }
    };
    
    const messageId = await messaging.send(message);
    console.log(`✅ Sent! MessageId: ${messageId}\n`);
    
    res.json({ 
      success: true, 
      messageId,
      token: userData.fcmToken.substring(0, 30) + '...',
      sentAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Direct test error:', error);
    res.status(500).json({ error: error.message, code: error.code });
  }
});

app.get('/api/notifications/cleanup/:userId', async (req, res) => {
  const { userId } = req.params;
  
  try {
    const snapshot = await firestore
      .collection('users')
      .doc(userId)
      .collection('notifications')
      .get();
    
    let deleted = 0;
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    
    for (const doc of snapshot.docs) {
      const data = doc.data();
      const scheduledTime = new Date(data.scheduledFor).getTime();
      
      if (scheduledTime < oneHourAgo || data.status === 'sent' || data.status === 'superseded') {
        await doc.ref.delete();
        deleted++;
      }
    }
    
    res.json({ success: true, deleted, remaining: snapshot.size - deleted });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/notifications/list/:userId', async (req, res) => {
  const { userId } = req.params;
  
  try {
    const snapshot = await firestore
      .collection('users')
      .doc(userId)
      .collection('notifications')
      .orderBy('scheduledFor', 'desc')
      .limit(20)
      .get();
    
    const notifications = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    res.json({ count: notifications.length, notifications });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

setInterval(async () => {
  const serverUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
  try {
    const response = await fetch(`${serverUrl}/api/health`);
    console.log(`[${new Date().toISOString()}] Keep-alive ping: ${response.status}`);
  } catch (error) {
    console.log(`[${new Date().toISOString()}] Keep-alive ping failed: ${error.message}`);
  }
}, 4 * 60 * 1000);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/notifications/status/:userId', async (req, res) => {
  const { userId } = req.params;
  
  try {
    const userDoc = await firestore.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      return res.json({ registered: false, reason: 'User not found in Firestore' });
    }
    
    const userData = userDoc.data();
    
    res.json({
      registered: !!userData.fcmToken,
      hasToken: !!userData.fcmToken,
      tokenPreview: userData.fcmToken ? userData.fcmToken.substring(0, 30) + '...' : null,
      notificationEnabled: userData.notificationEnabled,
      updatedAt: userData.updatedAt
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

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

app.post('/api/notifications/test-user/:userId', async (req, res) => {
  const { userId } = req.params;
  const { title, body } = req.body;
  
  try {
    const userDoc = await firestore.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userData = userDoc.data();
    
    if (!userData.fcmToken) {
      return res.status(400).json({ error: 'User has no FCM token registered' });
    }
    
    console.log(`Testing notification for user ${userId}`);
    console.log(`FCM Token: ${userData.fcmToken.substring(0, 30)}...`);
    
    const result = await sendPushNotification(
      userData.fcmToken,
      title || '🧪 Test Notification',
      body || 'This is a test from TimeFlow backend!'
    );
    
    res.json({ success: result, hasToken: true });
  } catch (error) {
    console.error('Test notification error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/notifications/schedule', async (req, res) => {
  const { userId, title, body, scheduledFor, type, relatedId, tag } = req.body;
  
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
        tag: tag || null,
        status: 'pending',
        createdAt: new Date().toISOString()
      });
    
    console.log(`📅 Scheduled notification: "${title}" for ${scheduledFor}`);
    res.json({ success: true, notificationId: notifRef.id });
  } catch (error) {
    console.error('❌ Failed to schedule notification:', error);
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

app.delete('/api/notifications/:userId/task/:taskId', async (req, res) => {
  const { userId, taskId } = req.params;
  
  try {
    const snapshot = await firestore
      .collection('users')
      .doc(userId)
      .collection('notifications')
      .where('relatedId', '==', taskId)
      .where('type', '==', 'task')
      .get();
    
    const deletePromises = snapshot.docs.map(doc => doc.ref.delete());
    await Promise.all(deletePromises);
    
    console.log(`🗑️ Deleted ${snapshot.size} notifications for task ${taskId}`);
    res.json({ success: true, deleted: snapshot.size });
  } catch (error) {
    console.error('Error deleting task notifications:', error);
    res.status(500).json({ error: 'Failed to delete task notifications' });
  }
});

app.delete('/api/notifications/:userId/habit/:habitId', async (req, res) => {
  const { userId, habitId } = req.params;
  
  try {
    const snapshot = await firestore
      .collection('users')
      .doc(userId)
      .collection('notifications')
      .where('relatedId', '==', habitId)
      .where('type', '==', 'habit')
      .get();
    
    const deletePromises = snapshot.docs.map(doc => doc.ref.delete());
    await Promise.all(deletePromises);
    
    console.log(`🗑️ Deleted ${snapshot.size} notifications for habit ${habitId}`);
    res.json({ success: true, deleted: snapshot.size });
  } catch (error) {
    console.error('Error deleting habit notifications:', error);
    res.status(500).json({ error: 'Failed to delete habit notifications' });
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

app.delete('/api/tasks/:id', async (req, res) => {
  const taskId = req.params.id;
  
  db.tasks = db.tasks.filter(t => t.id !== taskId);
  db.timeSessions = db.timeSessions.filter(s => s.taskId !== taskId);
  saveDB(db);
  
  try {
    const usersSnapshot = await firestore.collection('users').get();
    for (const userDoc of usersSnapshot.docs) {
      const snapshot = await firestore
        .collection('users')
        .doc(userDoc.id)
        .collection('notifications')
        .where('relatedId', '==', taskId)
        .where('type', '==', 'task')
        .get();
      
      for (const doc of snapshot.docs) {
        await doc.ref.delete();
      }
      if (snapshot.size > 0) {
        console.log(`🗑️ Deleted ${snapshot.size} notifications for task ${taskId} (user ${userDoc.id})`);
      }
    }
  } catch (error) {
    console.error('Error deleting task notifications from Firestore:', error.message);
  }
  
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

app.delete('/api/habits/:id', async (req, res) => {
  const habitId = req.params.id;
  
  db.habits = db.habits.filter(h => h.id !== habitId);
  db.habitLogs = db.habitLogs.filter(l => l.habitId !== habitId);
  saveDB(db);
  
  try {
    const usersSnapshot = await firestore.collection('users').get();
    for (const userDoc of usersSnapshot.docs) {
      const snapshot = await firestore
        .collection('users')
        .doc(userDoc.id)
        .collection('notifications')
        .where('relatedId', '==', habitId)
        .where('type', '==', 'habit')
        .get();
      
      for (const doc of snapshot.docs) {
        await doc.ref.delete();
      }
      if (snapshot.size > 0) {
        console.log(`🗑️ Deleted ${snapshot.size} notifications for habit ${habitId} (user ${userDoc.id})`);
      }
    }
  } catch (error) {
    console.error('Error deleting habit notifications from Firestore:', error.message);
  }
  
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
console.log('🔍 Frontend path:', frontendPath);
console.log('🔍 Frontend dist exists:', fs.existsSync(frontendPath));

if (fs.existsSync(frontendPath)) {
  const distFiles = fs.readdirSync(frontendPath);
  console.log('📁 Dist contents:', distFiles);
  
  const swFile = path.join(frontendPath, 'firebase-messaging-sw.js');
  console.log('🔍 SW file path:', swFile);
  console.log('🔍 SW file exists:', fs.existsSync(swFile));
}

if (fs.existsSync(frontendPath)) {
  // Service worker MUST be served before any other middleware
  app.get('/firebase-messaging-sw.js', (req, res, next) => {
    const swPath = path.join(frontendPath, 'firebase-messaging-sw.js');
    console.log('📥 SW request received');
    
    if (!fs.existsSync(swPath)) {
      console.error('❌ SW not found');
      return res.status(404).send('// SW not found');
    }
    
    const content = fs.readFileSync(swPath, 'utf8');
    console.log('📤 Sending SW, length:', content.length);
    res.type('application/javascript');
    res.setHeader('Service-Worker-Allowed', '/');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.send(content);
  });
  
  // Static files
  app.use(express.static(frontendPath));
  
  // SPA fallback - ONLY for non-API, non-file routes
  app.get('*', (req, res) => {
    // Skip API routes
    if (req.path.startsWith('/api')) {
      return
    }
    // Skip static file requests
    if (req.path.match(/\.\w+$/)) {
      return res.status(404).send('File not found')
    }
    res.sendFile(path.join(frontendPath, 'index.html'));
  });
} else {
  console.log('⚠️ No frontend dist folder - running in API-only mode');
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});