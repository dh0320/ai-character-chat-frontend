// script.js (履歴表示機能追加、アイコン表示デバッグログ追加)

// --- Constants and Configuration ---
const API_ENDPOINT = 'https://asia-northeast1-aillm-456406.cloudfunctions.net/my-chat-api'; // 必要に応じて更新
const WELCOME_MESSAGE = 'チャットを開始します！'; // 履歴がない場合に表示
const ERROR_MESSAGES = {
    NETWORK: 'ネットワークエラーが発生しました。接続を確認してください。',
    API_RESPONSE: 'AIからの応答がありませんでした。',
    GENERAL: 'エラーが発生しました。しばらくしてからもう一度お試しください。',
    INVALID_ID: 'キャラクターが見つからないか、アクセスが許可されていません。',
    ID_FETCH_ERROR: 'URLからキャラクターIDを取得できませんでした。',
    PROFILE_FETCH_ERROR: 'キャラクター情報の取得に失敗しました。',
    LIMIT_REACHED: 'このキャラクターとの会話上限に達しました。'
};

// --- DOM Elements ---
const profileView = document.getElementById('profile-view');
const charIcon = document.getElementById('char-icon');
const charName = document.getElementById('char-name');
const charProfileTextElement = document.getElementById('char-profile');
const startChatButton = document.getElementById('start-chat-button');
const profileError = document.getElementById('profile-error');
const chatView = document.getElementById('chat-view');
const chatHistory = document.getElementById('chat-history');
const chatForm = document.getElementById('chat-input-form');
const userInput = document.getElementById('user-input');
const sendButton = document.getElementById('send-button');
const chatHeaderTitle = document.getElementById('chat-header-title');
const chatError = document.getElementById('chat-error'); // chat-error 要素も取得

// --- State ---
let isAiResponding = false;
let typingIndicatorId = null;
let characterId = null;
let characterIconUrl = null; // ★ アイコンURLを保持するグローバル変数
let hasLoadedHistory = false; // 履歴読み込み済みフラグ

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    characterId = getUniqueIdFromUrl();
    if (!characterId) {
        displayProfileError(ERROR_MESSAGES.ID_FETCH_ERROR);
        return;
    }
    await loadProfileAndHistoryData(characterId); // プロファイルと履歴を読み込む
    if(startChatButton) { startChatButton.addEventListener('click', startChat); }
    else { console.error("Start chat button not found"); }
    if(chatForm) { chatForm.addEventListener('submit', handleFormSubmit); }
    else { console.error("Chat form not found"); }
    if(userInput) {
        userInput.addEventListener('keypress', handleInputKeyPress);
        // Optional: Adjust textarea height dynamically
        // userInput.addEventListener('input', adjustTextareaHeight);
    } else { console.error("User input not found"); }
});

// --- Profile & History Loading ---
async function loadProfileAndHistoryData(id) {
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
        const data = await response.json();

        displayProfileData(data); // ★ プロファイル表示 (ここで characterIconUrl が設定される)

        // 履歴データの表示処理
        if (data.history && Array.isArray(data.history) && data.history.length > 0) {
            console.log(`Loading ${data.history.length} messages from history...`);
            if (chatHistory) {
                chatHistory.innerHTML = ''; // 既存の表示をクリア
                data.history.forEach(message => {
                    // サーバーからのデータ形式に合わせて role と message を渡す
                    if (message.role && message.message) {
                        // ★ 履歴メッセージ表示時も appendMessage を使用
                        appendMessage(message.role, message.message, false); // スクロールは最後に行う
                    } else {
                        console.warn("Skipping history item due to missing role or message:", message);
                    }
                });
                hasLoadedHistory = true; // 履歴読み込みフラグを立てる
                 // 履歴表示後、一番下にスクロール
                scrollToBottom(chatHistory, 'auto');
            }
        } else {
            console.log("No history data found or history is empty.");
            hasLoadedHistory = false; // 履歴がない場合もフラグ更新
        }

    } catch (error) {
        console.error("Failed to load profile and history data:", error);
        displayProfileError(error.message || ERROR_MESSAGES.PROFILE_FETCH_ERROR);
    } finally {
        showLoadingState(false);
    }
}


function displayProfileData(data) {
    if (!profileView || !charName || !charProfileTextElement || !charIcon || !chatHeaderTitle) {
        console.error("Profile display elements not found.");
        return;
    }
    if (!data) { displayProfileError("キャラクターデータが見つかりません。"); return; };

    charName.textContent = data.name || '名前なし';

    const rawProfileText = data.profileText || 'プロフィール情報がありません。';
    const processedProfileText = rawProfileText.replaceAll('\\n', '\n');
    charProfileTextElement.textContent = processedProfileText;

    // ★ グローバル変数 characterIconUrl を設定
    if (data.iconUrl) {
        charIcon.src = data.iconUrl; // プロファイルビューのアイコンにも設定
        charIcon.alt = `${data.name || 'キャラクター'}のアイコン`;
        characterIconUrl = data.iconUrl; // グローバル変数に格納
        console.log("Character Icon URL set:", characterIconUrl); // デバッグ用
    } else {
        charIcon.alt = 'アイコンなし'; charIcon.src = '';
        characterIconUrl = null; // アイコンがない場合は null
        console.log("No Character Icon URL found."); // デバッグ用
    }
    chatHeaderTitle.textContent = data.name || 'AIキャラクター';
    if(startChatButton) startChatButton.disabled = false;
}

