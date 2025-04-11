// script.js (会話上限エラー処理 + デバッグログ追加)

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
// const TEST_USER_ID = "test-dummy-user-123"; // Now using getUniqueIdFromUrl

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
        // Initial focus might be better after profile loads or chat starts
        // userInput.focus();
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
    setTimeout(() => {
        if (chatHistory && chatHistory.children.length === 0) { appendMessage('ai', WELCOME_MESSAGE); }
    }, 100);
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

    appendMessage('user', userMessageText);
    userInput.value = '';
    userInput.focus();
    showTypingIndicator();
    setAiResponding(true);

    fetch(API_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', },
        body: JSON.stringify({ message: userMessageText, id: characterId })
    })
    .then(response => {
        if (!response.ok) {
            // ▼▼▼ ★★★ 403 の処理をシンプル化 ★★★ ▼▼▼
            if (response.status === 403) {
                // 403 が返ってきたら、無条件で上限到達エラーとして扱う
                throw new Error(ERROR_MESSAGES.LIMIT_REACHED);
            }
            // ▲▲▲ ★★★ 403 の処理をシンプル化 ★★★ ▲▲▲
    
            // 404 Not Found はキャラクターが見つからない場合
            if (response.status === 404) {
                 return response.json().then(errData => {
                     // エラーメッセージがあれば使う、なければデフォルト
                     throw new Error(errData.error || ERROR_MESSAGES.INVALID_ID);
                 }).catch(() => { throw new Error(ERROR_MESSAGES.INVALID_ID); });
            }
            // その他のHTTPエラー (500 Internal Server Error など)
            return response.json().then(errData => {
                 const errorMsg = errData.error || `サーバーエラーが発生しました (HTTP ${response.status})`;
                 throw new Error(errorMsg);
            // ネットワークエラー等でJSONが読めない場合はHTTPステータスエラー
            }).catch(() => { throw new Error(`HTTP error! status: ${response.status}`); });
        }
        return response.json(); // 正常なレスポンス (200 OK)
    })
    .then(data => {
        if (data && data.reply) {
            appendMessage('ai', data.reply);
        } else {
            throw new Error(ERROR_MESSAGES.API_RESPONSE);
        }
    })
    .catch(error => {
        // ▼▼▼ デバッグログは不要であれば削除してもOK ▼▼▼
        console.error('>>> Caught Error Object:', error);
        console.error('>>> Caught Error Message:', error.message);
        // ▲▲▲ デバッグログ ▲▲▲
    
        console.error('Error sending message or processing response:', error);
        let displayError = ERROR_MESSAGES.GENERAL;
        if (Object.values(ERROR_MESSAGES).includes(error.message)) {
             displayError = error.message; // LIMIT_REACHED もここで拾われる
        } else if (error.message.includes('HTTP') || error.message.includes('Failed to fetch')) {
             displayError = ERROR_MESSAGES.NETWORK;
        }
        appendChatError(displayError);
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
        icon.style.backgroundImage = '';
        icon.style.backgroundColor = '';
    }

    if (senderType === 'user') { messageRow.appendChild(content); messageRow.appendChild(icon); }
    else { messageRow.appendChild(icon); messageRow.appendChild(content); }
    fragment.appendChild(messageRow);
    chatHistory.appendChild(fragment);
    scrollToBottom();
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
    return element;
}

function createMessageContentElement(senderType, text) {
    const content = document.createElement('div');
    content.className = 'message__content';
    const bubble = document.createElement('div');
    bubble.className = 'message__bubble';
    const linkRegex = /\[([^\]]+)]\((https?:\/\/[^\s)]+)\)/g;
    if (senderType !== 'error' && linkRegex.test(text)) {
        bubble.innerHTML = text.replace(linkRegex, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    } else {
        bubble.textContent = text;
    }
    const timestamp = document.createElement('div');
    timestamp.className = 'message__timestamp';
    timestamp.textContent = getCurrentTime();
    content.appendChild(bubble);
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
    scrollToBottom();
}

function removeTypingIndicator() {
    if (typingIndicatorId && chatHistory) {
        const indicatorElement = chatHistory.querySelector(`[data-message-id="${typingIndicatorId}"]`);
        if (indicatorElement) { indicatorElement.remove(); }
        typingIndicatorId = null;
    }
}

function appendChatError(message) {
     // Ensure chatHistory element exists before trying to append
     if (chatHistory) {
         appendMessage('error', message);
     } else {
         console.error("Chat history element not found, cannot append error:", message);
         // Optionally display error elsewhere, like the profile error div
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
    requestAnimationFrame(() => { chatHistory.scrollTop = chatHistory.scrollHeight; });
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
