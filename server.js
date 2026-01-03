const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// --- GAME STATE ---
const rooms = {}; // { roomId: { players: {}, gameState: 'waiting' | 'playing' | 'ended', currentQuestionIndex: 0, timer: 0, interval: null, questions: [] } }

// Hardcoded UTBK-style questions (Scholastic Aptitude Test style)
const QUESTIONS = [
    {
        id: 1,
        type: 'TPS',
        text: "Jika 3x + 5 = 14, berapakah nilai 2x + 1?",
        options: { A: "5", B: "6", C: "7", D: "8", E: "9" },
        correct: "C"
    },
    {
        id: 2,
        type: 'Literasi',
        text: "Manakah kata yang baku di bawah ini?",
        options: { A: "Apotik", B: "Nasehat", C: "Kualitas", D: "Obyek", E: "Praktek" },
        correct: "C"
    },
    {
        id: 3,
        type: 'Logika',
        text: "Semua dokter adalah orang pintar. Sebagian orang pintar suka membaca. Simpulan yang tepat adalah...",
        options: {
            A: "Semua dokter suka membaca",
            B: "Sebagian dokter suka membaca",
            C: "Semua orang pintar adalah dokter",
            D: "Tidak dapat disimpulkan",
            E: "Sebagian orang pintar bukan dokter"
        },
        correct: "D" // Logic trap, technically "Tidak dapat disimpulkan" with certainty about intersection of Doctor & Reader
    },
    {
        id: 4,
        type: 'TPS',
        text: "Deret angka: 2, 5, 11, 23, ... Angka berikutnya adalah?",
        options: { A: "44", B: "45", C: "46", D: "47", E: "48" },
        correct: "D" // x2 + 1 pattern
    },
    {
        id: 5,
        type: 'Pengetahuan Umum',
        text: "Ibukota baru Indonesia terletak di provinsi...",
        options: { A: "Kalimantan Barat", B: "Kalimantan Tengah", C: "Kalimantan Timur", D: "Kalimantan Selatan", E: "Kalimantan Utara" },
        correct: "C"
    }
];

const GAME_DURATION_PER_QUESTION = 60; // seconds for simpler sync initially, or total exam time

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // --- LOBBY LOGIC ---
    socket.on('join_room', ({ name, roomId }) => {
        socket.join(roomId);

        // Initialize room if not exists
        if (!rooms[roomId]) {
            rooms[roomId] = {
                id: roomId,
                players: {},
                state: 'waiting',
                currentQuestionIndex: 0,
                timer: 0,
                interval: null,
                questions: [...QUESTIONS] // Copy questions to room
            };
        }

        const room = rooms[roomId];

        // Add player
        room.players[socket.id] = {
            id: socket.id,
            name: name,
            score: 0,
            answers: {} // { questionId: 'A' }
        };

        // Notify room
        io.to(roomId).emit('update_room', {
            players: Object.values(room.players),
            state: room.state,
            isHost: Object.keys(room.players)[0] === socket.id // First joiner is host usually
        });

        console.log(`${name} joined room ${roomId}`);
    });

    // --- GAME LOGIC ---
    socket.on('start_game', (roomId) => {
        const room = rooms[roomId];
        if (!room) return;

        room.state = 'playing';
        room.startTime = Date.now();

        // Notify everyone game started
        io.to(roomId).emit('game_started', {
            questions: room.questions,
            startTime: room.startTime
        });

        // Start server-side timer for security/sync check (optional for MVP, trusting client mostly for now but good to have)
        // For UTBK style, usually it's a block of time for ALL questions, not per question.
        // Let's implement a total timer logic.

        console.log(`Game started in room ${roomId}`);
    });

    socket.on('submit_answer', ({ roomId, questionId, answer }) => {
        const room = rooms[roomId];
        if (!room || room.state !== 'playing') return;

        const player = room.players[socket.id];
        if (player) {
            player.answers[questionId] = answer;

            // Calculate score immediately or at end? Let's do at end to avoid cheating/feedback during exam
            // UTBK usually doesn't show right/wrong immediately.
        }
    });

    socket.on('finish_exam', (roomId) => {
        const room = rooms[roomId];
        if (!room) return;

        // Calculate score for this player
        const player = room.players[socket.id];
        if (!player) return;

        let score = 0;
        let correctCount = 0;
        room.questions.forEach(q => {
            if (player.answers[q.id] === q.correct) {
                score += 100; // Simple scoring
                correctCount++;
            }
        });
        player.score = score;

        // Send individual results back
        socket.emit('exam_result', {
            score: score,
            correctCount: correctCount,
            total: room.questions.length
        });

        // Broadcast leaderboard update if everyone finished? 
        // For simplicity, just emit update_room to show who finished.
        io.to(roomId).emit('update_room', {
            players: Object.values(room.players),
            state: room.state
        });
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        // Find room user was in and remove/mark offline
        for (const roomId in rooms) {
            if (rooms[roomId].players[socket.id]) {
                delete rooms[roomId].players[socket.id];
                io.to(roomId).emit('update_room', {
                    players: Object.values(rooms[roomId].players),
                    state: rooms[roomId].state
                });

                // Cleanup empty rooms
                if (Object.keys(rooms[roomId].players).length === 0) {
                    delete rooms[roomId];
                }
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
