// script.js (replaceAll 適用 & scrollIntoView behavior:auto 改善版 & sendMessage を async/await で修正)

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
const charProfileTextElement = document.getElementById('char-profile'); // ★ IDが 'char-profile' の要素を取得
const startChatButton = document.getElementById('start-chat-button');
const profileError = document.getElementById('profile-error');
const chatView = document.getElementById('chat-view');
const chatHistory = document.getElementById('chat-history');
const chatForm = document.getElementById('chat-input-form');
const userInput = document.getElementById('user-input');
const sendButton = document.getElementById('send-button');
const chatHeaderTitle = document.getElementById('chat-header-title');
const chatError = document.getElementById('chat-error'); // chat-error 要素も取得（エラー表示用）

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
        // Optional: Adjust textarea height dynamically
        // userInput.addEventListener('input', adjustTextareaHeight);
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
    // ★ charProfile を charProfileTextElement に変更
    if (!profileView || !charName || !charProfileTextElement || !charIcon || !chatHeaderTitle) {
        console.error("Profile display elements not found.");
        return;
    }
    if (!data) { displayProfileError("キャラクターデータが見つかりません。"); return; };

    charName.textContent = data.name || '名前なし';

    // --- ★ 置換処理を追加 ---
    // 1. Firestoreから取得した生のprofileTextを取得 (なければデフォルトメッセージ)
    const rawProfileText = data.profileText || 'プロフィール情報がありません。';
    // 2. 文字列中の '\\n' を実際の改行コード '\n' に置換
    const processedProfileText = rawProfileText.replaceAll('\\n', '\n');
    // 3. 置換処理後のテキストを profileText を表示するHTML要素に設定
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
    // ★ charProfile を charProfileTextElement に変更
    if (!profileView || !charName || !charProfileTextElement || !profileError || !startChatButton) return;
    charName.textContent = 'エラー';
    charProfileTextElement.textContent = 'キャラクター情報を読み込めませんでした。'; // エラー時もここ
    const displayMessage = Object.values(ERROR_MESSAGES).includes(message) ? message : ERROR_MESSAGES.PROFILE_FETCH_ERROR;
    profileError.textContent = displayMessage;
    profileError.style.display = 'block';
    startChatButton.disabled = true;
}

function showLoadingState(isLoading) {
    // ★ charProfile を charProfileTextElement に変更
    if(isLoading) {
        if(charName) charName.textContent = '読み込み中...';
        if(charProfileTextElement) charProfileTextElement.textContent = '情報を取得しています...'; // ローディング時もここ
        if(startChatButton) startChatButton.disabled = true;
    }
     // Note: You might want an 'else' block here to re-enable the button
     // if loading finishes successfully, but loadProfileData already handles that.
}

// --- View Switching ---
function startChat() {
    if(!profileView || !chatView || !userInput) { console.error("Cannot switch views."); return; }
    profileView.classList.add('hidden');
    chatView.classList.remove('hidden');
    userInput.focus();

    // Initial scroll and welcome message logic
    setTimeout(() => {
        if (chatHistory) {
            if (chatHistory.children.length === 0) {
                // Only add welcome message if history is truly empty
                appendMessage('ai', WELCOME_MESSAGE);
            } else {
                // If history exists, just scroll to the end
                const lastMessage = chatHistory.lastElementChild;
                if (lastMessage) {
                    lastMessage.scrollIntoView({ behavior: 'auto', block: 'end' });
                }
            }
        }
    }, 100); // Short delay to ensure rendering
}

// --- Event Handlers (Chat) ---
function handleFormSubmit(event) { event.preventDefault(); sendMessage(); }
function handleInputKeyPress(event) { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(); } }

