// script.js (プロフィール表示・ビュー切り替え・AIアバターアイコン修正済み)

// --- Constants and Configuration ---
const API_ENDPOINT = 'https://asia-northeast1-aillm-456406.cloudfunctions.net/my-chat-api'; // あなたのGCFエンドポイントURL
const WELCOME_MESSAGE = 'チャットを開始します！';
const ERROR_MESSAGES = {
    NETWORK: 'ネットワークエラーが発生しました。接続を確認してください。',
    API_RESPONSE: 'AIからの応答がありませんでした。',
    GENERAL: 'エラーが発生しました。しばらくしてからもう一度お試しください。',
    INVALID_ID: 'キャラクターが見つからないか、アクセスが許可されていません。',
    ID_FETCH_ERROR: 'URLからキャラクターIDを取得できませんでした。',
    PROFILE_FETCH_ERROR: 'キャラクター情報の取得に失敗しました。',
};

// --- DOM Elements ---
// Profile View Elements
const profileView = document.getElementById('profile-view');
const charIcon = document.getElementById('char-icon');
const charName = document.getElementById('char-name');
const charProfile = document.getElementById('char-profile');
const startChatButton = document.getElementById('start-chat-button');
const profileError = document.getElementById('profile-error');

// Chat View Elements
const chatView = document.getElementById('chat-view');
const chatHistory = document.getElementById('chat-history');
const chatForm = document.getElementById('chat-input-form');
const userInput = document.getElementById('user-input');
const sendButton = document.getElementById('send-button');
const chatHeaderTitle = document.getElementById('chat-header-title');
const chatError = document.getElementById('chat-error'); // チャット画面のエラー用 (現在未使用だが要素はある想定)

// --- State ---
let isAiResponding = false;
let typingIndicatorId = null;
let characterId = null;
let characterIconUrl = null; // <-- キャラクターアイコンURLを格納する変数

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    characterId = getUniqueIdFromUrl(); // URLからキャラID取得

    if (!characterId) {
        displayProfileError(ERROR_MESSAGES.ID_FETCH_ERROR);
        return; // IDがなければ処理中断
    }

    await loadProfileData(characterId); // プロフィール情報を非同期で読み込み・表示

    // チャット開始ボタンのイベントリスナー設定
    // null チェックを追加（要素が見つからない場合のエラー回避）
    if(startChatButton) {
      startChatButton.addEventListener('click', startChat);
    } else {
      console.error("Start chat button not found");
    }

    // チャットフォームのイベントリスナー設定
     if(chatForm) {
      chatForm.addEventListener('submit', handleFormSubmit);
    } else {
        console.error("Chat form not found");
    }
    if(userInput) {
        userInput.addEventListener('keypress', handleInputKeyPress);
        userInput.focus(); // 初期フォーカスはプロフィール表示後でも良いかも
    } else {
         console.error("User input not found");
    }

    // Welcomeメッセージはチャット開始時に移動
    // setTimeout(() => { appendMessage('ai', WELCOME_MESSAGE); }, 500);
});

// --- Profile Loading ---
async function loadProfileData(id) {
    showLoadingState(true); // プロフィール読み込み中表示 (任意)
    profileError.style.display = 'none'; // エラーメッセージを隠す
    try {
        const response = await fetch(`${API_ENDPOINT}?id=${id}`, { method: 'GET' });

        if (!response.ok) {
            let errorMsg = ERROR_MESSAGES.PROFILE_FETCH_ERROR;
            try {
                 const errData = await response.json();
                 errorMsg = errData.error || `HTTP ${response.status}: ${response.statusText}`;
            } catch (e) { /* ignore json parse error */ }
            throw new Error(errorMsg);
        }

        const profileData = await response.json();
        displayProfileData(profileData);

    } catch (error) {
        console.error("Failed to load profile data:", error);
        displayProfileError(error.message || ERROR_MESSAGES.PROFILE_FETCH_ERROR);
    } finally {
         showLoadingState(false); // 読み込み完了表示 (任意)
    }
}

