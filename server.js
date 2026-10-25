const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(express.static(path.join(__dirname)));
app.use(express.json({ limit: '50mb' })); // Allow large payloads for image/video uploads

// Database file path for persistence
const DB_FILE = path.join(__dirname, 'db.json');

// Initialize database if it doesn't exist
function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    const initialData = { users: {}, messages: [] };
    fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
  }
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function saveDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

const activeSockets = {}; // socket.id -> username

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // User Registration
  socket.on('register', ({ username, password }) => {
    const db = loadDB();
    username = username.trim();
    if (!username || !password) {
      return socket.emit('auth_error', 'Username and password required.');
    }
    if (db.users[username]) {
      return socket.emit('auth_error', 'Username already taken.');
    }

    db.users[username] = { password };
    saveDB(db);
    socket.emit('auth_success', { username });
  });

  // User Login
  socket.on('login', ({ username, password }) => {
    const db = loadDB();
    username = username.trim();
    if (!db.users[username] || db.users[username].password !== password) {
      return socket.emit('auth_error', 'Invalid username or password.');
    }

    activeSockets[socket.id] = username;
    socket.emit('auth_success', { username });
    updateGlobalOnlineUsers();
  });

  // Join Channel or DM Room
  socket.on('join_room', ({ room }) => {
    // Leave previous rooms except socket.id
    for (const r of socket.rooms) {
      if (r !== socket.id) socket.leave(r);
    }
    socket.join(room);

    // Send message history for this room
    const db = loadDB();
    const roomMessages = db.messages.filter(m => m.room === room);
    socket.emit('message_history', roomMessages);
  });

  // Handle Chat Message (Text or File/Image/Video)
  socket.on('send_message', (data) => {
    const username = activeSockets[socket.id];
    if (!username) return;

    const messageObj = {
      id: Date.now().toString(),
      sender: username,
      room: data.room,
      text: data.text || '',
      fileData: data.fileData || null, // Base64 file/image/video
      fileName: data.fileName || null,
      fileType: data.fileType || null, // 'image', 'video', 'file'
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const db = loadDB();
    db.messages.push(messageObj);
    // Keep last 1000 messages to prevent infinite bloat
    if (db.messages.length > 1000) db.messages.shift();
    saveDB(db);

    io.to(data.room).emit('chat_message', messageObj);
  });

  socket.on('disconnect', () => {
    delete activeSockets[socket.id];
    updateGlobalOnlineUsers();
    console.log('User disconnected:', socket.id);
  });

  function updateGlobalOnlineUsers() {
    const onlineUsers = [...new Set(Object.values(activeSockets))];
    io.emit('online_users', onlineUsers);
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
  