// --- Core Logic (Chat) ---
// =========================================
// ★★★ sendMessage 関数を async/await 版に修正 ★★★
// =========================================
async function sendMessage() {
    if (isAiResponding) return;
    if (!characterId) { appendChatError(ERROR_MESSAGES.ID_FETCH_ERROR); return; }
    if (!userInput) return;
    const userMessageText = userInput.value.trim();
    if (userMessageText === '') return;

    appendMessage('user', userMessageText);
    userInput.value = '';
    // adjustTextareaHeight(); // Adjust height after clearing (Optional)
    userInput.focus();
    showTypingIndicator();
    setAiResponding(true);
    clearChatError(); // Clear previous errors on new message send

    try {
        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', },
            body: JSON.stringify({ message: userMessageText, id: characterId })
        });

        // --- エラーレスポンス処理 ---
        if (!response.ok) {
            let errorPayload = null;
            let errorMessage = `HTTP error! status: ${response.status}`; // デフォルトのエラーメッセージ

            try {
                // エラーレスポンスのボディ (JSON形式) を試みる
                errorPayload = await response.json();
                console.log("API Error Payload:", errorPayload); // デバッグ用にペイロードをログ出力

                // ステータスコードやペイロードに応じてエラーメッセージを決定
                if (response.status === 403) {
                    errorMessage = ERROR_MESSAGES.LIMIT_REACHED; // ★期待するメッセージ
                } else if (response.status === 404) {
                    errorMessage = errorPayload?.error || ERROR_MESSAGES.INVALID_ID;
                } else if (errorPayload?.error) {
                    // APIが返したエラーメッセージを利用
                    errorMessage = errorPayload.error;
                }
                // 必要に応じて他のステータスコードの処理を追加
            } catch (jsonError) {
                // エラーレスポンスのJSONパースに失敗した場合 (ボディが空、JSONでない等)
                // errorMessage はデフォルトの "HTTP error! status: ..." のまま
                console.error("Failed to parse error response JSON (this is expected if body is empty or not JSON):", jsonError);
            }
            // 決定したエラーメッセージで Error を throw する
            throw new Error(errorMessage);
        }

        // --- 正常レスポンス処理 ---
        const data = await response.json();
        if (data && data.reply) {
            appendMessage('ai', data.reply);
        } else {
            // 正常レスポンスだが 'reply' がない場合
            console.warn("API response OK, but 'reply' field missing.", data);
            throw new Error(ERROR_MESSAGES.API_RESPONSE);
        }

    } catch (error) { // fetch 自体のエラー、または上で throw した Error をキャッチ
        console.error('Error caught in sendMessage:', error); // エラー内容をコンソールに出力
        // 最終的なエラーメッセージを画面に表示
        appendChatError(error.message || ERROR_MESSAGES.GENERAL);
    } finally {
        // 成功・失敗に関わらず実行
        removeTypingIndicator();
        setAiResponding(false);
    }
}
// =========================================
// ★★★ sendMessage 関数の修正 ここまで ★★★
// =========================================


// --- State Management (Chat) ---
function setAiResponding(isResponding) {
    isAiResponding = isResponding;
    // Check elements exist before disabling
    if (sendButton) sendButton.disabled = isResponding;
    if (userInput) userInput.disabled = isResponding;
}

// --- UI Update Functions (Chat) ---
function appendMessage(senderType, text) {
    if(!chatHistory) return;
    const messageId = `${senderType}-${Date.now()}`;
    const fragment = document.createDocumentFragment(); // Use fragment for efficiency
    const messageRow = createMessageRowElement(senderType, messageId);
    const icon = createIconElement(senderType);
    const content = createMessageContentElement(senderType, text); // Pass text here

    // Set AI icon if available
    if (senderType === 'ai' || senderType === 'error') { // AI or Error message uses character icon
        if (characterIconUrl) {
             icon.style.backgroundImage = `url('${characterIconUrl}')`;
             icon.style.backgroundColor = 'transparent';
        } else {
            // Keep default placeholder only if no icon URL
             icon.style.backgroundImage = '';
             icon.style.backgroundColor = ''; // Let CSS handle placeholder color
        }
         if(senderType === 'error') {
            // Override icon for explicit error type if needed by CSS/design
             icon.classList.add('message__icon--error'); // Add specific class if needed
         }
    }
    // User icon is handled by CSS typically

    // Append order based on sender
    if (senderType === 'user') { messageRow.appendChild(content); messageRow.appendChild(icon); }
    else { messageRow.appendChild(icon); messageRow.appendChild(content); } // ai or error

    fragment.appendChild(messageRow);
    chatHistory.appendChild(fragment);

    // Use scrollIntoView with behavior: 'auto' for smoother scrolling in most cases
    messageRow.scrollIntoView({ behavior: 'auto', block: 'end' });
}

function createMessageRowElement(senderType, messageId) {
    const element = document.createElement('div');
    element.className = `message message--${senderType === 'user' ? 'user' : 'ai'}`; // Default to 'ai' class for non-user
    element.dataset.messageId = messageId;
     if (senderType === 'error') { element.classList.add('message--error'); }
    return element;
}

