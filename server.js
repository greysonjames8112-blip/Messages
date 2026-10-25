const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  maxHttpBufferSize: 1e7 // Allow up to 10MB file uploads
});

app.use(express.static(path.join(__dirname)));

// File-based database path
const DB_FILE = path.join(__dirname, 'db.json');

// Ensure db.json exists on start
function getDB() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      const init = { users: {}, messages: [] };
      fs.writeFileSync(DB_FILE, JSON.stringify(init, null, 2));
      return init;
    }
    const content = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(content || '{"users":{},"messages":[]}');
  } catch (err) {
    console.error("Error reading DB:", err);
    return { users: {}, messages: [] };
  }
}

function saveDB(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Error saving DB:", err);
  }
}

const activeSockets = {}; // socket.id -> username

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Register
  socket.on('register', ({ username, password }) => {
    if (!username || !password) return socket.emit('auth_error', 'Username and password required.');
    const u = username.trim();
    const db = getDB();

    if (db.users[u]) {
      return socket.emit('auth_error', 'Username already taken.');
    }

    db.users[u] = { password };
    saveDB(db);
    activeSockets[socket.id] = u;
    socket.emit('auth_success', { username: u });
    updateOnlineUsers();
  });

  // Login
  socket.on('login', ({ username, password }) => {
    if (!username || !password) return socket.emit('auth_error', 'Fill in username and password.');
    const u = username.trim();
    const db = getDB();

    if (!db.users[u] || db.users[u].password !== password) {
      return socket.emit('auth_error', 'Invalid username or password.');
    }

    activeSockets[socket.id] = u;
    socket.emit('auth_success', { username: u });
    updateOnlineUsers();
  });

  // Room Join
  socket.on('join_room', ({ room }) => {
    socket.rooms.forEach(r => {
      if (r !== socket.id) socket.leave(r);
    });
    socket.join(room);

    const db = getDB();
    const history = (db.messages || []).filter(m => m.room === room);
    socket.emit('message_history', history);
  });

  // Send Message
  socket.on('send_message', (data) => {
    const sender = activeSockets[socket.id];
    if (!sender) return socket.emit('chat_error', 'You are not logged in!');

    const msgObj = {
      id: Date.now().toString(),
      sender,
      room: data.room || 'general',
      text: data.text || '',
      fileData: data.fileData || null,
      fileName: data.fileName || null,
      fileType: data.fileType || null,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const db = getDB();
    if (!db.messages) db.messages = [];
    db.messages.push(msgObj);
    if (db.messages.length > 500) db.messages.shift(); // Keep last 500
    saveDB(db);

    io.to(msgObj.room).emit('chat_message', msgObj);
  });

  socket.on('disconnect', () => {
    delete activeSockets[socket.id];
    updateOnlineUsers();
  });

  function updateOnlineUsers() {
    const list = [...new Set(Object.values(activeSockets))];
    io.emit('online_users', list);
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server live on port ${PORT}`));
