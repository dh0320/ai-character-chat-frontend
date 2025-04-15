// script.js (visualViewport対応追加)

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
const chatContainer = document.querySelector('#chat-view .chat__container'); // ★ Chat Containerを取得
const chatHeader = document.querySelector('#chat-view .chat__header');      // ★ Chat Headerを取得
const chatHistory = document.getElementById('chat-history');
const chatFooter = document.querySelector('#chat-view .chat__footer');      // ★ Chat Footerを取得
const chatForm = document.getElementById('chat-input-form');
const userInput = document.getElementById('user-input');
const sendButton = document.getElementById('send-button');
const chatHeaderTitle = document.getElementById('chat-header-title');
const turnCounterElement = document.getElementById('turn-counter');

// --- State ---
let isAiResponding = false;
let typingIndicatorId = null;
let characterId = null;
let characterIconUrl = null;
let hasLoadedHistory = false;
let currentTurnCount = 0;
let maxTurns = 0;
let isKeyboardOpen = false; // ★ キーボード状態フラグ

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    characterId = getUniqueIdFromUrl();
    if (!characterId) {
        displayProfileError(ERROR_MESSAGES.ID_FETCH_ERROR);
        return;
    }
    await loadProfileAndHistoryData(characterId);

    if(startChatButton) { startChatButton.addEventListener('click', startChat); }
    else { console.error("Start chat button not found"); }

    if(chatForm) { chatForm.addEventListener('submit', handleFormSubmit); }
    else { console.error("Chat form not found"); }

    if(userInput) { userInput.addEventListener('keypress', handleInputKeyPress); }
    else { console.error("User input not found"); }

    setupVisualViewportListener(); // ★ visualViewportリスナーを設定
});

// --- Profile & History Loading ---
async function loadProfileAndHistoryData(id) { /* ... (変更なし) ... */ }
function displayProfileData(data) { /* ... (変更なし) ... */ }
function displayProfileError(message) { /* ... (変更なし) ... */ }
function showLoadingState(isLoading) { /* ... (変更なし) ... */ }

// --- View Switching ---
function startChat() { /* ... (変更なし, scrollToBottomの挙動は確認) ... */ }

// --- Event Handlers (Chat) ---
function handleFormSubmit(event) { /* ... (変更なし) ... */ }
function handleInputKeyPress(event) { /* ... (変更なし) ... */ }

// --- Core Logic (Chat) ---
async function sendMessage() { /* ... (変更なし) ... */ }

// --- State Management (Chat) ---
function setAiResponding(isResponding) { /* ... (変更なし) ... */ }

// --- UI Update Functions (Chat) ---
function appendMessage(senderType, text, shouldScroll = true) { /* ... (変更なし) ... */ }
function createMessageRowElement(senderType, messageId) { /* ... (変更なし) ... */ }
function createIconElement(senderType) { /* ... (変更なし) ... */ }
function createMessageContentElement(senderType, text) { /* ... (変更なし) ... */ }
function showTypingIndicator() { /* ... (変更なし) ... */ }
function removeTypingIndicator() { /* ... (変更なし) ... */ }
function appendChatError(message) { /* ... (変更なし) ... */ }
function clearChatError() { /* ... (変更なし) ... */ }
function updateTurnCounter(currentCount, maxCount) { /* ... (変更なし) ... */ }

