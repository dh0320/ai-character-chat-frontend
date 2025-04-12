// script.js (会話上限エラー処理 + デバッグログ追加 + 初期スクロール追加)

// --- Constants and Configuration ---
const API_ENDPOINT = 'https://asia-northeast1-aillm-456406.cloudfunctions.net/my-chat-api'; // 確認済みのURL
const WELCOME_MESSAGE = 'チャットを開始します！';
const ERROR_MESSAGES = {
    NETWORK: 'ネットワークエラーが発生しました。接続を確認してください。',
    API_RESPONSE: 'AIからの応答がありませんでした。',
    GENERAL: 'エラーが発生しました。しばらくしてからもう一度お試しください。',
    INVALID_ID: 'キャラクターが見つからないか、アクセスが許可されていません。',
    ID_FETCH_ERROR: 'URLからキャラクターIDを取得できませんでした。',
    PROFILE_FETCH_ERROR: 'キャラクター情報の取得に失敗しました。',
    LIMIT_REACHED: 'このキャラクターとの会話上限に達しました。' // 上限到達メッセージ
};

// --- DOM Elements ---
const profileView = document.getElementById('profile-view');
const charIcon = document.getElementById('char-icon');
const charName = document.getElementById('char-name');
const charProfile = document.getElementById('char-profile');
const startChatButton = document.getElementById('start-chat-button');
const profileError = document.getElementById('profile-error');
const chatView = document.getElementById('chat-view');
const chatHistory = document.getElementById('chat-history');
const chatForm = document.getElementById('chat-input-form');
const userInput = document.getElementById('user-input');
const sendButton = document.getElementById('send-button');
const chatHeaderTitle = document.getElementById('chat-header-title');
const chatError = document.getElementById('chat-error'); // Error display in chat (currently unused)

// --- State ---
let isAiResponding = false;
let typingIndicatorId = null;
let characterId = null;
let characterIconUrl = null;

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    characterId = getUniqueIdFromUrl();
    if (!characterId) {
        displayProfileError(ERROR_MESSAGES.ID_FETCH_ERROR);
        return;
    }
    await loadProfileData(characterId);
    if(startChatButton) { startChatButton.addEventListener('click', startChat); }
    else { console.error("Start chat button not found"); }
    if(chatForm) { chatForm.addEventListener('submit', handleFormSubmit); }
    else { console.error("Chat form not found"); }
    if(userInput) {
        userInput.addEventListener('keypress', handleInputKeyPress);
    } else { console.error("User input not found"); }
});

// --- Profile Loading ---
async function loadProfileData(id) {
    showLoadingState(true);
    if(profileError) profileError.style.display = 'none';
    try {
        const response = await fetch(`${API_ENDPOINT}?id=${id}`, { method: 'GET' });
        if (!response.ok) {
            let errorMsg = ERROR_MESSAGES.PROFILE_FETCH_ERROR;
            try {
                const errData = await response.json();
                errorMsg = (response.status === 404 && errData.error) ? ERROR_MESSAGES.INVALID_ID : (errData.error || `HTTP ${response.status}`);
            } catch (e) { errorMsg = `HTTP ${response.status}`; }
            throw new Error(errorMsg);
        }
        const profileData = await response.json();
        displayProfileData(profileData);
    } catch (error) {
        console.error("Failed to load profile data:", error);
        displayProfileError(error.message || ERROR_MESSAGES.PROFILE_FETCH_ERROR);
    } finally {
         showLoadingState(false);
    }
}

function displayProfileData(data) {
    if (!profileView || !charName || !charProfile || !charIcon || !chatHeaderTitle) { console.error("Profile display elements not found."); return; }
    if (!data) { displayProfileError("キャラクターデータが見つかりません。"); return; };
    charName.textContent = data.name || '名前なし';
    charProfile.textContent = data.profileText || 'プロフィール情報がありません。';
    if (data.iconUrl) {
        charIcon.src = data.iconUrl;
        charIcon.alt = `${data.name || 'キャラクター'}のアイコン`;
        characterIconUrl = data.iconUrl;
    } else {
        charIcon.alt = 'アイコンなし'; charIcon.src = ''; characterIconUrl = null;
    }
    chatHeaderTitle.textContent = data.name || 'AIキャラクター';
    if(startChatButton) startChatButton.disabled = false;
}

