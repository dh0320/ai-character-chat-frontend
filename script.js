// script.js (履歴表示機能追加、アイコン表示 'model' -> 'ai' マッピング修正、残り回数表示追加)

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
// ★★★ 残り回数表示用の要素を取得 ★★★
const turnCounterElement = document.getElementById('turn-counter');

// --- State ---
let isAiResponding = false;
let typingIndicatorId = null;
let characterId = null;
let characterIconUrl = null; // アイコンURLを保持するグローバル変数
let hasLoadedHistory = false; // 履歴読み込み済みフラグ
// ★★★ 会話回数関連の変数を追加 ★★★
let currentTurnCount = 0;
let maxTurns = 0; // ここではメッセージ総数(turnCount)の上限値

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

        // ★★★ プロファイル表示関数内で回数も更新 ★★★
        displayProfileData(data); // ここで characterIconUrl, currentTurnCount, maxTurns が設定される

        // 履歴データの表示処理
        if (data.history && Array.isArray(data.history) && data.history.length > 0) {
            console.log(`Loading ${data.history.length} messages from history...`);
            if (chatHistory) {
                chatHistory.innerHTML = ''; // 既存の表示をクリア
                data.history.forEach(message => {
                    if (message.role && message.message) {
                        // ★★★ Firestore の 'model' を フロントエンドの 'ai' に変換 ★★★
                        const senderType = message.role === 'model' ? 'ai' : message.role;
                        // ★★★ 変換後の senderType ('ai' or 'user') を appendMessage に渡す ★★★
                        appendMessage(senderType, message.message, false); // スクロールは最後に行う
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
    if (!profileView || !charName || !charProfileTextElement || !charIcon || !chatHeaderTitle || !turnCounterElement) { // ★ turnCounterElement もチェック
        console.error("Profile display elements not found.");
        return;
    }
    if (!data) { displayProfileError("キャラクターデータが見つかりません。"); return; };

    charName.textContent = data.name || '名前なし';

    const rawProfileText = data.profileText || 'プロフィール情報がありません。';
    const processedProfileText = rawProfileText.replaceAll('\\n', '\n');
    charProfileTextElement.textContent = processedProfileText;

    // グローバル変数 characterIconUrl を設定
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

    // ★★★ 会話回数と上限を設定し、カウンターを更新 ★★★
    currentTurnCount = data.currentTurnCount ?? 0; // nullish coalescing で 0 をデフォルトに
    maxTurns = data.maxTurns ?? 0; // 同様にデフォルトを0に
    updateTurnCounter(currentTurnCount, maxTurns); // 残り回数を表示

    if(startChatButton) startChatButton.disabled = false;
}

function displayProfileError(message) {
    if (!profileView || !charName || !charProfileTextElement || !profileError || !startChatButton || !turnCounterElement) return; // ★ turnCounterElement もチェック
    charName.textContent = 'エラー';
    charProfileTextElement.textContent = 'キャラクター情報を読み込めませんでした。';
    const displayMessage = Object.values(ERROR_MESSAGES).includes(message) ? message : ERROR_MESSAGES.PROFILE_FETCH_ERROR;
    profileError.textContent = displayMessage;
    profileError.style.display = 'block';
    startChatButton.disabled = true;
    // ★ エラー時はカウンターも非表示または初期状態にする
    turnCounterElement.textContent = ''; // または '残数: -' など
}

function showLoadingState(isLoading) {
    if(isLoading) {
        if(charName) charName.textContent = '読み込み中...';
        if(charProfileTextElement) charProfileTextElement.textContent = '情報を取得しています...';
        if(startChatButton) startChatButton.disabled = true;
        if(turnCounterElement) turnCounterElement.textContent = ''; // 読み込み中はカウンターをクリア
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

    // ★★★ チャット画面表示時にカウンターを更新 ★★★
    // (displayProfileDataで既に更新されているが、念のためここでも呼ぶ)
    updateTurnCounter(currentTurnCount, maxTurns);

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

    // ★★★ 送信前に残数チェック (より親切なUI) ★★★
    if (currentTurnCount >= maxTurns && maxTurns > 0) { // maxTurns > 0 は初期化前でないことを確認
        appendChatError(ERROR_MESSAGES.LIMIT_REACHED);
        return; // 上限に達していたら送信しない
    }

    // ユーザーメッセージ追加
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

        let responseData = null; // スコープを広げる
        try {
            responseData = await response.json(); // エラー時もJSONを先にパース試行
            console.log("API Response Data:", responseData);
        } catch (jsonError) {
            console.error("Failed to parse API response JSON:", jsonError);
             // JSONパース失敗時は基本的なHTTPエラーを投げる
            if (!response.ok) {
                 throw new Error(`HTTP error! status: ${response.status}`);
            } else {
                 // 成功しているのにJSONパース失敗は考えにくいが念のため
                 throw new Error(ERROR_MESSAGES.API_RESPONSE);
            }
        }

        if (!response.ok) {
            let errorMessage = `HTTP error! status: ${response.status}`;
            if (responseData) { // パース成功していれば詳細なエラーメッセージを使う
                if (response.status === 403 && responseData?.code === 'LIMIT_REACHED') {
                    errorMessage = ERROR_MESSAGES.LIMIT_REACHED;
                    // ★★★ 上限エラーの場合、カウンターも更新 ★★★
                    currentTurnCount = responseData.currentTurnCount ?? currentTurnCount;
                    maxTurns = responseData.maxTurns ?? maxTurns;
                    updateTurnCounter(currentTurnCount, maxTurns);
                } else if (response.status === 404) {
                    errorMessage = responseData?.error || ERROR_MESSAGES.INVALID_ID;
                } else if (responseData?.error) {
                    errorMessage = responseData.error;
                }
            }
            throw new Error(errorMessage);
        }

        // レスポンスがOKの場合
        if (responseData && responseData.reply) {
            removeTypingIndicator();
            // AI応答メッセージ追加
            appendMessage('ai', responseData.reply, true);
            // ★★★ 応答成功後、カウンターを更新 ★★★
            currentTurnCount = responseData.currentTurnCount ?? currentTurnCount;
            maxTurns = responseData.maxTurns ?? maxTurns;
            updateTurnCounter(currentTurnCount, maxTurns);
        } else {
            console.warn("API response OK, but 'reply' field missing or invalid response data.", responseData);
            throw new Error(ERROR_MESSAGES.API_RESPONSE);
        }

    } catch (error) {
        console.error('Error caught in sendMessage:', error);
        removeTypingIndicator();
        // ★ LIMIT_REACHED エラーの場合は、エラーメッセージ表示前にカウンター更新済み
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
// appendMessage 関数 (変更なし)
function appendMessage(senderType, text, shouldScroll = true) {
    if(!chatHistory) return;
    const messageId = `${senderType}-${Date.now()}`;
    const fragment = document.createDocumentFragment();
    // ★ クラス名設定を 'model' ではなく 'ai' に統一する方向でも良い
    //   その場合 CSS が .message--ai を対象にしていれば修正不要
    // const rowClassSender = senderType === 'model' ? 'ai' : senderType; // 必要ならここで変換
    // const messageRow = createMessageRowElement(rowClassSender, messageId);
    // ↓↓↓ 一旦 'model' のままにしておく (CSS確認を推奨)
    const messageRow = createMessageRowElement(senderType, messageId);
    const icon = createIconElement(senderType);
    const content = createMessageContentElement(senderType, text);

    // --- アイコン設定とデバッグログ ---
    // ★★★ senderType が 'ai' (loadProfileAndHistoryDataで変換済み) か 'error' の場合にアイコンを設定 ★★★
    if (senderType === 'ai' || senderType === 'error') {
        console.log(`[appendMessage] Attempting to set icon for ${senderType}. characterIconUrl:`, characterIconUrl);

        if (characterIconUrl) {
             icon.style.backgroundImage = `url('${characterIconUrl}')`;
             icon.style.backgroundColor = 'transparent';
             console.log(`[appendMessage] Set backgroundImage to: ${icon.style.backgroundImage}`);
        } else {
             icon.style.backgroundImage = '';
             icon.style.backgroundColor = '';
             console.log(`[appendMessage] No characterIconUrl found, using default styles.`);
        }
        if(senderType === 'error') {
             icon.classList.add('message__icon--error');
        }
    } else if (senderType === 'user') {
         console.log(`[appendMessage] Sender is user, skipping background image.`);
    }
    // --- ログ追加ここまで ---

    if (senderType === 'user') { messageRow.appendChild(content); messageRow.appendChild(icon); }
    else { messageRow.appendChild(icon); messageRow.appendChild(content); }

    fragment.appendChild(messageRow);
    chatHistory.appendChild(fragment);

    if (shouldScroll) {
        scrollToBottom(chatHistory, 'auto');
    }
}


function createMessageRowElement(senderType, messageId) {
    const element = document.createElement('div');
    // ★ 'model' を 'ai' としてクラス設定する場合
    // const className = senderType === 'model' ? 'ai' : senderType;
    // element.className = `message message--${className === 'user' ? 'user' : 'ai'}`;
    // ↓↓↓ 一旦 senderType のまま使う (CSS確認推奨)
    element.className = `message message--${senderType === 'user' ? 'user' : 'ai'}`; // 'ai' or 'user'
    element.dataset.messageId = messageId;
     if (senderType === 'error') { element.classList.add('message--error'); } // error は別クラス
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
    const processedText = text.replaceAll('\n', '<br>');

    if (senderType !== 'error' && linkRegex.test(processedText)) {
         bubble.innerHTML = processedText.replace(linkRegex, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    } else {
         bubble.innerHTML = processedText;
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
    // タイピングインジケーターは 'ai' として表示
    const messageRow = createMessageRowElement('ai', messageId);
    const icon = createIconElement('ai');

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
        // エラーメッセージは 'error' タイプで表示
        // ★ LIMIT_REACHED の場合は専用のスタイルなどを適用しても良い
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

// --- ★★★ 残り回数更新関数 ★★★ ---
function updateTurnCounter(currentCount, maxCount) {
    if (!turnCounterElement) {
        console.warn("Turn counter element not found, cannot update.");
        return;
    }
    // maxCount が 0 または未定義の場合はカウンターを表示しないか、別の表示にする
    if (maxCount <= 0) {
        turnCounterElement.textContent = ''; // または turnCounterElement.style.display = 'none';
        return;
    }

    // turnCount はメッセージの総数 (user + ai) なので、残りの「往復数」で表示する場合
    const remainingTurns = Math.max(0, Math.floor((maxCount - currentCount) / 2));
    // または、残りの「送信可能回数」で表示する場合 (ユーザーが次に送信できるか)
    const remainingMessages = Math.max(0, maxCount - currentCount);

    // ここでは「残り往復数」で表示する例
    // turnCounterElement.textContent = `残り ${remainingTurns} 回`;

    // ここでは「残りメッセージ数」で表示する例（より直感的かもしれない）
    turnCounterElement.textContent = `残 ${remainingMessages} 回`;

    // 上限に達したらスタイルを変更するなど
    if (remainingMessages <= 0) {
        turnCounterElement.classList.add('limit-reached'); // CSSでスタイルを定義
    } else {
        turnCounterElement.classList.remove('limit-reached');
    }
    console.log(`Turn counter updated: Current=${currentCount}, Max=${maxCount}, RemainingMsg=${remainingMessages}`);
}


// --- Utility Functions (変更なし) ---
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
//   if (!userInput) return;
//   userInput.style.height = 'auto'; // Reset height
//   userInput.style.height = userInput.scrollHeight + 'px'; // Set to scroll height
// }
