// script.js (履歴表示機能追加、その他改善)

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
let characterIconUrl = null;
let hasLoadedHistory = false; // ★ 履歴読み込み済みフラグ

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    characterId = getUniqueIdFromUrl();
    if (!characterId) {
        displayProfileError(ERROR_MESSAGES.ID_FETCH_ERROR);
        return;
    }
    await loadProfileAndHistoryData(characterId); // ★ 関数名変更 & 履歴読み込み処理
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

// --- Profile & History Loading --- ★ 関数名と処理内容変更
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

        displayProfileData(data); // プロファイル表示

        // ★★★ 履歴データの表示処理 ★★★
        if (data.history && Array.isArray(data.history) && data.history.length > 0) {
            console.log(`Loading ${data.history.length} messages from history...`);
            if (chatHistory) {
                chatHistory.innerHTML = ''; // 既存の表示をクリア
                data.history.forEach(message => {
                    // サーバーからのデータ形式に合わせて role と message を渡す
                    if (message.role && message.message) {
                        appendMessage(message.role, message.message, false); // スクロールは最後に行うのでここではfalse
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
            // 履歴がない場合のみウェルカムメッセージを追加（startChatへ移動）
            // if (chatHistory) {
            //     chatHistory.innerHTML = ''; // クリアはしておく
            //     appendMessage('ai', WELCOME_MESSAGE, false);
            // }
        }
         // ★★★ 履歴表示処理ここまで ★★★

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

    // --- ★ 置換処理 (変更なし) ---
    const rawProfileText = data.profileText || 'プロフィール情報がありません。';
    const processedProfileText = rawProfileText.replaceAll('\\n', '\n');
    charProfileTextElement.textContent = processedProfileText;
    // --- ★ 置換処理ここまで ---

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
    // Note: ローディング完了時のボタン有効化は loadProfileAndHistoryData の最後で行われる
}

// --- View Switching ---
function startChat() {
    if(!profileView || !chatView || !userInput || !chatHistory) { console.error("Cannot switch views."); return; }
    profileView.classList.add('hidden');
    chatView.classList.remove('hidden');
    userInput.focus();

    // ★★★ 履歴がない場合のみウェルカムメッセージを追加 ★★★
    if (!hasLoadedHistory && chatHistory.children.length === 0) {
        appendMessage('ai', WELCOME_MESSAGE, false); // スクロールは最後に行う
    }

    // ★★★ 画面表示後に一番下にスクロール ★★★
    // setTimeout を使ってレンダリング後のスクロールを確実にする
    setTimeout(() => {
        scrollToBottom(chatHistory, 'auto');
    }, 100); // 短い遅延
}

// --- Event Handlers (Chat) ---
function handleFormSubmit(event) { event.preventDefault(); sendMessage(); }
function handleInputKeyPress(event) { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(); } }

// --- Core Logic (Chat) ---
// ★★★ sendMessage 関数 (エラー処理改善含む、前回と同じ) ★★★
async function sendMessage() {
    if (isAiResponding) return;
    if (!characterId) { appendChatError(ERROR_MESSAGES.ID_FETCH_ERROR); return; }
    if (!userInput) return;
    const userMessageText = userInput.value.trim();
    if (userMessageText === '') return;

    appendMessage('user', userMessageText, true); // ユーザーメッセージは即時スクロール
    userInput.value = '';
    // adjustTextareaHeight(); // Optional
    userInput.focus();
    showTypingIndicator(); // タイピング表示開始＆スクロール
    setAiResponding(true);
    clearChatError(); // Clear previous errors

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
                if (response.status === 403 && errorPayload?.code === 'LIMIT_REACHED') { // codeもチェック
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
            // AIの返信はタイピングインジケーター削除後に表示＆スクロール
            removeTypingIndicator(); // 先にインジケーターを消す
            appendMessage('ai', data.reply, true); // AIメッセージを追加してスクロール
        } else {
            console.warn("API response OK, but 'reply' field missing.", data);
            throw new Error(ERROR_MESSAGES.API_RESPONSE);
        }

    } catch (error) {
        console.error('Error caught in sendMessage:', error);
        removeTypingIndicator(); // エラー時もインジケーター削除
        appendChatError(error.message || ERROR_MESSAGES.GENERAL); // エラーメッセージ表示＆スクロール
    } finally {
        setAiResponding(false); // 応答状態解除
    }
}


// --- State Management (Chat) ---
function setAiResponding(isResponding) {
    isAiResponding = isResponding;
    if (sendButton) sendButton.disabled = isResponding;
    if (userInput) userInput.disabled = isResponding;
}

// --- UI Update Functions (Chat) ---
// ★★★ appendMessage に scroll オプション追加 ★★★
function appendMessage(senderType, text, shouldScroll = true) { // デフォルトでスクロールする
    if(!chatHistory) return;
    const messageId = `${senderType}-${Date.now()}`;
    const fragment = document.createDocumentFragment();
    const messageRow = createMessageRowElement(senderType, messageId);
    const icon = createIconElement(senderType);
    const content = createMessageContentElement(senderType, text);

    if (senderType === 'ai' || senderType === 'error') {
        if (characterIconUrl) {
             icon.style.backgroundImage = `url('${characterIconUrl}')`;
             icon.style.backgroundColor = 'transparent';
        } else {
             icon.style.backgroundImage = '';
             icon.style.backgroundColor = ''; // Let CSS handle placeholder
        }
        if(senderType === 'error') {
             icon.classList.add('message__icon--error');
        }
    }

    if (senderType === 'user') { messageRow.appendChild(content); messageRow.appendChild(icon); }
    else { messageRow.appendChild(icon); messageRow.appendChild(content); }

    fragment.appendChild(messageRow);
    chatHistory.appendChild(fragment);

    // ★★★ 条件に応じてスクロール ★★★
    if (shouldScroll) {
        scrollToBottom(chatHistory, 'auto'); // 新しいスクロール関数呼び出し
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
    return element;
}

function createMessageContentElement(senderType, text) {
    const content = document.createElement('div');
    content.className = 'message__content';
    const bubble = document.createElement('div');
    bubble.className = 'message__bubble';

    const linkRegex = /\[([^\]]+)]\((https?:\/\/[^\s)]+)\)/g;

    // ★★★ 改行コード (\n) を <br> に変換する処理を追加 ★★★
    const processedText = text.replaceAll('\n', '<br>');

    // リンク処理と改行処理を組み合わせる
    // Note: replaceAll の後に replace を使う
    if (senderType !== 'error' && linkRegex.test(processedText)) {
         // innerHTML を使うので XSS に注意が必要だが、URL/テキスト部分はある程度制限されている想定
         bubble.innerHTML = processedText.replace(linkRegex, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    } else {
         // リンクがない場合やエラーの場合は textContent ではなく innerHTML で <br> を有効にする
         bubble.innerHTML = processedText; // textContentだと <br> がそのまま表示される
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

    // ★★★ タイピングインジケーター表示時もスクロール ★★★
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
        appendMessage('error', message, true); // エラーメッセージもスクロール
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
    // if (profileError && profileError.textContent.startsWith('チャットエラー:')) {
    //    profileError.textContent = '';
    //    profileError.style.display = 'none';
    // }
}


// --- Utility Functions ---
function getCurrentTime() {
    return new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function getUniqueIdFromUrl() {
    try {
        const params = new URLSearchParams(window.location.search);
        const potentialId = params.get('char_id') || params.get('id'); // 'char_id' or 'id'
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

// ★★★ スクロール用のヘルパー関数 ★★★
function scrollToBottom(element, behavior = 'smooth') {
    if (element) {
        // scrollIntoView より scrollTop の方が制御しやすい場合がある
        element.scrollTop = element.scrollHeight;
        // もし scrollIntoView を使う場合:
        // const lastMessage = element.lastElementChild;
        // if (lastMessage) {
        //     lastMessage.scrollIntoView({ behavior: behavior, block: 'end' });
        // }
    }
}


// Optional: Function to adjust textarea height dynamically
// function adjustTextareaHeight() {
//    if (!userInput) return;
//    userInput.style.height = 'auto'; // Reset height
//    userInput.style.height = userInput.scrollHeight + 'px'; // Set to scroll height
// }
