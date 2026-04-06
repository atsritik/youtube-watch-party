// backend/server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const rooms = {}; // { roomId: { host, participants, videoId, time } }

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // Create room
  socket.on("create_room", ({ roomId, username }) => {
    socket.join(roomId);
    rooms[roomId] = {
      host: socket.id,
      participants: { [socket.id]: { username, role: "Host" } },
      videoId: "dQw4w9WgXcQ",
      time: 0
    };
    socket.role = "Host";
    io.to(roomId).emit("user_joined", { participants: rooms[roomId].participants });
  });

  // Join room
  socket.on("join_room", ({ roomId, username }) => {
    if (!rooms[roomId]) return;

    socket.join(roomId);
    rooms[roomId].participants[socket.id] = { username, role: "Participant" };
    socket.role = "Participant";

    // Update everyone with participant list
    io.to(roomId).emit("user_joined", { participants: rooms[roomId].participants });

    // Send current video + time to new participant
    const { videoId, time } = rooms[roomId];
    socket.emit("sync_state", { videoId, time });
  });

  // Play/Pause/Seek/Change video
  socket.on("play", ({ roomId }) => { if(socket.role==="Host"||socket.role==="Moderator") socket.to(roomId).emit("play"); });
  socket.on("pause", ({ roomId }) => { if(socket.role==="Host"||socket.role==="Moderator") socket.to(roomId).emit("pause"); });
  socket.on("seek", ({ roomId, time }) => { 
    if(socket.role==="Host"||socket.role==="Moderator"){ 
      rooms[roomId].time=time; 
      socket.to(roomId).emit("seek",{time}); 
    } 
  });
  socket.on("change_video", ({ roomId, videoId }) => { 
    if(socket.role==="Host"||socket.role==="Moderator"){ 
      rooms[roomId].videoId=videoId; 
      socket.to(roomId).emit("change_video",{videoId}); 
    } 
  });

  // Role & participant management
  socket.on("assign_role", ({ roomId, userId, role }) => { 
    if(socket.id===rooms[roomId]?.host && rooms[roomId].participants[userId]){
      rooms[roomId].participants[userId].role=role; 
      io.to(roomId).emit("role_assigned",{participants:rooms[roomId].participants}); 
    } 
  });

  socket.on("remove_participant", ({ roomId, userId }) => { 
    if(socket.id===rooms[roomId]?.host){ 
      delete rooms[roomId].participants[userId]; 
      io.to(roomId).emit("participant_removed",{participants:rooms[roomId].participants}); 
    } 
  });

  // Sync for new participant
  socket.on("send_sync", ({ roomId, userId, time, videoId }) => { 
    io.to(userId).emit("sync_state",{time,videoId}); 
  });

  // Disconnect handling
  socket.on("disconnect", () => {
    for (let roomId in rooms) {
      if(rooms[roomId].participants[socket.id]){
        delete rooms[roomId].participants[socket.id];
        if(rooms[roomId].host===socket.id){
          const remaining=Object.keys(rooms[roomId].participants);
          if(remaining.length>0){ rooms[roomId].host=remaining[0]; rooms[roomId].participants[remaining[0]].role="Host"; }
          else{ delete rooms[roomId]; continue; }
        }
        io.to(roomId).emit("user_left",{participants:rooms[roomId].participants});
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));