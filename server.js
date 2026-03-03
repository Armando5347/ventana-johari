const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static('public'));

// Store active rooms
const rooms = new Map();

// Generate a unique room code
function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

wss.on('connection', (ws) => {
  let userRoom = null;
  let userId = null;

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);

      if (message.type === 'create-room') {
        const roomCode = generateRoomCode();
        rooms.set(roomCode, {
          code: roomCode,
          creator: message.userId,
          members: [],
          membersDetails: [], // { id, ws }
          messages: {}, // { userId: [texts] }
          createdAt: new Date()
        });

        const room = rooms.get(roomCode);
        // register creator
        room.members.push(message.userId);
        room.membersDetails.push({ id: message.userId, ws });
        room.messages[message.userId] = [];

        userRoom = roomCode;
        userId = message.userId;

        // send room-created with room info
        ws.send(JSON.stringify({
          type: 'room-created',
          roomCode: roomCode,
          creator: room.creator,
          members: room.members
        }));

        console.log(`Room created: ${roomCode}`);
      }

      if (message.type === 'join-room') {
        const code = message.roomCode;

        if (rooms.has(code)) {
          const room = rooms.get(code);
          room.members.push(message.userId);
          room.membersDetails.push({ id: message.userId, ws });
          room.messages[message.userId] = [];
          userRoom = code;
          userId = message.userId;

          // send confirmation to joiner with room info
          ws.send(JSON.stringify({
            type: 'room-joined',
            roomCode: code,
            creator: room.creator,
            members: room.members
          }));

          // Notify all members about updated member list
          broadcastMemberUpdate(room);

          console.log(`User ${message.userId} joined room ${code}`);
        } else {
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Sala no encontrada'
          }));
        }
      }

      if (message.type === 'message' && userRoom) {
        const room = rooms.get(userRoom);
        if (!room) return;

        // store message
        if (!room.messages[userId]) room.messages[userId] = [];
        room.messages[userId].push(message.text);

        const payload = {
          type: 'message',
          userId: userId,
          text: message.text,
          timestamp: new Date()
        };

        // send to sender
        try { ws.send(JSON.stringify(payload)); } catch (e) {}

        // send to creator (host) if different from sender
        if (room.creator && room.creator !== userId) {
          const hostDetail = room.membersDetails.find(m => m.id === room.creator);
          if (hostDetail && hostDetail.ws && hostDetail.ws.readyState === WebSocket.OPEN) {
            try { hostDetail.ws.send(JSON.stringify(payload)); } catch (e) {}
          }
        }
      }

      if (message.type === 'build-window-start' && userRoom) {
        const room = rooms.get(userRoom);
        if (!room) return;

        // only creator can build
        if (message.userId !== room.creator) return;

        // Notify all users that intermediate phase is starting
        const startPayload = {
          type: 'build-window-start'
        };

        room.membersDetails.forEach(m => {
          try {
            if (m.ws && m.ws.readyState === WebSocket.OPEN) m.ws.send(JSON.stringify(startPayload));
          } catch (e) {}
        });
      }

      if (message.type === 'build-window' && userRoom) {
        const room = rooms.get(userRoom);
        if (!room) return;

        // only creator can build
        if (message.userId !== room.creator) {
          ws.send(JSON.stringify({ type: 'error', message: 'No autorizado' }));
          return;
        }

        const hostMsgs = new Set(room.messages[room.creator] || []);
        const guestMsgsSet = new Set();
        for (const [uid, msgs] of Object.entries(room.messages)) {
          if (uid === room.creator) continue;
          for (const m of msgs) guestMsgsSet.add(m);
        }

        const yoPublico = [...hostMsgs].filter(m => guestMsgsSet.has(m));
        const yoCiego = [...guestMsgsSet].filter(m => !hostMsgs.has(m));
        const yoOculto = [...hostMsgs].filter(m => !guestMsgsSet.has(m));
        const yoDesconocido = [];

        // Broadcast window to all users in the room
        const windowPayload = {
          type: 'window-built',
          window: {
            yoPublico,
            yoCiego,
            yoOculto,
            yoDesconocido
          }
        };

        room.membersDetails.forEach(m => {
          try {
            if (m.ws && m.ws.readyState === WebSocket.OPEN) m.ws.send(JSON.stringify(windowPayload));
          } catch (e) {}
        });
      }
    } catch (error) {
      console.error('Message error:', error);
    }
  });

  ws.on('close', () => {
    if (userRoom && rooms.has(userRoom)) {
      const room = rooms.get(userRoom);
      // remove member detail
      room.members = room.members.filter(id => id !== userId);
      room.membersDetails = room.membersDetails.filter(m => m.id !== userId);
      delete room.messages[userId];

      if (room.members.length === 0) {
        rooms.delete(userRoom);
        console.log(`Room ${userRoom} deleted`);
      } else {
        broadcastMemberUpdate(room);
      }
    }
  });
});

function broadcastMemberUpdate(room) {
  const payload = {
    type: 'members-updated',
    members: room.members,
    creator: room.creator
  };

  room.membersDetails.forEach(m => {
    try {
      if (m.ws && m.ws.readyState === WebSocket.OPEN) m.ws.send(JSON.stringify(payload));
    } catch (e) {}
  });
}

// Serve index.html for all routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
