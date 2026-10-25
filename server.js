const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Enable CORS for Socket.io
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Serve static HTML/CSS/JS from current folder
app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Store connected users
const users = {};

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // Handle user joining
  socket.on('join', (data) => {
    if (!data || !data.username) return;

    const username = data.username.trim();
    const channel = data.channel || 'general';

    users[socket.id] = { username, channel };
    socket.join(channel);
    
    // Send system message
    io.to(channel).emit('system_message', {
      text: `${username} joined #${channel}`
    });

    updateUserList(channel);
  });

  // Handle channel switching
  socket.on('switch_channel', (newChannel) => {
    if (!users[socket.id]) return;
    const oldChannel = users[socket.id].channel;
    
    socket.leave(oldChannel);
    users[socket.id].channel = newChannel;
    socket.join(newChannel);

    io.to(oldChannel).emit('system_message', { text: `${users[socket.id].username} left #${oldChannel}` });
    io.to(newChannel).emit('system_message', { text: `${users[socket.id].username} joined #${newChannel}` });

    updateUserList(oldChannel);
    updateUserList(newChannel);
  });

  // Handle chat messages
  socket.on('chat_message', (msgData) => {
    const user = users[socket.id];
    if (user && msgData && msgData.text) {
      const trimmedText = msgData.text.trim();
      if (trimmedText.length === 0) return;

      io.to(user.channel).emit('chat_message', {
        user: user.username,
        text: trimmedText,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });
    }
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    const user = users[socket.id];
    if (user) {
      io.to(user.channel).emit('system_message', { text: `${user.username} left the server.` });
      const channel = user.channel;
      delete users[socket.id];
      updateUserList(channel);
    }
  });

  function updateUserList(channel) {
    const channelUsers = Object.values(users)
      .filter(u => u.channel === channel)
      .map(u => u.username);
    io.to(channel).emit('user_list', channelUsers);
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