function displayProfileError(message) {
    if (!profileView || !charName || !charProfileTextElement || !profileError || !startChatButton) return;
    charName.textContent = 'エラー';
    charProfileTextElement.textContent = 'キャラクター情報を読み込めませんでした。';
    const displayMessage = Object.values(ERROR_MESSAGES).includes(message) ? message : ERROR_MESSAGES.PROFILE_FETCH_ERROR;
    profileError.textContent = displayMessage;
    profileError.style.display = 'block';
    startChatButton.disabled = true;
}

function showLoadingState(isLoading) {
    if(isLoading) {
        if(charName) charName.textContent = '読み込み中...';
        if(charProfileTextElement) charProfileTextElement.textContent = '情報を取得しています...';
        if(startChatButton) startChatButton.disabled = true;
    }
}

// --- View Switching ---
function startChat() {
    if(!profileView || !chatView || !userInput || !chatHistory) { console.error("Cannot switch views."); return; }
    profileView.classList.add('hidden');
    chatView.classList.remove('hidden');
    userInput.focus();

    // 履歴がない場合のみウェルカムメッセージを追加
    if (!hasLoadedHistory && chatHistory.children.length === 0) {
        appendMessage('ai', WELCOME_MESSAGE, false); // スクロールは最後に行う
    }

    // 画面表示後に一番下にスクロール
    setTimeout(() => {
        scrollToBottom(chatHistory, 'auto');
    }, 100);
}

// --- Event Handlers (Chat) ---
function handleFormSubmit(event) { event.preventDefault(); sendMessage(); }
function handleInputKeyPress(event) { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(); } }

// --- Core Logic (Chat) ---
async function sendMessage() {
    if (isAiResponding) return;
    if (!characterId) { appendChatError(ERROR_MESSAGES.ID_FETCH_ERROR); return; }
    if (!userInput) return;
    const userMessageText = userInput.value.trim();
    if (userMessageText === '') return;

    // ユーザーメッセージ追加 (アイコンURLは不要なのでnullを渡すが、appendMessage側で無視される)
    appendMessage('user', userMessageText, true);
    userInput.value = '';
    userInput.focus();
    showTypingIndicator();
    setAiResponding(true);
    clearChatError();

    try {
        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', },
            body: JSON.stringify({ message: userMessageText, id: characterId })
        });

        if (!response.ok) {
            let errorPayload = null;
            let errorMessage = `HTTP error! status: ${response.status}`;
            try {
                errorPayload = await response.json();
                console.log("API Error Payload:", errorPayload);
                if (response.status === 403 && errorPayload?.code === 'LIMIT_REACHED') {
                    errorMessage = ERROR_MESSAGES.LIMIT_REACHED;
                } else if (response.status === 404) {
                    errorMessage = errorPayload?.error || ERROR_MESSAGES.INVALID_ID;
                } else if (errorPayload?.error) {
                    errorMessage = errorPayload.error;
                }
            } catch (jsonError) {
                 console.error("Failed to parse error response JSON:", jsonError);
            }
            throw new Error(errorMessage);
        }

        const data = await response.json();
        if (data && data.reply) {
            removeTypingIndicator();
            // AI応答メッセージ追加 (グローバル変数の characterIconUrl が使われる)
            appendMessage('ai', data.reply, true);
        } else {
            console.warn("API response OK, but 'reply' field missing.", data);
            throw new Error(ERROR_MESSAGES.API_RESPONSE);
        }

    } catch (error) {
        console.error('Error caught in sendMessage:', error);
        removeTypingIndicator();
        appendChatError(error.message || ERROR_MESSAGES.GENERAL);
    } finally {
        setAiResponding(false);
    }
}


// --- State Management (Chat) ---
function setAiResponding(isResponding) {
    isAiResponding = isResponding;
    if (sendButton) sendButton.disabled = isResponding;
    if (userInput) userInput.disabled = isResponding;
}