function displayProfileData(data) {
    if (!profileView || !charName || !charProfile || !charIcon || !chatHeaderTitle) {
         console.error("Profile display elements not found.");
         return;
    }
    if (!data) {
         displayProfileError("キャラクターデータが見つかりません。");
         return;
    };
    charName.textContent = data.name || '名前なし';
    charProfile.textContent = data.profileText || 'プロフィール情報がありません。';
    if (data.iconUrl) {
        charIcon.src = data.iconUrl;
        charIcon.alt = `${data.name || 'キャラクター'}のアイコン`;
        characterIconUrl = data.iconUrl; // <-- アイコンURLを保存
    } else {
        charIcon.alt = 'アイコンなし';
        charIcon.src = ''; // 画像がない場合はクリア (またはデフォルト画像)
        characterIconUrl = null;
    }
    chatHeaderTitle.textContent = data.name || 'AIキャラクター';
    if(startChatButton) startChatButton.disabled = false; // データ読み込めたらボタン有効化
}

function displayProfileError(message) {
     if (!profileView || !charName || !charProfile || !profileError || !startChatButton) return;
     charName.textContent = 'エラー';
     charProfile.textContent = 'キャラクター情報を読み込めませんでした。';
     profileError.textContent = message;
     profileError.style.display = 'block';
     startChatButton.disabled = true;
}

function showLoadingState(isLoading) {
     // 必要に応じて、プロフィール読み込み中にスピナーなどを表示する処理
     if(isLoading) {
        if(charName) charName.textContent = '読み込み中...';
        if(charProfile) charProfile.textContent = '情報を取得しています...';
        if(startChatButton) startChatButton.disabled = true;
     } else {
         // Loding表示を消す処理（displayProfileData/Errorで上書きされるので不要かも）
     }
}


// --- View Switching ---
function startChat() {
    if(!profileView || !chatView || !userInput) {
        console.error("Cannot switch views - elements not found.");
        return;
    }
    profileView.classList.add('hidden'); // プロフィールを隠す
    chatView.classList.remove('hidden'); // チャットを表示
    userInput.focus(); // 入力欄にフォーカス
    // 最初のメッセージを表示 (チャット開始後)
    setTimeout(() => {
        // 既存のメッセージがあれば表示しない、などの制御を追加しても良い
        if (chatHistory && chatHistory.children.length === 0) {
             appendMessage('ai', WELCOME_MESSAGE);
        }
    }, 100);
}

// --- Event Handlers (Chat) ---
function handleFormSubmit(event) {
    event.preventDefault();
    sendMessage();
}

function handleInputKeyPress(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
}