function createIconElement(senderType) {
    const element = document.createElement('div');
    element.className = 'message__icon';
     // Specific sender icon styles are best handled in CSS or background image set in appendMessage
    return element;
}

function createMessageContentElement(senderType, text) {
    const content = document.createElement('div');
    content.className = 'message__content';
    const bubble = document.createElement('div');
    bubble.className = 'message__bubble';

    // Simple Markdown-like link handling: [text](url)
    // Regex to find markdown links
    const linkRegex = /\[([^\]]+)]\((https?:\/\/[^\s)]+)\)/g;

    // Check if text contains links AND is not an error message
    if (senderType !== 'error' && linkRegex.test(text)) {
         // Replace markdown links with actual <a> tags
         bubble.innerHTML = text.replace(linkRegex, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    } else {
         // If no links or it's an error, just set text content (safer for preventing XSS)
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
    const messageRow = createMessageRowElement('ai', messageId); // Use 'ai' type for layout
    const icon = createIconElement('ai');
    if (characterIconUrl) { icon.style.backgroundImage = `url('${characterIconUrl}')`; icon.style.backgroundColor = 'transparent'; }

    const content = document.createElement('div'); content.className = 'message__content';
    const bubble = document.createElement('div'); bubble.className = 'message__bubble';
    const indicator = document.createElement('div'); indicator.className = 'typing-indicator';
    indicator.innerHTML = `<span class="typing-indicator__dot"></span><span class="typing-indicator__dot"></span><span class="typing-indicator__dot"></span>`;
    bubble.appendChild(indicator); content.appendChild(bubble);

    messageRow.appendChild(icon); messageRow.appendChild(content);
    fragment.appendChild(messageRow); chatHistory.appendChild(fragment);

    // Scroll the indicator into view
    messageRow.scrollIntoView({ behavior: 'auto', block: 'end' });
}

function removeTypingIndicator() {
    if (typingIndicatorId && chatHistory) {
        const indicatorElement = chatHistory.querySelector(`[data-message-id="${typingIndicatorId}"]`);
        if (indicatorElement) { indicatorElement.remove(); }
        typingIndicatorId = null;
    }
}

function appendChatError(message) {
    // ログを追加して、渡されるメッセージを確認
    console.log("Appending chat error with message:", message);
    if (chatHistory) {
         removeTypingIndicator(); // Remove typing indicator if an error occurs
         appendMessage('error', message); // Use the specific 'error' type
    } else {
        // Fallback if chat history isn't available (e.g., error during init)
        console.error("Chat history element not found, cannot append error:", message);
        if(profileError) { // Display error in profile section as a last resort
            profileError.textContent = `チャットエラー: ${message}`;
            profileError.style.display = 'block';
        }
    }
}


function clearChatError() {
    // Find and remove existing error messages from chat history
    if(chatHistory) {
        const errorMessages = chatHistory.querySelectorAll('.message--error');
        errorMessages.forEach(el => el.remove());
    }
    // Also hide profile error if it was used as fallback
    // if (profileError && profileError.textContent.startsWith('チャットエラー:')) {
    //    profileError.textContent = '';
    //    profileError.style.display = 'none';
    // }
}


// --- Utility Functions ---
function getCurrentTime() {
    return new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false }); // Use ja-JP for consistency
}

// Function to get Character ID from URL
function getUniqueIdFromUrl() {
    try {
        const params = new URLSearchParams(window.location.search);
        // Try 'char_id' first, then fall back to 'id' for compatibility
        const potentialId = params.get('char_id') || params.get('id');
        console.log("Extracted Character ID from query params:", potentialId);
        if (!potentialId) {
             console.error("Could not find 'char_id' or 'id' parameter in URL.");
             return null;
        }
        // Basic validation (e.g., check if it's not empty string)
        return potentialId.trim() || null;
    } catch (e) {
        console.error("Error extracting Character ID from URL:", e);
        return null;
    }
}

// Optional: Function to adjust textarea height dynamically
// function adjustTextareaHeight() {
//    if (!userInput) return;
//    userInput.style.height = 'auto'; // Reset height
//    userInput.style.height = userInput.scrollHeight + 'px'; // Set to scroll height
// }