// --- ★★★ Visual Viewport Handling for Keyboard ★★★ ---
function setupVisualViewportListener() {
    // 必要な要素が揃っているか確認
    if (!window.visualViewport || !userInput || !chatContainer || !chatFooter || !chatHistory || !chatHeader) {
        console.warn('VisualViewport API or necessary elements not available for keyboard handling.');
        return;
    }

    let initialContainerHeight = ''; // 初期高さを保存する変数

    const adjustLayoutForKeyboard = () => {
        if (!isKeyboardOpen) return; // フラグが立っていない場合は処理しない

        const vv = window.visualViewport;
        const windowHeight = window.innerHeight; // ブラウザウィンドウ全体の高さ
        const keyboardHeight = Math.max(0, windowHeight - vv.height - vv.offsetTop); // キーボードの高さを推定 (offsetTopも考慮)
        const availableHeight = vv.height; // キーボードを除いた実際の表示領域の高さ

        console.log(`Keyboard Open - WindowH: ${windowHeight}, VV H: ${vv.height}, VV OffsetTop: ${vv.offsetTop}, Est. KeyboardH: ${keyboardHeight}, AvailableH: ${availableHeight}`); // Debug

        // コンテナ全体の高さを visualViewport の高さに設定
        // これにより、ヘッダー、履歴、フッターがこの高さ内に収まるようにする
        if (initialContainerHeight === '') {
             // 初回調整時に元のCSS高さを保存（'100%'など）
             initialContainerHeight = chatContainer.style.height || window.getComputedStyle(chatContainer).height;
        }
        chatContainer.style.height = `${availableHeight}px`;

        // フッターをキーボードのすぐ上に配置
        // vv.offsetTop はビューポート上部のオフセットなので、bottomからの位置は計算が必要
        // windowHeight - vv.height がキーボードが表示されている領域の高さに近い
        const footerBottomOffset = windowHeight - vv.height;
        chatFooter.style.bottom = `${footerBottomOffset}px`;

        // 必要であれば、チャット履歴を一番下にスクロール
        // キーボード表示時に最新メッセージが見えるようにするため
        // ※ appendMessage 内でも scroll しているので、ここでは不要かもしれない
        // scrollToBottom(chatHistory, 'auto');
    };

    const resetLayout = () => {
        console.log("Resetting layout to initial state."); // Debug

        // chatContainerの高さを初期値（CSSで定義された値）に戻す
        chatContainer.style.height = initialContainerHeight || ''; // 保存した初期値 or 空文字でCSSに戻す
        initialContainerHeight = ''; // 初期値保存変数をリセット

        // フッターの位置を元の位置 (bottom: 0) に戻す
        chatFooter.style.bottom = '0px'; // CSSでの初期値に戻す（または保存していた値）

        isKeyboardOpen = false; // キーボード状態フラグをリセット
    };

    // --- イベントリスナーの設定 ---

    userInput.addEventListener('focus', () => {
        console.log("Input focused."); // Debug
        isKeyboardOpen = true; // キーボードが開いたと仮定
        // Android等でresizeイベントがfocus直後に発火しない場合があるため、
        // 少し遅延させて強制的に調整を試みる（resizeイベントが来れば上書きされる）
        // setTimeout(adjustLayoutForKeyboard, 200);
    });

    userInput.addEventListener('blur', () => {
        console.log("Input blurred."); // Debug
        // blur時に即座にリセットすると、入力候補選択などで問題が起きるため、
        // 基本的には resize イベントでキーボードが閉じたことを検知してリセットする。
        // isKeyboardOpen = false; // フラグだけ更新しておく
        // 下の resize リスナーでリセットするので、ここではコメントアウト
        // setTimeout(resetLayout, 100);
    });

    // visualViewport のリサイズイベントを監視
    window.visualViewport.addEventListener('resize', () => {
        const vv = window.visualViewport;
        const windowHeight = window.innerHeight;
        // キーボードが表示されているかの閾値（画面高さの例えば30%など）
        const keyboardThreshold = windowHeight * 0.3;
        const potentialKeyboardHeight = windowHeight - vv.height;

        console.log(`Viewport Resized - WindowH: ${windowHeight}, VV H: ${vv.height}, Potential KeyboardH: ${potentialKeyboardHeight}`); // Debug

        // キーボードが表示された（またはサイズが変わった）場合
        if (potentialKeyboardHeight > keyboardThreshold && isKeyboardOpen) {
             console.log("Keyboard detected open/resized."); // Debug
             adjustLayoutForKeyboard();
        }
        // キーボードが閉じた（または非常に小さくなった）場合
        else if (potentialKeyboardHeight < keyboardThreshold && isKeyboardOpen) {
             console.log("Keyboard detected closed."); // Debug
             resetLayout();
        }
        // isKeyboardOpen が false の場合（フォーカスが当たっていない場合のリサイズ）は何もしない
    });
}


// --- Utility Functions ---
function getCurrentTime() { /* ... (変更なし) ... */ }
function getUniqueIdFromUrl() { /* ... (変更なし) ... */ }
function scrollToBottom(element, behavior = 'smooth') { /* ... (変更なし) ... */ }
