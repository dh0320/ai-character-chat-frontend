// script.js (高さ自動調整 & コピー機能 追加版)

// --- Constants and Configuration ---
const API_ENDPOINT = 'https://asia-northeast1-aillm-456406.cloudfunctions.net/my-chat-api';
const WELCOME_MESSAGE = 'チャットを開始します！';
const ERROR_MESSAGES = {
    NETWORK: 'ネットワークエラーが発生しました。接続を確認してください。',
    API_RESPONSE: 'AIからの応答がありませんでした。',
    GENERAL: 'エラーが発生しました。しばらくしてからもう一度お試しください。',
    INVALID_ID: 'キャラクターが見つからないか、アクセスが許可されていません。',
    ID_FETCH_ERROR: 'URLからキャラクターIDを取得できませんでした。',
    PROFILE_FETCH_ERROR: 'キャラクター情報の取得に失敗しました。',
    LIMIT_REACHED: 'このキャラクターとの会話上限に達しました。',
    COPY_FAILED: 'コピーに失敗しました。', // コピー失敗メッセージ
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
const userInput = document.getElementById('user-input'); // textarea
const sendButton = document.getElementById('send-button');
const chatHeaderTitle = document.getElementById('chat-header-title');
const chatError = document.getElementById('chat-error'); // エラー表示用 (もしあれば)
const chatFooter = document.querySelector('.chat__footer'); // フッター要素を取得

// --- State ---
let isAiResponding = false;
let typingIndicatorId = null;
let characterId = null;
let characterIconUrl = null;
let copyTimeoutId = null; // コピーフィードバック用タイマーID

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
        // ★ 高さ自動調整のためのイベントリスナーを追加
        userInput.addEventListener('input', autoResizeTextarea);
        // ★ 初期高さを設定
        autoResizeTextarea.call(userInput); // ページ読み込み時にも高さを調整
    } else { console.error("User input not found"); }

    // ★ メッセージコピーのためのイベントリスナーを追加 (イベントデリゲーション)
    if (chatHistory) {
        chatHistory.addEventListener('click', handleBubbleClick);
    } else { console.error("Chat history not found for copy listener."); }

    // ★ モバイル表示時にフッターの高さが変わることに対応するため、
    // chat__history の padding-bottom を動的に調整するリスナーを追加
    if (window.matchMedia("(max-width: 767px)").matches && chatFooter && chatHistory) {
        const resizeObserver = new ResizeObserver(updateHistoryPadding);
        resizeObserver.observe(chatFooter);
        // 初期値も設定
        updateHistoryPadding();
    }
});

// --- Profile Loading ---
// (変更なし)
async function loadProfileData(id) { /* ... existing code ... */ }
function displayProfileData(data) { /* ... existing code ... */ }
function displayProfileError(message) { /* ... existing code ... */ }
function showLoadingState(isLoading) { /* ... existing code ... */ }

// --- View Switching ---
// (変更なし)
function startChat() { /* ... existing code ... */ }


// --- Event Handlers (Chat) ---
function handleFormSubmit(event) { event.preventDefault(); sendMessage(); }

function handleInputKeyPress(event) {
    // Shift+Enter で改行、Enterのみで送信
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
}

// ★ Textarea 高さ自動調整
function autoResizeTextarea() {
    // 一時的に高さを自動にしてscrollHeightを取得
    this.style.height = 'auto';
    // scrollHeightに基づいて高さを設定 (CSSのmax-heightを超えないように)
    const newHeight = Math.min(this.scrollHeight, parseInt(getComputedStyle(this).maxHeight));
    this.style.height = newHeight + 'px';
    // スクロールバーが表示される場合（max-heightに達した場合）
    this.style.overflowY = (this.scrollHeight > newHeight) ? 'auto' : 'hidden';

    // モバイルでフッターの高さが変わる場合、履歴のpaddingを更新 (ResizeObserverで代替)
    // if (window.matchMedia("(max-width: 767px)").matches && chatFooter && chatHistory) {
    //     updateHistoryPadding();
    // }
}

