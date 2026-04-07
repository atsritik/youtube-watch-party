const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

const rooms = {};

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join_room', ({ roomId, username }) => {
    socket.join(roomId);

    // Create room if it doesn't exist
    if (!rooms[roomId]) {
      rooms[roomId] = {
        hostId: socket.id,
        videoId: 'dQw4w9WgXcQ',
        playing: false,
        participants: []
      };
    }

    // Role Logic: First joiner is Host, others are Participants
    const role = (socket.id === rooms[roomId].hostId) ? 'Host' : 'Participant';
    const newUser = { userId: socket.id, username: username || 'Anonymous', role };
    rooms[roomId].participants.push(newUser);

    // Send the user their role immediately
    socket.emit('role_assigned', { 
      userId: socket.id, 
      role: role, 
      participants: rooms[roomId].participants 
    });

    // Sync current video state to the new user
    socket.emit('sync_state', {
      videoId: rooms[roomId].videoId,
      playing: rooms[roomId].playing
    });

    // Update the list for everyone in the room
    io.to(roomId).emit('update_participants', {
      participants: rooms[roomId].participants
    });
  });

  const hasControl = (roomId) => {
    const user = rooms[roomId]?.participants.find(p => p.userId === socket.id);
    return user && (user.role === 'Host' || user.role === 'Moderator');
  };

  // Sync actions
  socket.on('play', ({ roomId }) => {
    if (hasControl(roomId)) socket.to(roomId).emit('play');
  });

  socket.on('pause', ({ roomId }) => {
    if (hasControl(roomId)) socket.to(roomId).emit('pause');
  });

  socket.on('seek', ({ roomId, time }) => {
    if (hasControl(roomId)) socket.to(roomId).emit('seek', { time });
  });

  socket.on('change_video', ({ roomId, videoId }) => {
    if (hasControl(roomId)) {
      rooms[roomId].videoId = videoId;
      io.to(roomId).emit('change_video', { videoId });
    }
  });

  // Admin Actions (Host only)
  socket.on('assign_role', ({ roomId, userId, role }) => {
    if (rooms[roomId]?.hostId === socket.id) {
      const target = rooms[roomId].participants.find(p => p.userId === userId);
      if (target) {
        target.role = role;
        io.to(roomId).emit('role_assigned', { userId, role, participants: rooms[roomId].participants });
        io.to(roomId).emit('update_participants', { participants: rooms[roomId].participants });
      }
    }
  });

  socket.on('kick_user', ({ roomId, userId }) => {
    if (rooms[roomId]?.hostId === socket.id) {
      rooms[roomId].participants = rooms[roomId].participants.filter(p => p.userId !== userId);
      io.to(userId).emit('kicked');
      io.to(roomId).emit('update_participants', { participants: rooms[roomId].participants });
    }
  });

  socket.on('disconnect', () => {
    for (const roomId in rooms) {
      rooms[roomId].participants = rooms[roomId].participants.filter(p => p.userId !== socket.id);
      io.to(roomId).emit('update_participants', { participants: rooms[roomId].participants });
    }
  });
});

server.listen(5000, () => console.log(`Server running on port 5000`));