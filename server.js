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
            socket.emit('auth_result', { success: false });
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
    console.log(`Server is running on port ${PORT}`);
});
 (code === WHITE_LIST_CODE) {
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
socket.emit('auth_check', { code: 'DANI2026', username: myUsername });
socket.on('update_online_users', (users) => {
    // users — массив имен тех, кто сейчас в сети
    const onlineDiv = document.getElementById('online-users-list');
    if (onlineDiv) {
        onlineDiv.innerHTML = `Онлайн (${users.length}): ` + users.join(', ');
    }
});
const messageInput = document.getElementById('message-input');
let typingTimeout;

messageInput.addEventListener('input', () => {
    socket.emit('typing', myUsername);
    
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        socket.emit('stop_typing');
    }, 1000); // если не писал 1 секунду, убираем статус
});

// Получение статуса от других
socket.on('display_typing', (username) => {
    const indicator = document.getElementById('typing-indicator');
    if (indicator) {
        indicator.textContent = `${username} печатает...`;
    }
});

socket.on('hide_typing', () => {
    const indicator = document.getElementById('typing-indicator');
    if (indicator) {
        indicator.textContent = '';
    }
});
// 1. Получение и обновление списка онлайн-пользователей
socket.on('update_online_users', (users) => {
    const onlineDiv = document.getElementById('online-users-list');
    if (onlineDiv) {
        onlineDiv.textContent = `Онлайн (${users.length}): ` + users.join(', ');
    }
});

// 2. Отслеживание ввода текста в поле сообщения
const messageInput = document.getElementById('message-input'); // замените на ID вашего поля ввода, если он другой
let typingTimeout;

if (messageInput) {
    messageInput.addEventListener('input', () => {
        socket.emit('typing', myUsername); // отправляем сигнал, что мы печатаем
        
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            socket.emit('stop_typing'); // если перестали писать на 1 секунду
        }, 1000);
    });
}

// 3. Отображение чужого статуса «печатает...»
socket.on('display_typing', (username) => {
    const indicator = document.getElementById('typing-indicator');
    if (indicator) {
        indicator.textContent = `${username} печатает...`;
    }
});

socket.on('hide_typing', () => {
    const indicator = document.getElementById('typing-indicator');
    if (indicator) {
        indicator.textContent = '';
    }
});
