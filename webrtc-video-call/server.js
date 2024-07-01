const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
    socket.on('join', (roomId) => {
        const roomClients = io.sockets.adapter.rooms.get(roomId) || new Set();
        const numberOfClients = roomClients.size;

        if (numberOfClients === 0) {
            console.log(`Creating room ${roomId} and emitting room_created socket event`);
            socket.join(roomId);
            socket.emit('room_created', roomId);
        } else if (numberOfClients === 1) {
            console.log(`Joining room ${roomId} and emitting room_joined socket event`);
            socket.join(roomId);
            socket.emit('room_joined', roomId);
        } else {
            console.log(`Can't join room ${roomId}, emitting full_room socket event`);
            socket.emit('full_room', roomId);
        }
    });

    socket.on('start_call', (roomId) => {
        console.log(`Broadcasting start_call event to peers in room ${roomId}`);
        socket.broadcast.to(roomId).emit('start_call');
    });

    socket.on('webrtc_offer', (event) => {
        console.log(`Broadcasting webrtc_offer event to peers in room ${event.roomId}`);
        socket.broadcast.to(event.roomId).emit('webrtc_offer', event.sdp);
    });

    socket.on('webrtc_answer', (event) => {
        console.log(`Broadcasting webrtc_answer event to peers in room ${event.roomId}`);
        socket.broadcast.to(event.roomId).emit('webrtc_answer', event.sdp);
    });

    socket.on('webrtc_ice_candidate', (event) => {
        console.log(`Broadcasting webrtc_ice_candidate event to peers in room ${event.roomId}`);
        socket.broadcast.to(event.roomId).emit('webrtc_ice_candidate', event);
    });

    socket.on('message', (data) => {
        console.log(`Broadcasting message event to peers in room ${data.roomId}`);
        socket.broadcast.to(data.roomId).emit('message', data);
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected from room ${socket.roomId}`);
        socket.broadcast.to(socket.roomId).emit('user_disconnected');
    });

    socket.on('disconnecting', () => {
        const rooms = Array.from(socket.rooms).filter(r => r !== socket.id);
        if (rooms.length > 0) {
            socket.roomId = rooms[0];
        }
    });
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
    console.log(`Express server listening on port ${port}`);
});