// --- Core Logic (Chat) ---
function sendMessage() {
    if (isAiResponding) return;
    if (!characterId) {
        appendChatError(ERROR_MESSAGES.ID_FETCH_ERROR);
        return;
    }
    if(!userInput) return; // 入力欄がなければ何もしない

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
            return response.json().then(errData => {
                 const errorMsg = errData.error || `HTTP ${response.status}`;
                 throw new Error(errorMsg);
            }).catch(() => { throw new Error(`HTTP ${response.status}`); });
        }
        return response.json();
    })
    .then(data => {
        if (data && data.reply) {
            appendMessage('ai', data.reply);
        } else {
            throw new Error(ERROR_MESSAGES.API_RESPONSE);
        }
    })
    .catch(error => {
        console.error('Error sending message:', error);
        let displayError = ERROR_MESSAGES.GENERAL;
        if (error.message.includes('HTTP') || error.message.includes('Failed to fetch')) {
             displayError = ERROR_MESSAGES.NETWORK;
        } else if (Object.values(ERROR_MESSAGES).includes(error.message)){
             displayError = error.message;
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
    if (characterId && sendButton && userInput) { // Check elements exist
         sendButton.disabled = isResponding;
         userInput.disabled = isResponding;
    }
}

// --- UI Update Functions (Chat) ---
function appendMessage(senderType, text) {
    if(!chatHistory) return; // チャット履歴要素がなければ何もしない

    const messageId = `${senderType}-${Date.now()}`;
    const fragment = document.createDocumentFragment();
    const messageRow = createMessageRowElement(senderType, messageId);
    const icon = createIconElement(senderType);
    const content = createMessageContentElement(senderType, text);

    // ▼▼▼ AIアバターアイコン設定 ▼▼▼
    if (senderType === 'ai' && characterIconUrl) {
        icon.style.backgroundImage = `url('${characterIconUrl}')`;
        icon.style.backgroundColor = 'transparent'; // Placeholder色を消す
    } else {
         // UserアイコンやErrorアイコンはCSSで処理される想定
         // 必要ならデフォルトに戻す処理
         icon.style.backgroundImage = '';
         icon.style.backgroundColor = '';
    }
    // ▲▲▲ AIアバターアイコン設定 ▲▲▲

    // Assemble row based on sender type
    if (senderType === 'user') {
        messageRow.appendChild(content);
        messageRow.appendChild(icon);
    } else { // ai or error
        messageRow.appendChild(icon);
        messageRow.appendChild(content);
    }
    fragment.appendChild(messageRow);
    chatHistory.appendChild(fragment);
    scrollToBottom();
}

function createMessageRowElement(senderType, messageId) {
    const element = document.createElement('div');
    element.className = `message message--${senderType === 'user' ? 'user' : 'ai'}`;
    element.dataset.messageId = messageId;
     if (senderType === 'error') {
         element.classList.add('message--error');
     }
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
        // console.warn("Used innerHTML for link rendering."); // Optionally remove/keep warning
    } else {
        bubble.textContent = text;
    }
    const timestamp = document.createElement('div');
    timestamp.className = 'message__timestamp';
    timestamp.textContent = getCurrentTime();
    content.appendChild(bubble);
    // Optionally hide timestamp for errors
    if (senderType !== 'error') {
        content.appendChild(timestamp);
    }
    return content;
}

function showTypingIndicator() {
    if (typingIndicatorId || !chatHistory) return;
    const messageId = `typing-${Date.now()}`;
    typingIndicatorId = messageId;
    const fragment = document.createDocumentFragment();
    const messageRow = createMessageRowElement('ai', messageId); // Use 'ai' layout
    const icon = createIconElement('ai'); // Create icon element

    // ▼▼▼ Typingインジケータにもアイコンを適用 ▼▼▼
    if (characterIconUrl) {
         icon.style.backgroundImage = `url('${characterIconUrl}')`;
         icon.style.backgroundColor = 'transparent';
    }
    // ▲▲▲ Typingインジケータにもアイコンを適用 ▲▲▲

    const content = document.createElement('div');
    content.className = 'message__content';
    const bubble = document.createElement('div');
    bubble.className = 'message__bubble';
    const indicator = document.createElement('div');
    indicator.className = 'typing-indicator';
    indicator.innerHTML = `<span class="typing-indicator__dot"></span><span class="typing-indicator__dot"></span><span class="typing-indicator__dot"></span>`;
    bubble.appendChild(indicator);
    content.appendChild(bubble);
    messageRow.appendChild(icon);
    messageRow.appendChild(content);
    fragment.appendChild(messageRow);
    chatHistory.appendChild(fragment);
    scrollToBottom();
}

function removeTypingIndicator() {
    if (typingIndicatorId && chatHistory) {
        const indicatorElement = chatHistory.querySelector(`[data-message-id="${typingIndicatorId}"]`);
        if (indicatorElement) {
            indicatorElement.remove();
        }
        typingIndicatorId = null;
    }
}

function appendChatError(message) {
     // Append error message directly to the chat history
     appendMessage('error', message);
}

// --- Utility Functions ---
function getCurrentTime() {
    return new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
}

function scrollToBottom() {
    if(!chatHistory) return;
    requestAnimationFrame(() => {
        chatHistory.scrollTop = chatHistory.scrollHeight;
    });
}

// --- Function to get Character ID from URL ---
function getUniqueIdFromUrl() {
    try {
        const params = new URLSearchParams(window.location.search);
        const potentialId = params.get('char_id'); // Using 'char_id' parameter
        console.log("Extracted Character ID from query params:", potentialId);
        if (!potentialId) {
            console.error("Could not find 'char_id' query parameter in URL:", window.location.search);
            return null;
        }
        return potentialId;
    } catch (e) {
        console.error("Error extracting Character ID from URL query params", e);
        return null;
    }
}