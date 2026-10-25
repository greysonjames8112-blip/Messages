const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  maxHttpBufferSize: 1e7
});

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
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Discord Clone</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: sans-serif; }
    /* Use 100dvh so mobile browser address bars never clip the bottom input bar */
    html, body { height: 100dvh; width: 100vw; overflow: hidden; background-color: #313338; color: #dbdee1; }
    #app { display: flex; height: 100dvh; width: 100vw; overflow: hidden; }
    
    #auth-modal {
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 0, 0, 0.85); display: flex; justify-content: center; align-items: center; z-index: 9999;
    }
    .modal-box { background: #313338; padding: 32px; border-radius: 8px; width: 360px; text-align: center; border: 1px solid #1e1f22; }
    .modal-box h2 { color: #f2f3f5; margin-bottom: 8px; }
    .modal-box p { color: #949ba4; font-size: 13px; margin-bottom: 16px; }
    .modal-box input {
      width: 100%; padding: 12px; border-radius: 4px; border: 1px solid #1e1f22;
      background: #1e1f22; color: #f2f3f5; font-size: 15px; margin-bottom: 12px; outline: none;
    }
    .modal-box button {
      width: 100%; padding: 12px; background: #5865f2; border: none; border-radius: 4px;
      color: white; font-size: 15px; font-weight: bold; cursor: pointer; margin-bottom: 12px;
    }
    .modal-box button:hover { background: #4752c4; }
    .switch-auth { color: #00a8fc; font-size: 13px; cursor: pointer; text-decoration: underline; }
    .error-msg { color: #fa777c; font-size: 13px; margin-bottom: 12px; }

    .servers-bar { width: 72px; background: #1e1f22; display: flex; flex-direction: column; align-items: center; padding-top: 12px; flex-shrink: 0; }
    .server-icon { width: 48px; height: 48px; background: #5865f2; border-radius: 16px; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; }

    .channels-sidebar { width: 220px; background: #2b2d31; display: flex; flex-direction: column; flex-shrink: 0; }
    .server-header { height: 48px; padding: 0 16px; border-bottom: 1px solid #1f2023; display: flex; align-items: center; font-weight: bold; color: #f2f3f5; flex-shrink: 0; }
    .channel-list { padding: 12px 8px; flex: 1; overflow-y: auto; min-height: 0; }
    .category { font-size: 11px; font-weight: bold; color: #949ba4; text-transform: uppercase; margin: 12px 0 6px 8px; }
    .channel-item { padding: 8px; border-radius: 4px; cursor: pointer; color: #949ba4; font-size: 14px; margin-bottom: 2px; }
    .channel-item:hover, .channel-item.active { background: #35373c; color: #f2f3f5; }

    .chat-area { flex: 1; display: flex; flex-direction: column; background: #313338; min-width: 0; height: 100%; }
    .chat-header { height: 48px; border-bottom: 1px solid #202225; display: flex; align-items: center; padding: 0 16px; font-weight: bold; color: #f2f3f5; flex-shrink: 0; }
    .status-dot { width: 8px; height: 8px; border-radius: 50%; background: #fa777c; margin-right: 8px; flex-shrink: 0; }
    .status-dot.online { background: #23a55a; }

    .messages-container { flex: 1; padding: 16px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; min-height: 0; }
    .message { display: flex; gap: 12px; }
    .avatar { width: 38px; height: 38px; border-radius: 50%; background: #5865f2; display: flex; align-items: center; justify-content: center; font-weight: bold; color: white; flex-shrink: 0; }
    .msg-body { display: flex; flex-direction: column; max-width: 85%; }
    .msg-header { display: flex; align-items: baseline; gap: 8px; }
    .username { font-weight: bold; color: #f2f3f5; font-size: 14px; }
    .time { font-size: 11px; color: #949ba4; }
    .text { color: #dbdee1; font-size: 14px; margin-top: 4px; word-wrap: break-word; }
    
    .media-preview { max-width: 300px; max-height: 200px; border-radius: 6px; margin-top: 6px; display: block; }
    .file-attachment { background: #2b2d31; padding: 8px 12px; border-radius: 4px; display: inline-block; margin-top: 6px; color: #00a8fc; text-decoration: none; font-size: 13px; }

    .input-area { padding: 12px 16px; flex-shrink: 0; background: #313338; }
    .input-form { background: #383a40; border-radius: 8px; padding: 8px 12px; display: flex; align-items: center; gap: 10px; }
    .file-btn { color: #b5bac1; cursor: pointer; font-size: 18px; font-weight: bold; }
    .input-form input[type="text"] { flex: 1; background: transparent; border: none; color: #f2f3f5; font-size: 14px; outline: none; }

    .users-sidebar { width: 180px; background: #2b2d31; padding: 16px; flex-shrink: 0; overflow-y: auto; display: none; }
    @media(min-width: 768px) { .users-sidebar { display: block; } }
    .user-item { display: flex; align-items: center; gap: 8px; padding: 6px; color: #949ba4; font-size: 13px; cursor: pointer; border-radius: 4px; }
    .user-item:hover { background: #35373c; color: #f2f3f5; }
  </style>
</head>
<body>

  <div id="auth-modal">
    <div class="modal-box">
      <h2 id="modal-title">Welcome Back</h2>
      <p id="modal-desc">Log in to start chatting.</p>
      <div id="auth-error" class="error-msg"></div>
      <form onsubmit="submitAuth(event)">
        <input type="text" id="auth-user" placeholder="Username" required autocomplete="off" />
        <input type="password" id="auth-pass" placeholder="Password" required />
        <button type="submit" id="auth-btn">Log In</button>
      </form>
      <div class="switch-auth" onclick="toggleAuth()" id="switch-btn">Need an account? Register</div>
    </div>
  </div>

  <div id="app">
    <div class="servers-bar"><div class="server-icon">D</div></div>
    <div class="channels-sidebar">
      <div class="server-header" id="current-user-display">My Server</div>
      <div class="channel-list">
        <div class="category">Text Channels</div>
        <div class="channel-item active" onclick="switchChannel('general', this)"># general</div>
        <div class="channel-item" onclick="switchChannel('random', this)"># random</div>
        <div class="channel-item" onclick="switchChannel('gaming', this)"># gaming</div>
        <div class="category">Direct Messages</div>
        <div id="dm-list"></div>
      </div>
    </div>

    <div class="chat-area">
      <div class="chat-header">
        <div class="status-dot" id="net-status"></div>
        <span id="room-title"># general</span>
      </div>
      <div class="messages-container" id="messages-list"></div>
      <div class="input-area">
        <form class="input-form" onsubmit="sendMessage(event)">
          <label class="file-btn" title="Upload File">+<input type="file" id="file-input" style="display:none" onchange="attachFile(event)"></label>
          <input type="text" id="msg-input" placeholder="Message #general" autocomplete="off" />
        </form>
      </div>
    </div>

    <div class="users-sidebar">
      <div class="category" id="online-count">ONLINE — 0</div>
      <div id="online-users"></div>
    </div>
  </div>

  <script src="/socket.io/socket.io.js"></script>
  <script>
    const socket = io();
    let me = '';
    let currentRoom = 'general';
    let isRegister = false;
    let fileObj = null;

    socket.on('connect', () => document.getElementById('net-status').classList.add('online'));
    socket.on('disconnect', () => document.getElementById('net-status').classList.remove('online'));

    function toggleAuth() {
      isRegister = !isRegister;
      document.getElementById('modal-title').innerText = isRegister ? 'Create Account' : 'Welcome Back';
      document.getElementById('auth-btn').innerText = isRegister ? 'Register' : 'Log In';
      document.getElementById('switch-btn').innerText = isRegister ? 'Already have an account? Log In' : 'Need an account? Register';
      document.getElementById('auth-error').innerText = '';
    }

    function submitAuth(e) {
      e.preventDefault();
      const username = document.getElementById('auth-user').value;
      const password = document.getElementById('auth-pass').value;
      if (isRegister) socket.emit('register', { username, password });
      else socket.emit('login', { username, password });
    }

    socket.on('auth_error', (msg) => document.getElementById('auth-error').innerText = msg);
    socket.on('auth_success', (data) => {
      me = data.username;
      document.getElementById('auth-modal').style.display = 'none';
      document.getElementById('current-user-display').innerText = \`👤 \${me}\`;
      socket.emit('join_room', { room: currentRoom });
    });

    function switchChannel(roomName, el) {
      if (!me) return;
      currentRoom = roomName;
      const label = roomName.startsWith('dm_') ? \`DM: \${roomName.replace('dm_', '').replace(me, '').replace(/_/g, '')}\` : \`# \${roomName}\`;
      document.getElementById('room-title').innerText = label;
      document.getElementById('msg-input').placeholder = \`Message \${label}\`;
      document.getElementById('messages-list').innerHTML = '';
      document.querySelectorAll('.channel-item').forEach(c => c.classList.remove('active'));
      if (el) el.classList.add('active');
      socket.emit('join_room', { room: currentRoom });
    }

    function startDM(targetUser) {
      if (targetUser === me) return;
      const pair = [me, targetUser].sort();
      switchChannel(\`dm_\${pair[0]}_\${pair[1]}\`, null);
    }

    function attachFile(e) {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function(evt) {
        let type = 'file';
        if (file.type.startsWith('image/')) type = 'image';
        if (file.type.startsWith('video/')) type = 'video';
        fileObj = { fileData: evt.target.result, fileName: file.name, fileType: type };
        document.getElementById('msg-input').placeholder = \`[Attached: \${file.name}] Press Enter\`;
      };
      reader.readAsDataURL(file);
    }

    function sendMessage(e) {
      e.preventDefault();
      const input = document.getElementById('msg-input');
      const text = input.value.trim();
      if ((text || fileObj) && me) {
        socket.emit('send_message', {
          room: currentRoom, text,
          fileData: fileObj ? fileObj.fileData : null,
          fileName: fileObj ? fileObj.fileName : null,
          fileType: fileObj ? fileObj.fileType : null
        });
        input.value = '';
        fileObj = null;
        document.getElementById('file-input').value = '';
        document.getElementById('msg-input').placeholder = \`Message \${document.getElementById('room-title').innerText}\`;
      }
    }

    socket.on('message_history', (msgs) => {
      const box = document.getElementById('messages-list');
      box.innerHTML = '';
      msgs.forEach(appendMsg);
      box.scrollTop = box.scrollHeight;
    });

    socket.on('chat_message', (msg) => {
      appendMsg(msg);
      const box = document.getElementById('messages-list');
      box.scrollTop = box.scrollHeight;
    });

    function appendMsg(m) {
      const box = document.getElementById('messages-list');
      const div = document.createElement('div');
      div.className = 'message';
      let media = '';
      if (m.fileData) {
        if (m.fileType === 'image') media = \`<img src="\${m.fileData}" class="media-preview">\`;
        else if (m.fileType === 'video') media = \`<video src="\${m.fileData}" controls class="media-preview"></video>\`;
        else media = \`<a href="\${m.fileData}" download="\${m.fileName}" class="file-attachment">📎 \${esc(m.fileName)}</a>\`;
      }
      div.innerHTML = \`
        <div class="avatar">\${esc(m.sender[0].toUpperCase())}</div>
        <div class="msg-body">
          <div class="msg-header">
            <span class="username">\${esc(m.sender)}</span>
            <span class="time">\${m.time}</span>
          </div>
          <div class="text">\${esc(m.text)}</div>
          \${media}
        </div>
      \`;
      box.appendChild(div);
    }

    socket.on('online_users', (users) => {
      document.getElementById('online-count').innerText = \`ONLINE — \${users.length}\`;
      document.getElementById('online-users').innerHTML = users.map(u => \`
        <div class="user-item" onclick="startDM('\${u}')">
          <span style="color:#23a55a">●</span> \${esc(u)} \${u === me ? '(You)' : ''}
        </div>
      \`).join('');
      document.getElementById('dm-list').innerHTML = users.filter(u => u !== me).map(u => \`
        <div class="channel-item" onclick="startDM('\${u}')">💬 \${esc(u)}</div>
      \`).join('');
    });

    function esc(s) {
      return (s || '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
    }
  </script>
</body>
</html>`);
});

const activeSockets = {};

io.on('connection', (socket) => {
  socket.on('register', ({ username, password }) => {
    if (!username || !password) return socket.emit('auth_error', 'Username and password required.');
    const u = username.trim();
    const db = getDB();
    if (db.users[u]) return socket.emit('auth_error', 'Username already taken.');
    db.users[u] = { password };
    saveDB(db);
    activeSockets[socket.id] = u;
    socket.emit('auth_success', { username: u });
    updateOnline();
  });

  socket.on('login', ({ username, password }) => {
    if (!username || !password) return socket.emit('auth_error', 'Fill in username and password.');
    const u = username.trim();
    const db = getDB();
    if (!db.users[u] || db.users[u].password !== password) return socket.emit('auth_error', 'Invalid credentials.');
    activeSockets[socket.id] = u;
    socket.emit('auth_success', { username: u });
    updateOnline();
  });

  socket.on('join_room', ({ room }) => {
    socket.rooms.forEach(r => { if (r !== socket.id) socket.leave(r); });
    socket.join(room);
    const db = getDB();
    socket.emit('message_history', (db.messages || []).filter(m => m.room === room));
  });

  socket.on('send_message', (data) => {
    const sender = activeSockets[socket.id];
    if (!sender) return;
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
    if (db.messages.length > 500) db.messages.shift();
    saveDB(db);
    io.to(msgObj.room).emit('chat_message', msgObj);
  });

  socket.on('disconnect', () => {
    delete activeSockets[socket.id];
    updateOnline();
  });

  function updateOnline() {
    io.emit('online_users', [...new Set(Object.values(activeSockets))]);
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server live on port ${PORT}`));
