const socket = io();

// STATE
let currentRoomId = null;
let myName = '';
let questions = [];
let currentQuestionIndex = 0;
let answers = {}; // { 1: 'A', 2: 'B' }
let timerInterval = null;

// DOM ELEMENTS
const screens = {
    login: document.getElementById('login-screen'),
    lobby: document.getElementById('lobby-screen'),
    quiz: document.getElementById('quiz-screen'),
    result: document.getElementById('result-screen')
};

// --- NAVIGATION ---
function showScreen(screenName) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[screenName].classList.add('active');
}

// --- LOGIN LOGIC ---
document.getElementById('join-btn').addEventListener('click', () => {
    const name = document.getElementById('username').value.trim();
    const roomId = document.getElementById('room-id').value.trim();

    if (name && roomId) {
        myName = name;
        currentRoomId = roomId;
        socket.emit('join_room', { name, roomId });
        showScreen('lobby');
        document.getElementById('lobby-room-id').textContent = roomId;
        document.getElementById('user-display').textContent = name;
    } else {
        alert('Mohon isi nama dan ID ruangan!');
    }
});

// --- SOCKET EVENTS ---
socket.on('update_room', ({ players, state, isHost }) => {
    // Update player list in lobby
    const list = document.getElementById('player-list');
    list.innerHTML = players.map(p => `<li>${p.name} ${p.id === socket.id ? '(Anda)' : ''}</li>`).join('');

    // Host controls
    if (isHost && state === 'waiting') {
        document.getElementById('host-controls').classList.remove('hidden');
        document.getElementById('waiting-msg').classList.add('hidden');
    }

    // Auto-redirect if game ended/started late join (simplified handling)
    if (state === 'playing' && screens.lobby.classList.contains('active')) {
        // In a real app, we'd need to request game state sync here
    }
});

socket.on('game_started', (data) => {
    questions = data.questions;
    showScreen('quiz');
    renderQuestionGrid();
    loadQuestion(0);
    startTimer(data.startTime);
});

socket.on('exam_result', (data) => {
    showScreen('result');
    document.getElementById('score-display').textContent = data.score;
    document.getElementById('correct-count').textContent = data.correctCount;
    document.getElementById('total-count').textContent = data.total;
});

// --- LOBBY ACTIONS ---
document.getElementById('start-btn').addEventListener('click', () => {
    socket.emit('start_game', currentRoomId);
});

// --- QUIZ LOGIC ---
function renderQuestionGrid() {
    const grid = document.getElementById('question-grid');
    grid.innerHTML = '';
    questions.forEach((q, index) => {
        const btn = document.createElement('div');
        btn.className = 'nav-btn';
        btn.textContent = index + 1;
        btn.onclick = () => loadQuestion(index);
        btn.id = `nav-btn-${index}`;
        grid.appendChild(btn);
    });
}

function loadQuestion(index) {
    currentQuestionIndex = index;
    const q = questions[index];

    // Update specific UI
    document.getElementById('current-q-num').textContent = index + 1;
    document.getElementById('q-type').textContent = q.type;
    document.getElementById('question-text').textContent = q.text;

    // Render Options
    const container = document.getElementById('options-container');
    container.innerHTML = '';

    Object.entries(q.options).forEach(([key, value]) => {
        const label = document.createElement('label');
        label.className = 'option-label';

        const input = document.createElement('input');
        input.type = 'radio';
        input.name = 'answer';
        input.value = key;
        if (answers[q.id] === key) input.checked = true;

        input.onchange = () => {
            selectAnswer(q.id, key, index);
        };

        label.appendChild(input);
        label.appendChild(document.createTextNode(`${key}. ${value}`));
        container.appendChild(label);
    });

    // Update Navigation Buttons Style
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`nav-btn-${index}`).classList.add('active');

    // Update Prev/Next Buttons
    toggleNavButtons();
}

function selectAnswer(questionId, answer, index) {
    answers[questionId] = answer;
    document.getElementById(`nav-btn-${index}`).classList.add('answered');

    // Send to server
    socket.emit('submit_answer', {
        roomId: currentRoomId,
        questionId: questionId,
        answer: answer
    });
}

function toggleNavButtons() {
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const finishBtn = document.getElementById('finish-btn');

    prevBtn.disabled = currentQuestionIndex === 0;

    if (currentQuestionIndex === questions.length - 1) {
        nextBtn.classList.add('hidden');
        finishBtn.classList.remove('hidden');
    } else {
        nextBtn.classList.remove('hidden');
        finishBtn.classList.add('hidden');
    }
}

document.getElementById('prev-btn').addEventListener('click', () => {
    if (currentQuestionIndex > 0) loadQuestion(currentQuestionIndex - 1);
});

document.getElementById('next-btn').addEventListener('click', () => {
    if (currentQuestionIndex < questions.length - 1) loadQuestion(currentQuestionIndex + 1);
});

document.getElementById('finish-btn').addEventListener('click', () => {
    if (confirm('Apakah anda yakin ingin mengakhiri ujian?')) {
        socket.emit('finish_exam', currentRoomId);
    }
});

// --- TIMER ---
function startTimer(startTime) { // Simplified sync
    // In a real synced synced app, we should calculate offset between server now and client now
    // For this mini-app, we'll just countdown for 10 minutes from when WE receive the event or fixed time.

    // Better approach: Server sends startTime. EndTime = startTime + duration.
    // Client calculates remaining = EndTime - Date.now().

    const DURATION = 10 * 60 * 1000; // 10 minutes fixed for specific set
    const endTime = startTime + DURATION;

    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        const now = Date.now();
        const diff = endTime - now;

        if (diff <= 0) {
            clearInterval(timerInterval);
            document.getElementById('timer-display').textContent = "00:00:00";
            alert("Waktu Habis!");
            socket.emit('finish_exam', currentRoomId);
            return;
        }

        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);

        document.getElementById('timer-display').textContent =
            `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }, 1000);
}

function pad(num) {
    return num.toString().padStart(2, '0');
}