// --- UI Update Functions (Chat) ---
// ★★★ appendMessage 関数にデバッグログを追加 ★★★
function appendMessage(senderType, text, shouldScroll = true) {
    if(!chatHistory) return;
    const messageId = `${senderType}-${Date.now()}`;
    const fragment = document.createDocumentFragment();
    const messageRow = createMessageRowElement(senderType, messageId);
    const icon = createIconElement(senderType);
    const content = createMessageContentElement(senderType, text);

    // --- アイコン設定とデバッグログ ---
    if (senderType === 'ai' || senderType === 'error') {
        // デバッグログ: 呼び出し時の characterIconUrl の値を確認
        console.log(`[appendMessage] Attempting to set icon for ${senderType}. characterIconUrl:`, characterIconUrl);

        if (characterIconUrl) { // グローバル変数を参照
             // アイコンURLがある場合の処理
             icon.style.backgroundImage = `url('${characterIconUrl}')`;
             icon.style.backgroundColor = 'transparent'; // 背景を透明に
             console.log(`[appendMessage] Set backgroundImage to: ${icon.style.backgroundImage}`);
        } else {
             // アイコンURLがない場合の処理 (フォールバック)
             icon.style.backgroundImage = ''; // スタイルをリセット
             icon.style.backgroundColor = ''; // スタイルをリセット (CSSに任せる)
             console.log(`[appendMessage] No characterIconUrl found, using default styles.`);
        }
        if(senderType === 'error') {
             icon.classList.add('message__icon--error'); // エラー用クラス
        }
    } else if (senderType === 'user') {
        // ユーザーアイコンの場合 (通常CSSで処理)
         console.log(`[appendMessage] Sender is user, skipping background image.`);
    }
    // --- ログ追加ここまで ---

    // メッセージ要素の組み立て
    if (senderType === 'user') { messageRow.appendChild(content); messageRow.appendChild(icon); }
    else { messageRow.appendChild(icon); messageRow.appendChild(content); } // ai or error

    fragment.appendChild(messageRow);
    chatHistory.appendChild(fragment);

    // スクロール処理
    if (shouldScroll) {
        scrollToBottom(chatHistory, 'auto');
    }
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
    // senderTypeに応じたクラス追加はCSS側で行う方が一般的
    // if(senderType === 'user') element.classList.add('message__icon--user');
    // if(senderType === 'ai') element.classList.add('message__icon--ai');
    return element;
}

function createMessageContentElement(senderType, text) {
    const content = document.createElement('div');
    content.className = 'message__content';
    const bubble = document.createElement('div');
    bubble.className = 'message__bubble';

    const linkRegex = /\[([^\]]+)]\((https?:\/\/[^\s)]+)\)/g;
    const processedText = text.replaceAll('\n', '<br>'); // 改行を<br>に

    if (senderType !== 'error' && linkRegex.test(processedText)) {
         bubble.innerHTML = processedText.replace(linkRegex, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    } else {
         bubble.innerHTML = processedText; // <br> を有効にするため textContent ではなく innerHTML
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

    // タイピングインジケーターのアイコンも characterIconUrl を使用
    if (characterIconUrl) {
        icon.style.backgroundImage = `url('${characterIconUrl}')`;
        icon.style.backgroundColor = 'transparent';
        console.log('[showTypingIndicator] Set icon background for typing indicator.');
    } else {
         icon.style.backgroundImage = '';
         icon.style.backgroundColor = '';
         console.log('[showTypingIndicator] No icon URL for typing indicator.');
    }


    const content = document.createElement('div'); content.className = 'message__content';
    const bubble = document.createElement('div'); bubble.className = 'message__bubble';
    const indicator = document.createElement('div'); indicator.className = 'typing-indicator';
    indicator.innerHTML = `<span class="typing-indicator__dot"></span><span class="typing-indicator__dot"></span><span class="typing-indicator__dot"></span>`;
    bubble.appendChild(indicator); content.appendChild(bubble);

    messageRow.appendChild(icon); messageRow.appendChild(content);
    fragment.appendChild(messageRow); chatHistory.appendChild(fragment);

    scrollToBottom(chatHistory, 'auto');
}

function removeTypingIndicator() {
    if (typingIndicatorId && chatHistory) {
        const indicatorElement = chatHistory.querySelector(`[data-message-id="${typingIndicatorId}"]`);
        if (indicatorElement) { indicatorElement.remove(); }
        typingIndicatorId = null;
    }
}

function appendChatError(message) {
    console.log("Appending chat error with message:", message);
    if (chatHistory) {
        removeTypingIndicator();
        // エラーメッセージ表示時も characterIconUrl を参照してアイコンを設定
        appendMessage('error', message, true);
    } else {
        console.error("Chat history element not found, cannot append error:", message);
        if(profileError) {
            profileError.textContent = `チャットエラー: ${message}`;
            profileError.style.display = 'block';
        }
    }
}


function clearChatError() {
    if(chatHistory) {
        const errorMessages = chatHistory.querySelectorAll('.message--error');
        errorMessages.forEach(el => el.remove());
    }
}


// --- Utility Functions ---
function getCurrentTime() {
    return new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function getUniqueIdFromUrl() {
    try {
        const params = new URLSearchParams(window.location.search);
        const potentialId = params.get('char_id') || params.get('id');
        console.log("Extracted Character ID from query params:", potentialId);
        if (!potentialId) {
             console.error("Could not find 'char_id' or 'id' parameter in URL.");
             return null;
        }
        return potentialId.trim() || null;
    } catch (e) {
        console.error("Error extracting Character ID from URL:", e);
        return null;
    }
}

function scrollToBottom(element, behavior = 'smooth') {
    if (element) {
        element.scrollTop = element.scrollHeight;
    }
}

// Optional: Function to adjust textarea height dynamically
// function adjustTextareaHeight() {
//    if (!userInput) return;
//    userInput.style.height = 'auto'; // Reset height
//    userInput.style.height = userInput.scrollHeight + 'px'; // Set to scroll height
// }
