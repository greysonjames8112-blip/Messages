const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static HTML/CSS/JS from the public directory (or current directory)
app.use(express.static(path.join(__dirname)));

// Store connected users and messages
const users = {};

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // Handle user joining
  socket.on('join', (data) => {
    users[socket.id] = { username: data.username, channel: data.channel || 'general' };
    socket.join(users[socket.id].channel);
    
    // Notify room that user connected
    io.to(users[socket.id].channel).emit('system_message', {
      text: `${data.username} has joined #${users[socket.id].channel}`
    });

    // Send active user list
    updateUserList(users[socket.id].channel);
  });

  // Handle channel switching
  socket.on('switch_channel', (newChannel) => {
    if (!users[socket.id]) return;
    const oldChannel = users[socket.id].channel;
    
    socket.leave(oldChannel);
    users[socket.id].channel = newChannel;
    socket.join(newChannel);

    io.to(oldChannel).emit('system_message', { text: `${users[socket.id].username} left the channel.` });
    io.to(newChannel).emit('system_message', { text: `${users[socket.id].username} joined #${newChannel}` });

    updateUserList(oldChannel);
    updateUserList(newChannel);
  });

  // Handle chat messages
  socket.on('chat_message', (msgData) => {
    const user = users[socket.id];
    if (user) {
      io.to(user.channel).emit('chat_message', {
        user: user.username,
        text: msgData.text,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });
    }
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    const user = users[socket.id];
    if (user) {
      io.to(user.channel).emit('system_message', { text: `${user.username} disconnected.` });
      delete users[socket.id];
      updateUserList(user.channel);
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
        
