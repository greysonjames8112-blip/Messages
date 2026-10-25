const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  maxHttpBufferSize: 2e7 // 20MB limit for profile pictures and files
});

app.use(express.static(path.join(__dirname)));
app.use(express.json({ limit: '50mb' }));

const DB_FILE = path.join(__dirname, 'db.json');
function getDB() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      const init = { users: {}, messages: [] };
      fs.writeFileSync(DB_FILE, JSON.stringify(init, null, 2));
      return init;
    }
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8') || '{"users":{},"messages":[]}');
  } catch (err) {
    return { users: {}, messages: [] };
  }
}

function saveDB(data) {
  try { fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2)); } catch (e) {}
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const activeSockets = {}; // socket.id -> { username, pfp }

io.on('connection', (socket) => {
  socket.on('register', ({ username, password, pfp }) => {
    if (!username || !password) return socket.emit('auth_error', 'Username and password required.');
    const u = username.trim();
    const db = getDB();
    if (db.users[u]) return socket.emit('auth_error', 'Username already taken.');
    
    db.users[u] = { password, pfp: pfp || null };
    saveDB(db);
    
    activeSockets[socket.id] = { username: u, pfp: pfp || null };
    socket.emit('auth_success', { username: u, pfp: pfp || null });
    updateOnline();
  });

  socket.on('login', ({ username, password }) => {
    if (!username || !password) return socket.emit('auth_error', 'Fill in username and password.');
    const u = username.trim();
    const db = getDB();
    if (!db.users[u] || db.users[u].password !== password) return socket.emit('auth_error', 'Invalid credentials.');
    
    const userPfp = db.users[u].pfp || null;
    activeSockets[socket.id] = { username: u, pfp: userPfp };
    socket.emit('auth_success', { username: u, pfp: userPfp });
    updateOnline();
  });

  socket.on('join_room', ({ room }) => {
    socket.rooms.forEach(r => { if (r !== socket.id) socket.leave(r); });
    socket.join(room);
    const db = getDB();
    socket.emit('message_history', (db.messages || []).filter(m => m.room === room));
  });

  socket.on('send_message', (data) => {
    const userInfo = activeSockets[socket.id];
    if (!userInfo) return;
    const msgObj = {
      id: Date.now().toString(),
      sender: userInfo.username,
      senderPfp: userInfo.pfp,
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
    if (db.messages.length > 500) db.messages.shift();
    saveDB(db);
    io.to(msgObj.room).emit('chat_message', msgObj);
  });

  // WebRTC Signaling
  socket.on('call_offer', ({ room, offer, sender, isVideo }) => {
    socket.to(room).emit('incoming_call', { offer, sender, isVideo });
  });
  socket.on('call_answer', ({ room, answer }) => {
    socket.to(room).emit('call_answered', { answer });
  });
  socket.on('ice_candidate', ({ room, candidate }) => {
    socket.to(room).emit('ice_candidate', { candidate });
  });
  socket.on('hangup', ({ room }) => {
    socket.to(room).emit('hangup');
  });

  socket.on('disconnect', () => {
    delete activeSockets[socket.id];
    updateOnline();
  });

  function updateOnline() {
    const usersList = Object.values(activeSockets).map(u => ({ username: u.username, pfp: u.pfp }));
    // Deduplicate by username
    const uniqueUsers = Array.from(new Map(usersList.map(item => [item.username, item])).values());
    io.emit('online_users', uniqueUsers);
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server live on port ${PORT}`));
