const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

const WHITE_LIST_CODE = "DANI2026";
// Список пользователей онлайн: { socketId: username }
const onlineUsers = new Map();

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
    // Проверка белого списка и регистрация пользователя
    socket.on('auth_check', ({ code, username }) => {
        if (code === WHITE_LIST_CODE) {
            socket.emit('auth_result', { success: true });
            if (username) {
                onlineUsers.set(socket.id, username);
                io.emit('update_online_users', Array.from(onlineUsers.values()));
            }
        } else {
            socket.emit('auth_result', { success: false, message: 'Неверный код белого списка!' });
        }
    });

    // Обработка статуса "печатает..."
    socket.on('typing', (username) => {
        socket.broadcast.emit('display_typing', username);
    });

    socket.on('stop_typing', () => {
        socket.broadcast.emit('hide_typing');
    });

    // Сообщения и фото
    socket.on('chat_message', (data) => io.emit('chat_message', data));
    socket.on('chat_image', (data) => io.emit('chat_image', data));

    // Отключение пользователя
    socket.on('disconnect', () => {
        if (onlineUsers.has(socket.id)) {
            onlineUsers.delete(socket.id);
            io.emit('update_online_users', Array.from(onlineUsers.values()));
        }
        console.log('Пользователь отключился');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Сервер Dani запущен на порту ${PORT}`);
});
