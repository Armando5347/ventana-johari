let ws = null;
let currentRoom = null;
let currentUserId = null;
let currentIsHost = false;
let isIntermediatePhase = false;

function showPage(pageId) {
  document.querySelectorAll('.page').forEach(page => {
    page.classList.remove('active');
  });
  document.getElementById(pageId).classList.add('active');
}

function goToLanding() {
  showPage('landing-page');
}

function goToCreateRoom() {
  document.getElementById('username').value = '';
  showPage('create-room-page');
}

function goToJoinRoom() {
  document.getElementById('username-join').value = '';
  document.getElementById('room-code').value = '';
  showPage('join-room-page');
}

function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${window.location.host}`);

  ws.onopen = () => {
    console.log('WebSocket connected');
  };

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    handleWebSocketMessage(message);
  };

  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
    alert('Connection error. Please refresh the page.');
  };

  ws.onclose = () => {
    console.log('WebSocket disconnected');
  };
}

function handleWebSocketMessage(message) {
  switch (message.type) {
    case 'room-created':
      currentRoom = message.roomCode;
      currentIsHost = true;
      showChatRoom();
      displayRoomCode(message.roomCode);
      document.getElementById('host-controls').style.display = 'block';
      updateSubtitle(message.creator);
      break;

    case 'room-joined':
      currentRoom = message.roomCode;
      currentIsHost = (message.creator === currentUserId);
      showChatRoom();
      updateMembers(message.members);
      if (currentIsHost) document.getElementById('host-controls').style.display = 'block';
      updateSubtitle(message.creator);
      break;

    case 'window-built':
      handleWindowBuilt(message.window || {});
      break;

    case 'members-updated':
      updateMembers(message.members);
      currentIsHost = (message.creator === currentUserId);
      if (currentIsHost) document.getElementById('host-controls').style.display = 'block';
      updateSubtitle(message.creator);
      break;

    case 'member-joined':
      updateMembers(message.members);
      addSystemMessage(`${message.userId} joined the room`);
      break;

    case 'member-left':
      updateMembers(message.members);
      addSystemMessage(`A member left the room`);
      break;

    case 'message':
      // only show messages if you're the sender, or if you're the host
      const isOwn = message.userId === currentUserId;
      //const isForHost = currentIsHost && message.userId !== currentUserId;
      if (isOwn) displayMessage(message.userId, message.text, isOwn);
      break;

    case 'window-built':
      handleWindowBuilt(message.window || {});
      break;

    case 'build-window-start':
      // All users get notified that intermediate phase started
      notifyIntermediatePhase(true);
      const modal = document.getElementById('intermediate-modal');
      const title = document.getElementById('intermediate-title');
      const text = document.getElementById('intermediate-text');
      const confirmBtn = document.getElementById('confirm-btn');
      if (currentIsHost) {
        title.textContent = 'Construyendo tu ventana...';
        text.textContent = 'Se está recopilando la información de todos los participantes. Haz clic en confirmar para ver tu Ventana de Johari.';
        confirmBtn.style.display = 'inline-block';
      } else {
        title.textContent = 'Espera';
        text.textContent = 'El anfitrión está creando la Ventana de Johari. Por favor espera...';
        confirmBtn.style.display = 'none';
      }
      modal.style.display = 'flex';
      break;

    case 'error':
      alert(message.message);
      goToLanding();
      break;
  }
}

function createRoom() {
  const username = document.getElementById('username').value.trim();

  if (!username) {
    alert('Por favor introduce tu nombre');
    return;
  }

  if (!ws || ws.readyState !== WebSocket.OPEN) {
    connectWebSocket();
    setTimeout(() => {
      currentUserId = username;
      ws.send(JSON.stringify({
        type: 'create-room',
        userId: username
      }));
    }, 500);
  } else {
    currentUserId = username;
    ws.send(JSON.stringify({
      type: 'create-room',
      userId: username
    }));
  }
}

function joinRoom() {
  const username = document.getElementById('username-join').value.trim();
  const roomCode = document.getElementById('room-code').value.trim().toUpperCase();

  if (!username) {
    alert('Por favor introduce tu nombre');
    return;
  }

  if (!roomCode) {
    alert('Por favor introduce un código de sala');
    return;
  }

  if (!ws || ws.readyState !== WebSocket.OPEN) {
    connectWebSocket();
    setTimeout(() => {
      currentUserId = username;
      ws.send(JSON.stringify({
        type: 'join-room',
        userId: username,
        roomCode: roomCode
      }));
    }, 500);
  } else {
    currentUserId = username;
    ws.send(JSON.stringify({
      type: 'join-room',
      userId: username,
      roomCode: roomCode
    }));
  }
}

function showChatRoom() {
  document.getElementById('messages').innerHTML = '';
  document.getElementById('members-list').innerHTML = '';
  document.getElementById('message-input').value = '';
  showPage('chat-room-page');
}

function displayRoomCode(roomCode) {
  const display = document.getElementById('room-code-display');
  display.innerHTML = `<strong>Código:</strong><br>${roomCode}<br><small style="color: #999;">Comparte este código para que otros se unan</small>`;
  document.getElementById('room-title').textContent = `Sala: ${roomCode}`;
}

function updateSubtitle(hostId) {
  const subtitleEl = document.getElementById('room-subtitle');
  if (!subtitleEl) return;
  if (currentIsHost) {
    subtitleEl.textContent = '¿qué tan bien te conoces?';
  } else {
    subtitleEl.textContent = `¿qué tan bien conoces a ${hostId}?`;
  }
}

function updateMembers(members) {
  const membersList = document.getElementById('members-list');
  const memberCount = document.getElementById('member-count');

  membersList.innerHTML = '';
  members.forEach(member => {
    const li = document.createElement('li');
    li.textContent = member + (member === currentUserId ? ' (Tú)' : '');
    membersList.appendChild(li);
  });

  memberCount.textContent = members.length;
}

function displayMessage(userId, text, isOwn) {
  const messagesDiv = document.getElementById('messages');
  const messageRect = document.createElement('div');
  messageRect.className = 'message-rect';
  if (isOwn) messageRect.classList.add('own');

  const senderSpan = document.createElement('div');
  senderSpan.className = 'msg-sender';
  senderSpan.textContent = isOwn ? 'Tú' : userId;

  const textSpan = document.createElement('div');
  textSpan.className = 'msg-text';
  textSpan.textContent = text;

  messageRect.appendChild(senderSpan);
  messageRect.appendChild(textSpan);
  messagesDiv.appendChild(messageRect);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function addSystemMessage(text) {
  const messagesDiv = document.getElementById('messages');
  const messageDiv = document.createElement('div');
  messageDiv.style.textAlign = 'center';
  messageDiv.style.color = '#999';
  messageDiv.style.fontSize = '0.9em';
  messageDiv.style.padding = '10px';
  messageDiv.textContent = text;

  messagesDiv.appendChild(messageDiv);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function sendMessage() {
  const input = document.getElementById('message-input');
  const text = input.value.trim();

  if (!text) return;

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'message',
      text: text
    }));

    // the server will echo back the message to the sender
    input.value = '';
  }
}

function buildWindow() {
  if (!currentIsHost || !ws || ws.readyState !== WebSocket.OPEN) return;
  
  // Send signal to start intermediate phase
  ws.send(JSON.stringify({ type: 'build-window-start', userId: currentUserId }));
}

function confirmWindow() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  
  ws.send(JSON.stringify({ type: 'build-window', userId: currentUserId }));
  document.getElementById('intermediate-modal').style.display = 'none';
}

function closeWindowModal() {
  document.getElementById('window-modal').style.display = 'none';
  document.getElementById('intermediate-modal').style.display = 'none';
  isIntermediatePhase = false;
  notifyIntermediatePhase(false);
  // leave the room when modal closed
  leaveRoom();
}

function notifyIntermediatePhase(enable) {
  const inputGroup = document.querySelector('.input-group');
  const inputField = document.getElementById('message-input');
  const sendBtn = inputGroup ? inputGroup.querySelector('.btn') : null;
  
  if (enable) {
    inputGroup?.classList.add('disabled');
    inputField.placeholder = 'Esperando construcción de ventana...';
  } else {
    inputGroup?.classList.remove('disabled');
    inputField.placeholder = 'Escribe un mensaje...';
  }
}

// handle built window
function handleWindowBuilt(windowData) {
  document.getElementById('yo-publico-content').innerHTML = '';
  document.getElementById('yo-ciego-content').innerHTML = '';
  document.getElementById('yo-oculto-content').innerHTML = '';
  document.getElementById('yo-desconocido-content').innerHTML = '';
  // set modal title
  const wt = document.getElementById('window-title');
  if (wt) wt.textContent = `Ventana de ${currentUserId}`;

  const appendList = (containerId, arr) => {
    const c = document.getElementById(containerId);
    arr.forEach(t => {
      const d = document.createElement('div');
      d.className = 'window-msg';
      d.textContent = t;
      c.appendChild(d);
    });
  };

  appendList('yo-publico-content', windowData.yoPublico || []);
  appendList('yo-ciego-content', windowData.yoCiego || []);
  appendList('yo-oculto-content', windowData.yoOculto || []);
  appendList('yo-desconocido-content', windowData.yoDesconocido || []);

  document.getElementById('intermediate-modal').style.display = 'none';
  document.getElementById('window-modal').style.display = 'block';
}

function handleKeyPress(event) {
  if (event.key === 'Enter') {
    sendMessage();
  }
}

function downloadWindowImage() {
  const grid = document.getElementById('window-grid');
  if (!grid) return;

  html2canvas(grid).then(canvas => {
    const link = document.createElement('a');
    link.download = `ventana_${currentRoom || 'salas'}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  });
}

function leaveRoom() {
  if (ws) {
    ws.close();
    ws = null;
  }
  currentRoom = null;
  currentUserId = null;
  goToLanding();
}

// Initialize WebSocket on page load
window.addEventListener('load', () => {
  connectWebSocket();
});