function displayProfileError(message) {
    if (!profileView || !charName || !charProfile || !profileError || !startChatButton) return;
    charName.textContent = 'エラー';
    charProfile.textContent = 'キャラクター情報を読み込めませんでした。';
    const displayMessage = Object.values(ERROR_MESSAGES).includes(message) ? message : ERROR_MESSAGES.PROFILE_FETCH_ERROR;
    profileError.textContent = displayMessage;
    profileError.style.display = 'block';
    startChatButton.disabled = true;
}

function showLoadingState(isLoading) {
    if(isLoading) {
        if(charName) charName.textContent = '読み込み中...';
        if(charProfile) charProfile.textContent = '情報を取得しています...';
        if(startChatButton) startChatButton.disabled = true;
    }
}

// --- View Switching ---
function startChat() {
    if(!profileView || !chatView || !userInput) { console.error("Cannot switch views."); return; }
    profileView.classList.add('hidden');
    chatView.classList.remove('hidden');
    userInput.focus();
    // Add welcome message if chat is empty (appendMessage handles scrolling)
    setTimeout(() => {
        if (chatHistory && chatHistory.children.length === 0) { appendMessage('ai', WELCOME_MESSAGE); }
    }, 100);
    // ★ Scroll to bottom immediately when chat view is shown (for existing history)
    scrollToBottom();
}

// --- Event Handlers (Chat) ---
function handleFormSubmit(event) { event.preventDefault(); sendMessage(); }
function handleInputKeyPress(event) { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(); } }

// --- Core Logic (Chat) ---
function sendMessage() {
    if (isAiResponding) return;
    if (!characterId) { appendChatError(ERROR_MESSAGES.ID_FETCH_ERROR); return; }
    if (!userInput) return;
    const userMessageText = userInput.value.trim();
    if (userMessageText === '') return;

    appendMessage('user', userMessageText); // Scrolls in appendMessage
    userInput.value = '';
    userInput.focus();
    showTypingIndicator(); // Scrolls in showTypingIndicator
    setAiResponding(true);

    fetch(API_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', },
        body: JSON.stringify({ message: userMessageText, id: characterId })
    })
    .then(response => {
        if (!response.ok) {
            if (response.status === 403) {
                throw new Error(ERROR_MESSAGES.LIMIT_REACHED);
            }
            if (response.status === 404) {
                return response.json().then(errData => {
                     throw new Error(errData.error || ERROR_MESSAGES.INVALID_ID);
                }).catch(() => { throw new Error(ERROR_MESSAGES.INVALID_ID); });
            }
            return response.json().then(errData => {
                 const errorMsg = errData.error || `サーバーエラーが発生しました (HTTP ${response.status})`;
                 throw new Error(errorMsg);
            }).catch(() => { throw new Error(`HTTP error! status: ${response.status}`); });
        }
        return response.json();
    })
    .then(data => {
        if (data && data.reply) {
            appendMessage('ai', data.reply); // Scrolls in appendMessage
        } else {
            throw new Error(ERROR_MESSAGES.API_RESPONSE);
        }
    })
    .catch(error => {
        console.error('Error sending message or processing response:', error);
        let displayError = ERROR_MESSAGES.GENERAL;
        if (Object.values(ERROR_MESSAGES).includes(error.message)) {
             displayError = error.message;
        } else if (error.message.includes('HTTP') || error.message.includes('Failed to fetch')) {
             displayError = ERROR_MESSAGES.NETWORK;
        }
        appendChatError(displayError); // Scrolls in appendChatError (via appendMessage)
    })
    .finally(() => {
        removeTypingIndicator();
        setAiResponding(false);
    });
}

// --- State Management (Chat) ---
function setAiResponding(isResponding) {
    isAiResponding = isResponding;
    if (characterId && sendButton && userInput) {
         sendButton.disabled = isResponding;
         userInput.disabled = isResponding;
    }
}

