const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    maxHttpBufferSize: 10 * 1024 * 1024
});

const WHITE_LIST_CODE = "DANI2026";

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
    console.log('Новое подключение:', socket.id);

    socket.on('auth_check', (code) => {
        if (code === WHITE_LIST_CODE) {
            socket.emit('auth_result', { success: true });
        } else {
            socket.emit('auth_result', { success: false, message: 'Неверный код белого списка!' });
        }
    });

    socket.on('chat_message', (data) => {
        io.emit('chat_message', data);
    });

    socket.on('chat_image', (data) => {
        io.emit('chat_image', data);
    });

    socket.on('disconnect', () => {
        console.log('Пользователь отключился');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Сервер мессенджера Dani запущен на порту ${PORT}`);
});
