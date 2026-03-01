// Voice Assistant - Auto-send when stop speaking
const WS_URL = 'ws://localhost:5005';

// State
let websocket = null;
let isConnecting = false;
let recognition = null;
let speechSynthesis = window.speechSynthesis;
let currentTranscript = '';
let isListening = false;
let userEmail = null;
let lastAssistantMessage = ''; // Track last message to avoid duplicates

// Initialize
async function init() {
  const result = await chrome.storage.local.get(['userEmail']);
  userEmail = result.userEmail || 'anonymous';

  initWebSocket();
  initSpeechRecognition();
  initControls();
  loadVoices();
}

// ============================================================================
// WebSocket
// ============================================================================

function initWebSocket() {
  if (isConnecting || (websocket && websocket.readyState === WebSocket.OPEN)) {
    console.log('WebSocket already connecting or connected');
    return;
  }

  isConnecting = true;
  const wsUrl = `${WS_URL}/ws/chat/${encodeURIComponent(userEmail)}`;
  console.log('🔄 Connecting to WebSocket:', wsUrl);

  try {
    websocket = new WebSocket(wsUrl);

    websocket.onopen = () => {
      console.log('✅ WebSocket connected successfully');
      isConnecting = false;
    };

    websocket.onmessage = (event) => {
      handleWebSocketMessage(JSON.parse(event.data));
    };

    websocket.onerror = (error) => {
      console.error('❌ WebSocket error:', error);
      console.error('Make sure agent_server.py is running on port 5005');
      isConnecting = false;
    };

    websocket.onclose = (event) => {
      console.log('🔴 WebSocket disconnected. Code:', event.code);
      console.log('🔄 Will retry in 3 seconds...');
      isConnecting = false;
      websocket = null;

      setTimeout(() => {
        console.log('🔄 Attempting to reconnect...');
        initWebSocket();
      }, 3000);
    };
  } catch (error) {
    console.error('❌ Failed to create WebSocket:', error);
    isConnecting = false;
  }
}

function handleWebSocketMessage(data) {
  console.log('WebSocket message:', data);

  if (data.type === 'complete' || data.type === 'step' && data.step_type === 'agent_finish') {
    const message = data.final_output || data.content || data.message || 'Task completed';

    // Only add message if it's different from the last one (prevent duplicates)
    if (message !== lastAssistantMessage) {
      addMessage('assistant', message);
      speak(message);
      lastAssistantMessage = message; // Track this message
    }

    updateStatus('Ready - Click mic for next command');
  } else if (data.type === 'error') {
    const errorMsg = data.error || 'An error occurred';

    // Only add error if it's different from last message
    if (errorMsg !== lastAssistantMessage) {
      addMessage('assistant', errorMsg);
      speak('Error: ' + errorMsg);
      lastAssistantMessage = errorMsg;
    }

    updateStatus('Error - Click mic to try again');
  }
}

// ============================================================================
// Speech Recognition
// ============================================================================

function initSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    console.error('Speech recognition not supported');
    updateStatus('Speech recognition not supported');
    return null;
  }

  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-US';

  recognition.onstart = () => {
    console.log('🎤 Speech recognition started');
    isListening = true;
    updateMicButton(true);
    updateStatus('Listening... speak now');
  };

  recognition.onresult = (event) => {
    let interimTranscript = '';
    let finalTranscript = '';

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalTranscript += transcript + ' ';
      } else {
        interimTranscript += transcript;
      }
    }

    if (finalTranscript) {
      currentTranscript += finalTranscript;
    }

    displayTranscript(currentTranscript, interimTranscript);
  };

  recognition.onerror = (event) => {
    console.error('Speech recognition error:', event.error);
    isListening = false;
    updateMicButton(false);

    if (event.error === 'not-allowed') {
      updateStatus('Microphone access denied');
      alert('Please allow microphone access in your browser settings');
    } else if (event.error !== 'no-speech') {
      updateStatus('Error: ' + event.error);
    }
  };

  recognition.onend = () => {
    console.log('Speech recognition ended');
    isListening = false;
    updateMicButton(false);

    // Auto-send after 1.5 seconds
    if (currentTranscript.trim()) {
      updateStatus('Sending in 1.5s...');
      setTimeout(() => {
        if (!isListening && currentTranscript.trim()) {
          console.log('✅ Auto-sending:', currentTranscript);
          sendCommand(currentTranscript.trim());
        }
      }, 1500);
    } else {
      updateStatus('Click to start listening');
    }
  };

  return recognition;
}