// --- UI Update Functions (Chat) ---
function appendMessage(senderType, text) {
    if(!chatHistory) return;
    const messageId = `${senderType}-${Date.now()}`;
    const fragment = document.createDocumentFragment();
    const messageRow = createMessageRowElement(senderType, messageId);
    const icon = createIconElement(senderType);
    const content = createMessageContentElement(senderType, text);

    if (senderType === 'ai' && characterIconUrl) {
        icon.style.backgroundImage = `url('${characterIconUrl}')`;
        icon.style.backgroundColor = 'transparent';
    } else {
        // Reset icon styles for user or error messages
        icon.style.backgroundImage = '';
        icon.style.backgroundColor = '';
    }

    if (senderType === 'user') { messageRow.appendChild(content); messageRow.appendChild(icon); }
    else { messageRow.appendChild(icon); messageRow.appendChild(content); }
    fragment.appendChild(messageRow);
    chatHistory.appendChild(fragment);
    scrollToBottom(); // ★ Scroll after adding message
}

function createMessageRowElement(senderType, messageId) {
    const element = document.createElement('div');
    element.className = `message message--${senderType === 'user' ? 'user' : 'ai'}`;
    element.dataset.messageId = messageId;
     if (senderType === 'error') { element.classList.add('message--error'); }
    return element;
}

function createIconElement(senderType) {
    const element = document.createElement('div');
    element.className = 'message__icon';
    // Icon background image is set in appendMessage
    return element;
}

function createMessageContentElement(senderType, text) {
    const content = document.createElement('div');
    content.className = 'message__content';
    const bubble = document.createElement('div');
    bubble.className = 'message__bubble';
    const linkRegex = /\[([^\]]+)]\((https?:\/\/[^\s)]+)\)/g;
    // Render link only if not an error message and contains the pattern
    if (senderType !== 'error' && linkRegex.test(text)) {
        bubble.innerHTML = text.replace(linkRegex, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    } else {
        bubble.textContent = text;
    }
    const timestamp = document.createElement('div');
    timestamp.className = 'message__timestamp';
    timestamp.textContent = getCurrentTime();
    content.appendChild(bubble);
    // Only add timestamp for non-error messages
    if (senderType !== 'error') { content.appendChild(timestamp); }
    return content;
}

function showTypingIndicator() {
    if (typingIndicatorId || !chatHistory) return;
    const messageId = `typing-${Date.now()}`;
    typingIndicatorId = messageId;
    const fragment = document.createDocumentFragment();
    const messageRow = createMessageRowElement('ai', messageId);
    const icon = createIconElement('ai');
    if (characterIconUrl) { icon.style.backgroundImage = `url('${characterIconUrl}')`; icon.style.backgroundColor = 'transparent'; }
    const content = document.createElement('div'); content.className = 'message__content';
    const bubble = document.createElement('div'); bubble.className = 'message__bubble';
    const indicator = document.createElement('div'); indicator.className = 'typing-indicator';
    indicator.innerHTML = `<span class="typing-indicator__dot"></span><span class="typing-indicator__dot"></span><span class="typing-indicator__dot"></span>`;
    bubble.appendChild(indicator); content.appendChild(bubble);
    messageRow.appendChild(icon); messageRow.appendChild(content);
    fragment.appendChild(messageRow); chatHistory.appendChild(fragment);
    scrollToBottom(); // ★ Scroll after adding indicator
}

function removeTypingIndicator() {
    if (typingIndicatorId && chatHistory) {
        const indicatorElement = chatHistory.querySelector(`[data-message-id="${typingIndicatorId}"]`);
        if (indicatorElement) { indicatorElement.remove(); }
        typingIndicatorId = null;
    }
}

function appendChatError(message) {
    if (chatHistory) {
        appendMessage('error', message); // appendMessage handles scrolling
    } else {
        console.error("Chat history element not found, cannot append error:", message);
        if(profileError) {
            profileError.textContent = `チャットエラー: ${message}`;
            profileError.style.display = 'block';
        }
    }
}

// --- Utility Functions ---
function getCurrentTime() {
    return new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
}

function scrollToBottom() {
    if(!chatHistory) return;
    // Use requestAnimationFrame to ensure DOM update is complete before scrolling
    requestAnimationFrame(() => {
        chatHistory.scrollTop = chatHistory.scrollHeight;
    });
}

// --- Function to get Character ID from URL ---
function getUniqueIdFromUrl() {
    try {
        const params = new URLSearchParams(window.location.search);
        const potentialId = params.get('char_id');
        console.log("Extracted Character ID from query params:", potentialId);
        if (!potentialId) { console.error("Could not find 'char_id' parameter."); return null; }
        return potentialId;
    } catch (e) { console.error("Error extracting Character ID:", e); return null; }
}