// ★ メッセージコピーイベントハンドラ (イベントデリゲーション)
async function handleBubbleClick(event) {
    const bubble = event.target.closest('.message__bubble');

    // エラーメッセージやタイムスタンプなどはコピー対象外
    if (!bubble || bubble.closest('.message--error')) {
        return;
    }

    // タイピングインジケーターも除外
    if (bubble.querySelector('.typing-indicator')) {
        return;
    }

    // リンクをクリックした場合はコピーしない (リンクを開く動作を優先)
    if (event.target.tagName === 'A') {
        return;
    }

    // 表示されているテキストを取得 (innerTextの方が適切)
    const textToCopy = bubble.innerText;

    if (!textToCopy) return;

    try {
        await navigator.clipboard.writeText(textToCopy);
        showCopyFeedback(bubble); // コピー成功フィードバック
    } catch (err) {
        console.error('Failed to copy text: ', err);
        // 必要であればユーザーにエラーメッセージを表示
        // appendChatError(ERROR_MESSAGES.COPY_FAILED); // 例
        alert(ERROR_MESSAGES.COPY_FAILED); // 簡単なアラート
    }
}

// ★ コピー成功フィードバック表示
function showCopyFeedback(bubbleElement) {
    // 既存のタイムアウトがあればクリア
    if (copyTimeoutId) {
        clearTimeout(copyTimeoutId);
        // 前回のフィードバックが残っていれば削除
        document.querySelectorAll('.message__bubble.copied').forEach(el => el.classList.remove('copied'));
    }

    bubbleElement.classList.add('copied');

    // 1.5秒後にクラスを削除
    copyTimeoutId = setTimeout(() => {
        bubbleElement.classList.remove('copied');
        copyTimeoutId = null;
    }, 1500);
}

// ★ モバイルでフッターの高さに応じて履歴の padding-bottom を調整する関数
function updateHistoryPadding() {
    if (chatFooter && chatHistory && window.matchMedia("(max-width: 767px)").matches) {
        const footerHeight = chatFooter.offsetHeight;
        const basePadding = parseInt(getComputedStyle(chatHistory).paddingLeft); // 他のpadding値を取得
        chatHistory.style.paddingBottom = `${footerHeight + basePadding}px`;
        // スクロール位置を調整（必要に応じて）
        // chatHistory.scrollTop = chatHistory.scrollHeight;
    } else if (chatHistory) {
        // デスクトップ表示などではデフォルトのpaddingに戻す（必要なら）
        // chatHistory.style.paddingBottom = ''; // スタイル属性を削除
    }
}


// --- Core Logic (Chat) ---
function sendMessage() {
    if (isAiResponding) return;
    if (!characterId) { appendChatError(ERROR_MESSAGES.ID_FETCH_ERROR); return; }
    if (!userInput) return;
    const userMessageText = userInput.value.trim();
    if (userMessageText === '') return;

    appendMessage('user', userMessageText);
    userInput.value = '';
    // ★ 送信後にテキストエリアの高さをリセット
    autoResizeTextarea.call(userInput);
    userInput.focus();
    showTypingIndicator();
    setAiResponding(true);

    // ★ スクロール処理 (最下部付近にいる場合のみスムーズスクロール)
    scrollToBottomIfNeeded(chatHistory);

    fetch(API_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', },
        body: JSON.stringify({ message: userMessageText, id: characterId })
    })
    .then(response => {
        // (既存のエラーハンドリング)
        if (!response.ok) {
            if (response.status === 403) { throw new Error(ERROR_MESSAGES.LIMIT_REACHED); }
            if (response.status === 404) {
                return response.json().then(errData => { throw new Error(errData.error || ERROR_MESSAGES.INVALID_ID); })
                       .catch(() => { throw new Error(ERROR_MESSAGES.INVALID_ID); });
            }
            return response.json().then(errData => {
                   const errorMsg = errData.error || `サーバーエラーが発生しました (HTTP ${response.status})`;
                   throw new Error(errorMsg);
            }).catch(() => { throw new Error(`HTTP error! status: ${response.status}`); });
        }
        return response.json();
    })
    .then(data => {
        removeTypingIndicator(); // ★ AI応答受信後にタイピングインジケーター削除
        if (data && data.reply) {
            appendMessage('ai', data.reply);
        } else {
            throw new Error(ERROR_MESSAGES.API_RESPONSE);
        }
    })
    .catch(error => {
        console.error('Error sending message or processing response:', error);
        removeTypingIndicator(); // ★ エラー時もタイピングインジケーター削除
        let displayError = ERROR_MESSAGES.GENERAL;
        if (Object.values(ERROR_MESSAGES).includes(error.message)) {
             displayError = error.message;
        } else if (error.message.includes('HTTP') || error.message.includes('Failed to fetch')) {
             displayError = ERROR_MESSAGES.NETWORK;
        }
        appendChatError(displayError); // エラーメッセージをチャットに追加
    })
    .finally(() => {
        // removeTypingIndicator(); ここではなく、応答受信後かエラー発生時に削除する
        setAiResponding(false);
    });
}

