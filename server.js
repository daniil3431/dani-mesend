const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

let webpush = null;
try {
    webpush = require('web-push');
} catch (e) {
    console.warn('Пакет web-push не установлен — push-уведомления в закрытом приложении будут отключены. Выполните npm install.');
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

const WHITE_LIST_CODE = process.env.WHITE_LIST_CODE || "DANI2026";

// ---------- Простое файловое хранилище (без БД) ----------
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const USERS_FILE = path.join(DATA_DIR, 'users.json');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const SUBS_FILE = path.join(DATA_DIR, 'subscriptions.json');

const MAX_STORED_MESSAGES = 300;

function loadJSON(file, fallback) {
    try {
        if (!fs.existsSync(file)) return fallback;
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
        console.error('Ошибка чтения ' + file, e);
        return fallback;
    }
}
function saveJSON(file, data) {
    try {
        fs.writeFileSync(file, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Ошибка записи ' + file, e);
    }
}

let users = loadJSON(USERS_FILE, {});         // { username: { salt, hash } }
let messages = loadJSON(MESSAGES_FILE, []);   // [{ id, user, text|image, replyTo, ts }]
let sessions = loadJSON(SESSIONS_FILE, {});   // { token: username }
let subscriptions = loadJSON(SUBS_FILE, {});  // { username: [pushSubscription, ...] }

// ---------- Пароли ----------
function hashPassword(password, salt) {
    return crypto.scryptSync(password, salt, 64).toString('hex');
}
function createUser(username, password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = hashPassword(password, salt);
    users[username] = { salt, hash };
    saveJSON(USERS_FILE, users);
}
function verifyUser(username, password) {
    const record = users[username];
    if (!record) return false;
    const hash = hashPassword(password, record.salt);
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(record.hash, 'hex'));
}
function createSession(username) {
    const token = crypto.randomBytes(24).toString('hex');
    sessions[token] = username;
    saveJSON(SESSIONS_FILE, sessions);
    return token;
}

// ---------- Web Push ----------
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const pushEnabled = !!(webpush && VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
if (pushEnabled) {
    webpush.setVapidDetails('mailto:admin@example.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} else {
    console.warn('Push-уведомления выключены: не заданы VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (см. MOBILE_BUILD.md).');
}

function sendPushToAllExcept(excludeUsername, payload) {
    if (!pushEnabled) return;
    const body = JSON.stringify(payload);
    Object.entries(subscriptions).forEach(([username, subs]) => {
        if (username === excludeUsername) return;
        subs.forEach((sub, idx) => {
            webpush.sendNotification(sub, body).catch((err) => {
                // Подписка протухла (например, приложение удалили) — чистим
                if (err.statusCode === 404 || err.statusCode === 410) {
                    subscriptions[username].splice(idx, 1);
                    saveJSON(SUBS_FILE, subscriptions);
                }
            });
        });
    });
}

// Список пользователей онлайн: { socketId: username }
const onlineUsers = new Map();

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/vapid-public-key', (req, res) => {
    res.json({ key: pushEnabled ? VAPID_PUBLIC_KEY : null });
});

app.post('/api/subscribe', (req, res) => {
    const { username, subscription } = req.body || {};
    if (!username || !subscription) return res.status(400).json({ success: false });
    if (!subscriptions[username]) subscriptions[username] = [];
    const exists = subscriptions[username].some(s => s.endpoint === subscription.endpoint);
    if (!exists) subscriptions[username].push(subscription);
    saveJSON(SUBS_FILE, subscriptions);
    res.json({ success: true });
});

io.on('connection', (socket) => {
    let currentUsername = null;

    function completeLogin(username) {
        currentUsername = username;
        onlineUsers.set(socket.id, username);
        socket.emit('chat_history', messages.slice(-100));
        io.emit('update_online_users', Array.from(onlineUsers.values()));
    }

    // Регистрация нового пользователя (нужен код белого списка)
    socket.on('register', ({ code, username, password }) => {
        username = (username || '').trim();
        password = password || '';
        if (code !== WHITE_LIST_CODE) {
            return socket.emit('auth_result', { success: false, message: 'Неверный код белого списка!' });
        }
        if (!username || !password) {
            return socket.emit('auth_result', { success: false, message: 'Заполните имя и пароль!' });
        }
        if (users[username]) {
            return socket.emit('auth_result', { success: false, message: 'Это имя уже занято, выберите другое.' });
        }
        createUser(username, password);
        const token = createSession(username);
        socket.emit('auth_result', { success: true, username, token });
        completeLogin(username);
    });

    // Вход существующего пользователя
    socket.on('login', ({ username, password }) => {
        username = (username || '').trim();
        if (!verifyUser(username, password || '')) {
            return socket.emit('auth_result', { success: false, message: 'Неверное имя пользователя или пароль.' });
        }
        const token = createSession(username);
        socket.emit('auth_result', { success: true, username, token });
        completeLogin(username);
    });

    // Автовход по сохранённому токену ("запомнить меня")
    socket.on('auto_login', ({ token }) => {
        const username = sessions[token];
        if (!username || !users[username]) {
            return socket.emit('auth_result', { success: false, message: 'Сессия истекла, войдите заново.' });
        }
        socket.emit('auth_result', { success: true, username, token });
        completeLogin(username);
    });

    // Обработка статуса "печатает..."
    socket.on('typing', (username) => {
        socket.broadcast.emit('display_typing', username);
    });

    socket.on('stop_typing', () => {
        socket.broadcast.emit('hide_typing');
    });

    // Сообщения и фото (каждому сообщению присваивается уникальный id и сохраняются в историю)
    socket.on('chat_message', (data) => {
        if (!currentUsername) return;
        const message = { ...data, user: currentUsername, id: crypto.randomUUID(), ts: Date.now() };
        messages.push(message);
        if (messages.length > MAX_STORED_MESSAGES) messages = messages.slice(-MAX_STORED_MESSAGES);
        saveJSON(MESSAGES_FILE, messages);
        io.emit('chat_message', message);
        sendPushToAllExcept(currentUsername, {
            title: currentUsername,
            body: (data.text || '').slice(0, 120),
            url: '/'
        });
    });

    socket.on('chat_image', (data) => {
        if (!currentUsername) return;
        const message = { ...data, user: currentUsername, id: crypto.randomUUID(), ts: Date.now() };
        messages.push(message);
        if (messages.length > MAX_STORED_MESSAGES) messages = messages.slice(-MAX_STORED_MESSAGES);
        saveJSON(MESSAGES_FILE, messages);
        io.emit('chat_image', message);
        sendPushToAllExcept(currentUsername, {
            title: currentUsername,
            body: '📷 Фото',
            url: '/'
        });
    });

    // Статус прочтения: клиент сообщает, что увидел сообщение с данным id
    socket.on('message_read', ({ id, reader }) => {
        if (id && reader) {
            io.emit('message_read_update', { id, reader });
        }
    });

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