// ============================================================================
// Text-to-Speech
// ============================================================================

function loadVoices() {
  if (speechSynthesis.getVoices().length === 0) {
    speechSynthesis.addEventListener('voiceschanged', () => {
      console.log('Voices loaded:', speechSynthesis.getVoices().length);
    });
  }
}

function speak(text) {
  speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.2;
  utterance.pitch = 1.0;
  utterance.volume = 1.0;

  const voices = speechSynthesis.getVoices();
  const preferredVoice = voices.find(voice =>
    voice.name.includes('Google') ||
    voice.name.includes('Microsoft') ||
    voice.lang.startsWith('en')
  );

  if (preferredVoice) {
    utterance.voice = preferredVoice;
  }

  utterance.onstart = () => {
    updateStatus('Speaking...');
  };

  utterance.onend = () => {
    updateStatus('Ready - Click mic for next command');
  };

  speechSynthesis.speak(utterance);
}

// ============================================================================
// UI Updates
// ============================================================================

function updateMicButton(listening) {
  const micBtn = document.getElementById('micBtn');
  const statusText = document.getElementById('statusText');

  if (listening) {
    micBtn.classList.add('listening');
    statusText.classList.add('listening');
  } else {
    micBtn.classList.remove('listening');
    statusText.classList.remove('listening');
  }
}

function updateStatus(text) {
  document.getElementById('statusText').textContent = text;
}

function displayTranscript(finalText, interimText) {
  const transcriptEl = document.getElementById('transcript');

  if (!finalText && !interimText) {
    transcriptEl.innerHTML = '<div class="transcript-placeholder">Your speech will appear here...</div>';
    return;
  }

  let html = '';
  if (finalText) {
    html += `<div>${finalText}</div>`;
  }
  if (interimText) {
    html += `<div class="transcript-interim">${interimText}</div>`;
  }

  transcriptEl.innerHTML = html;
}

function addMessage(role, text) {
  const conversation = document.getElementById('conversation');
  if (!conversation) return;

  // Remove empty placeholder
  const empty = conversation.querySelector('.conversation-empty');
  if (empty) {
    empty.remove();
  }

  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${role}`;

  // Icon for user or assistant
  const icon = role === 'user'
    ? `<svg class="message-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
         <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
         <circle cx="12" cy="7" r="4"></circle>
       </svg>`
    : `<svg class="message-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
         <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
       </svg>`;

  messageDiv.innerHTML = `
    <div class="message-header">
      ${icon}
      <span class="message-label">${role === 'user' ? 'You' : 'Assistant'}</span>
    </div>
    <div class="message-text">${text}</div>
  `;

  conversation.appendChild(messageDiv);
  conversation.scrollTop = conversation.scrollHeight;

  console.log(`💬 ${role}: ${text}`);
}

// ============================================================================
// Send Command
// ============================================================================

function sendCommand(message) {
  if (!message.trim()) return;

  addMessage('user', message);
  updateStatus('🤖 Processing...');

  // Reset last assistant message for new conversation turn
  lastAssistantMessage = '';

  if (!websocket || websocket.readyState !== WebSocket.OPEN) {
    console.error('❌ WebSocket not connected');
    updateStatus('Connection error - Check terminal');
    speak('Not connected to server. Please check the terminal.');
    return;
  }

  try {
    websocket.send(JSON.stringify({ message: message }));
    console.log('✅ Sent:', message);

    currentTranscript = '';
    displayTranscript('', '');
  } catch (error) {
    console.error('Failed to send:', error);
    updateStatus('Failed to send');
    speak('Failed to send message. Please try again.');
  }
}

// ============================================================================
// Controls
// ============================================================================

function initControls() {
  const micBtn = document.getElementById('micBtn');

  micBtn.addEventListener('click', () => {
    if (!recognition) {
      recognition = initSpeechRecognition();
    }

    if (isListening) {
      // Stop listening - will auto-send after 1.5s
      recognition.stop();
      updateStatus('Stopping...');
    } else {
      // Start listening
      try {
        recognition.start();
      } catch (error) {
        console.error('Failed to start:', error);

        if (error.message && error.message.includes('already started')) {
          recognition.stop();
          setTimeout(() => {
            try {
              recognition.start();
            } catch (e) {
              console.error('Restart failed:', e);
            }
          }, 100);
        }
      }
    }
  });

  // Keyboard shortcut
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
      e.preventDefault();
      micBtn.click();
    }
  });
}

// Initialize on load
init();