// --- State Management (Chat) ---
// (変更なし)
function setAiResponding(isResponding) { /* ... existing code ... */ }

// --- UI Update Functions (Chat) ---
function appendMessage(senderType, text) {
    if(!chatHistory) return;
    const messageId = `${senderType}-${Date.now()}`;
    const fragment = document.createDocumentFragment();
    const messageRow = createMessageRowElement(senderType, messageId);
    const icon = createIconElement(senderType);
    const content = createMessageContentElement(senderType, text);

    // アイコン設定 (変更なし)
    if (senderType === 'ai' && characterIconUrl) { /* ... */ }
    else { /* ... */ }

    if (senderType === 'user') { messageRow.appendChild(content); messageRow.appendChild(icon); }
    else { messageRow.appendChild(icon); messageRow.appendChild(content); }
    fragment.appendChild(messageRow);
    chatHistory.appendChild(fragment);

    // ★ スクロール処理を呼び出す
    scrollToBottomIfNeeded(chatHistory);
}

function createMessageRowElement(senderType, messageId) {
    // (変更なし)
    const element = document.createElement('div');
    element.className = `message message--${senderType === 'user' ? 'user' : 'ai'}`;
    element.dataset.messageId = messageId;
    if (senderType === 'error') { element.classList.add('message--error'); }
    return element;
}

function createIconElement(senderType) {
    // (変更なし)
    const element = document.createElement('div');
    element.className = 'message__icon';
    return element;
}

function createMessageContentElement(senderType, text) {
    // (変更なし - リンク処理含む)
    const content = document.createElement('div');
    content.className = 'message__content';
    const bubble = document.createElement('div');
    bubble.className = 'message__bubble';
    const linkRegex = /\[([^\]]+)]\((https?:\/\/[^\s)]+)\)/g;
    if (senderType !== 'error' && linkRegex.test(text)) {
        bubble.innerHTML = text.replace(linkRegex, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    } else {
        // ★ XSS対策としてtextContentを使うのが基本だが、意図的にHTML（リンク）を許可している
        // もしプレーンテキストのみ表示する場合は bubble.textContent = text; にする
        bubble.textContent = text; // または bubble.innerHTML = sanitizeHTML(text); のようなサニタイズ処理
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
    const messageRow = createMessageRowElement('ai', messageId); // 見た目はAIメッセージ
    const icon = createIconElement('ai');
    if (characterIconUrl) { icon.style.backgroundImage = `url('${characterIconUrl}')`; icon.style.backgroundColor = 'transparent'; }
    const content = document.createElement('div'); content.className = 'message__content';
    const bubble = document.createElement('div'); bubble.className = 'message__bubble';
    // タイピングインジケーターはコピー対象外にするため、クリックイベントが伝播しないようにするのも手
    bubble.style.cursor = 'default';
    const indicator = document.createElement('div'); indicator.className = 'typing-indicator';
    indicator.innerHTML = `<span class="typing-indicator__dot"></span><span class="typing-indicator__dot"></span><span class="typing-indicator__dot"></span>`;
    bubble.appendChild(indicator); content.appendChild(bubble);
    messageRow.appendChild(icon); messageRow.appendChild(content);
    fragment.appendChild(messageRow); chatHistory.appendChild(fragment);

    // ★ スクロール処理を呼び出す
    scrollToBottomIfNeeded(chatHistory);
}

function removeTypingIndicator() {
    if (typingIndicatorId && chatHistory) {
        const indicatorElement = chatHistory.querySelector(`[data-message-id="${typingIndicatorId}"]`);
        if (indicatorElement) { indicatorElement.remove(); }
        typingIndicatorId = null;
    }
}

function appendChatError(message) {
    // (変更なし)
    if (chatHistory) {
        appendMessage('error', message);
        // ★ エラー時もスクロール
        scrollToBottomIfNeeded(chatHistory);
    } else { /* ... */ }
}

// --- Utility Functions ---
function getCurrentTime() {
    // (変更なし)
    return new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
}

// ★ スクロールが必要か判断して実行する関数
function scrollToBottomIfNeeded(container) {
    if (!container) return;
    const threshold = 100; // 自動スクロールを発動する閾値 (px) - コンテナの底からこの距離以内ならスクロール
    const isScrolledNearBottom = container.scrollHeight - container.clientHeight <= container.scrollTop + threshold;

    // ユーザーが上にスクロールして履歴を見ている場合は、勝手にスクロールしない
    if (isScrolledNearBottom) {
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    }
}


// --- Function to get Character ID from URL ---
// (変更なし)
function getUniqueIdFromUrl() { /* ... existing code ... */ }
