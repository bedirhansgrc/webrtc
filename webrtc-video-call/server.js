const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const fileUpload = require('express-fileupload');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Ensure the uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}

app.use(express.static(path.join(__dirname, 'public')));
app.use(fileUpload());

app.post('/upload', (req, res) => {
    if (!req.files || Object.keys(req.files).length === 0) {
        return res.status(400).send('No files were uploaded.');
    }

    const uploadedFile = req.files.file;
    const uploadPath = path.join(__dirname, 'uploads', uploadedFile.name);

    uploadedFile.mv(uploadPath, (err) => {
        if (err) return res.status(500).send(err);
        
        const downloadLink = `/download?filename=${uploadedFile.name}`;
        
        // Dosya yüklendiğinde istemcilere dosya adını ve indirme linkini gönder
        io.emit('file_uploaded', { fileName: uploadedFile.name, downloadLink });
        
        res.json({ fileName: uploadedFile.name, message: 'File uploaded successfully' });
    });
});

app.get('/download', (req, res) => {
    const filePath = path.join(__dirname, 'uploads', req.query.filename);
    if (fs.existsSync(filePath)) {
        res.download(filePath);
    } else {
        res.status(404).send('File not found');
    }
});

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

        io.to(roomId).emit('user_list', Array.from(io.sockets.adapter.rooms.get(roomId) || []));
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
            io.to(socket.roomId).emit('user_list', Array.from(io.sockets.adapter.rooms.get(socket.roomId) || []));
        }
    });
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
    console.log(`Express server listening on port ${port}`);
});
