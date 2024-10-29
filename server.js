const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public'));

io.on('connection', socket => {
    console.log('New client connected');

    socket.on('join-room', roomId => {
        socket.join(roomId);
        socket.broadcast.to(roomId).emit('user-joined', socket.id);  // Notify other users

        socket.on('offer', (offer, targetId) => {
            socket.to(targetId).emit('offer', offer, socket.id);
        });

        socket.on('answer', (answer, targetId) => {
            socket.to(targetId).emit('answer', answer, socket.id);
        });

        socket.on('ice-candidate', (candidate, targetId) => {
            socket.to(targetId).emit('ice-candidate', candidate, socket.id);
        });

        // Handle disconnection
        socket.on('disconnect', () => {
            socket.broadcast.to(roomId).emit('user-left', socket.id);  // Notify peers to remove video
            console.log('Client disconnected');
        });
    });
});

server.listen(3000, () => console.log('Server is running on port 3000'));
