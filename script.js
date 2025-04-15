// script.js (履歴表示機能追加、アイコン表示 'model' -> 'ai' マッピング修正、残り回数表示追加, visualViewport対応追加)



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

const chatContainer = document.querySelector('#chat-view .chat__container'); // ★ Chat Containerを取得 (追加)

const chatHeader = document.querySelector('#chat-view .chat__header');      // ★ Chat Headerを取得 (追加)

const chatHistory = document.getElementById('chat-history');

const chatFooter = document.querySelector('#chat-view .chat__footer');      // ★ Chat Footerを取得 (追加)

const chatForm = document.getElementById('chat-input-form');

const userInput = document.getElementById('user-input');

const sendButton = document.getElementById('send-button');

const chatHeaderTitle = document.getElementById('chat-header-title');

// const chatError = document.getElementById('chat-error'); // HTMLに存在しないためコメントアウト

const turnCounterElement = document.getElementById('turn-counter');



// --- State ---

let isAiResponding = false;

let typingIndicatorId = null;

let characterId = null;

let characterIconUrl = null; // アイコンURLを保持するグローバル変数

let hasLoadedHistory = false; // 履歴読み込み済みフラグ

let currentTurnCount = 0;

let maxTurns = 0; // ここではメッセージ総数(turnCount)の上限値

let isKeyboardOpen = false; // ★ キーボード状態フラグ (追加)

let initialContainerHeightStyle = ''; // ★ 初期コンテナ高さを保存 (追加)

let initialFooterBottomStyle = ''; // ★ 初期フッターbottomを保存 (追加)



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



    setupVisualViewportListener(); // ★ visualViewportリスナーを設定 (追加)

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

        if (data.history && Array.isArray(data.history)) { // data.historyが存在し、配列であることを確認

             if (chatHistory) { // chatHistory要素が存在することを確認

                chatHistory.innerHTML = ''; // 既存の表示をクリア

                if (data.history.length > 0) { // 履歴が空でない場合

                    console.log(`Loading ${data.history.length} messages from history...`);

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

                     // 'auto' で瞬時にスクロール

                    scrollToBottom(chatHistory, 'auto');

                } else {

                    console.log("History data found but is empty.");

                    hasLoadedHistory = false; // 履歴がない場合もフラグ更新

                }

             } else {

                 console.error("Chat history element not found.");

                 hasLoadedHistory = false;

             }

        } else {

            console.log("No history data found in response.");

            hasLoadedHistory = false; // 履歴がない場合もフラグ更新

            if (chatHistory) chatHistory.innerHTML = ''; // 履歴要素があればクリア

        }



    } catch (error) {

        console.error("Failed to load profile and history data:", error);

        displayProfileError(error.message || ERROR_MESSAGES.PROFILE_FETCH_ERROR);

    } finally {

        showLoadingState(false);

    }

}





function displayProfileData(data) {

    // 要素チェックを強化

    if (!profileView || !charName || !charProfileTextElement || !charIcon || !chatHeaderTitle || !turnCounterElement || !startChatButton) {

        console.error("One or more profile display elements not found.");

        return;

    }

    if (!data) { displayProfileError("キャラクターデータが見つかりません。"); return; };



    charName.textContent = data.name || '名前なし';

    chatHeaderTitle.textContent = data.name || 'AIキャラクター'; // ★ チャットヘッダーも更新



    const rawProfileText = data.profileText || 'プロフィール情報がありません。';

    const processedProfileText = rawProfileText.replaceAll('\\n', '\n');

    charProfileTextElement.textContent = processedProfileText;



    // グローバル変数 characterIconUrl を設定

    if (data.iconUrl) {

        charIcon.src = data.iconUrl; // プロファイルビューのアイコンにも設定

        charIcon.alt = `${data.name || 'キャラクター'}のアイコン`;

        characterIconUrl = data.iconUrl; // グローバル変数に格納

        console.log("Character Icon URL set:", characterIconUrl);

    } else {

        charIcon.alt = 'アイコンなし';

        charIcon.src = 'placeholder-icon.png'; // ★ Placeholder画像に戻すか確認

        characterIconUrl = null; // アイコンがない場合は null

        console.log("No Character Icon URL found.");

    }



    // ★★★ 会話回数と上限を設定し、カウンターを更新 ★★★

    currentTurnCount = data.currentTurnCount ?? 0; // nullish coalescing で 0 をデフォルトに

    maxTurns = data.maxTurns ?? 0; // 同様にデフォルトを0に

    updateTurnCounter(currentTurnCount, maxTurns); // 残り回数を表示



    startChatButton.disabled = false; // ★ ボタンを有効化

}



function displayProfileError(message) {

    if (!profileView || !charName || !charProfileTextElement || !profileError || !startChatButton || !turnCounterElement) return; // ★ 要素チェック

    charName.textContent = 'エラー';

    charProfileTextElement.textContent = 'キャラクター情報を読み込めませんでした。';

    const displayMessage = Object.values(ERROR_MESSAGES).includes(message) ? message : ERROR_MESSAGES.PROFILE_FETCH_ERROR;

    profileError.textContent = displayMessage;

    profileError.style.display = 'block';

    startChatButton.disabled = true;

    // ★ エラー時はカウンターも非表示または初期状態にする

    turnCounterElement.textContent = ''; // または '残数: -' など

    turnCounterElement.classList.remove('limit-reached'); // スタイルもリセット

}



function showLoadingState(isLoading) {

    if(isLoading) {

        if(charName) charName.textContent = '読み込み中...';

        if(charProfileTextElement) charProfileTextElement.textContent = '情報を取得しています...';

        if(startChatButton) startChatButton.disabled = true;

        if(turnCounterElement) turnCounterElement.textContent = ''; // 読み込み中はカウンターをクリア

        if(profileError) profileError.style.display = 'none'; // エラー表示を隠す

    }

    // ローディング解除時の処理は displayProfileData/displayProfileError で行う

}



// --- View Switching ---

function startChat() {

    if(!profileView || !chatView || !userInput || !chatHistory) { console.error("Cannot switch views."); return; }

    profileView.classList.add('hidden');

    chatView.classList.remove('hidden');



    // 履歴がない場合のみウェルカムメッセージを追加

    if (!hasLoadedHistory && chatHistory.children.length === 0) {

        appendMessage('ai', WELCOME_MESSAGE, false); // スクロールは最後に行う

    }



    // ★★★ チャット画面表示時にカウンターを更新 ★★★

    updateTurnCounter(currentTurnCount, maxTurns);



    // 画面表示後に一番下にスクロールし、入力欄にフォーカス

    setTimeout(() => {

        scrollToBottom(chatHistory, 'auto');

        userInput.focus(); // ★ フォーカスを設定

    }, 100); // 少し遅延させてレンダリングを待つ

}



// --- Event Handlers (Chat) ---

function handleFormSubmit(event) { event.preventDefault(); sendMessage(); }

function handleInputKeyPress(event) { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(); } }



// --- Core Logic (Chat) ---

async function sendMessage() {

    if (isAiResponding) return;

    if (!characterId) { appendChatError(ERROR_MESSAGES.ID_FETCH_ERROR); return; }

    if (!userInput) { console.error("User input element not found."); return; } // ★ input存在チェック追加

    const userMessageText = userInput.value.trim();

    if (userMessageText === '') return;



    // ★★★ 送信前に残数チェック ★★★

    if (maxTurns > 0 && currentTurnCount >= maxTurns) {

        appendChatError(ERROR_MESSAGES.LIMIT_REACHED);

        return; // 上限に達していたら送信しない

    }



    // ユーザーメッセージ追加

    appendMessage('user', userMessageText, true);

    userInput.value = ''; // 入力欄をクリア

    // adjustTextareaHeight(); // 必要なら高さリセット

    userInput.focus(); // 再度フォーカス



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

            if (!response.ok) {

                throw new Error(`HTTP error! status: ${response.status}`);

            } else {

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

            removeTypingIndicator(); // ★ 応答がない場合もインジケーター削除

            throw new Error(ERROR_MESSAGES.API_RESPONSE);

        }



    } catch (error) {

        console.error('Error caught in sendMessage:', error);

        removeTypingIndicator(); // ★ エラー時もインジケーター削除

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

function appendMessage(senderType, text, shouldScroll = true) {

    if(!chatHistory) { console.error("chatHistory element not found."); return; } // ★ Nullチェック強化

    const messageId = `${senderType}-${Date.now()}`;

    const fragment = document.createDocumentFragment();



    // ★ senderType 'model' を 'ai' に変換

    const effectiveSenderType = senderType === 'model' ? 'ai' : senderType;



    const messageRow = createMessageRowElement(effectiveSenderType, messageId);

    const icon = createIconElement(effectiveSenderType);

    const content = createMessageContentElement(effectiveSenderType, text);



    // --- アイコン設定 ---

    // AIアイコン（エラー時含む）

    if (effectiveSenderType === 'ai' || effectiveSenderType === 'error') {

        // console.log(`[appendMessage] Setting icon for ${effectiveSenderType}. URL:`, characterIconUrl); // Debug

        if (characterIconUrl && effectiveSenderType === 'ai') { // AIの場合のみURL画像を設定

            icon.style.backgroundImage = `url('${characterIconUrl}')`;

            icon.style.backgroundColor = 'transparent'; // 背景色を透明に

        } else {

            // URLがない場合やエラーの場合はCSSのデフォルトスタイルを使用

            icon.style.backgroundImage = '';

            icon.style.backgroundColor = ''; // CSSに任せる

        }

        // エラーアイコンは CSS (.message--error .message__icon) で設定される前提

    }

    // ユーザーアイコンは CSS (.message--user .message__icon) で設定される前提



    // メッセージ要素の組み立て

    if (effectiveSenderType === 'user') {

        messageRow.appendChild(content);

        messageRow.appendChild(icon);

    } else { // ai または error

        messageRow.appendChild(icon);

        messageRow.appendChild(content);

    }



    fragment.appendChild(messageRow);

    chatHistory.appendChild(fragment);



    if (shouldScroll) {

        // スクロール実行 ('smooth' は新しいメッセージに、'auto' は初期ロードに適する)

        const scrollBehavior = shouldScroll === 'auto' ? 'auto' : 'smooth';

        scrollToBottom(chatHistory, scrollBehavior);

    }

}





function createMessageRowElement(senderType, messageId) {

    const element = document.createElement('div');

    // クラス名は 'ai' または 'user' を基本とする

    element.className = `message message--${senderType === 'user' ? 'user' : 'ai'}`;

    element.dataset.messageId = messageId;

     // エラーの場合、追加クラスを付与

    if (senderType === 'error') {

        element.classList.add('message--error');

    }

    return element;

}



function createIconElement(senderType) {

    const element = document.createElement('div');

    element.className = 'message__icon';

    // アイコンの具体的な表示（背景画像、SVGなど）はCSSまたはappendMessage内のstyleで制御

    return element;

}



function createMessageContentElement(senderType, text) {

    const content = document.createElement('div');

    content.className = 'message__content';

    const bubble = document.createElement('div');

    bubble.className = 'message__bubble';



    // テキスト処理: 改行を<br>に、Markdownリンクを<a>に変換

    const processedText = text.replaceAll('\n', '<br>');

    const linkRegex = /\[([^\]]+)]\((https?:\/\/[^\s)]+)\)/g;



    // エラーメッセージ以外でリンクパターンがあれば変換

    if (senderType !== 'error' && linkRegex.test(processedText)) {

         bubble.innerHTML = processedText.replace(linkRegex, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

    } else {

         // innerHTML を使って <br> を解釈させる

         bubble.innerHTML = processedText;

    }



    content.appendChild(bubble);



    // エラーメッセージ以外にタイムスタンプを追加

    if (senderType !== 'error') {

        const timestamp = document.createElement('div');

        timestamp.className = 'message__timestamp';

        timestamp.textContent = getCurrentTime();

        content.appendChild(timestamp);

    }

    return content;

}





function showTypingIndicator() {

    if (typingIndicatorId || !chatHistory) return; // 既に表示中か、履歴要素がなければ何もしない



    const messageId = `typing-${Date.now()}`;

    typingIndicatorId = messageId; // IDを保存



    const fragment = document.createDocumentFragment();

    // 'ai' タイプとしてインジケーターを表示

    const messageRow = createMessageRowElement('ai', messageId);

    const icon = createIconElement('ai');



    // AIアイコンを設定 (URLがあれば)

    if (characterIconUrl) {

        icon.style.backgroundImage = `url('${characterIconUrl}')`;

        icon.style.backgroundColor = 'transparent';

    } else {

        icon.style.backgroundImage = ''; // CSSのデフォルトに任せる

        icon.style.backgroundColor = '';

    }



    // タイピングアニメーションを含むコンテンツを作成

    const content = document.createElement('div'); content.className = 'message__content';

    const bubble = document.createElement('div'); bubble.className = 'message__bubble';

    const indicator = document.createElement('div'); indicator.className = 'typing-indicator';

    indicator.innerHTML = `<span class="typing-indicator__dot"></span><span class="typing-indicator__dot"></span><span class="typing-indicator__dot"></span>`;

    bubble.appendChild(indicator); content.appendChild(bubble);



    // 要素を組み立てて追加

    messageRow.appendChild(icon); messageRow.appendChild(content);

    fragment.appendChild(messageRow); chatHistory.appendChild(fragment);



    // 表示されたインジケーターが見えるようにスクロール

    scrollToBottom(chatHistory, 'smooth');

}



function removeTypingIndicator() {

    if (typingIndicatorId && chatHistory) {

        const indicatorElement = chatHistory.querySelector(`[data-message-id="${typingIndicatorId}"]`);

        if (indicatorElement) { indicatorElement.remove(); }

        typingIndicatorId = null; // IDをクリア

    }

}



function appendChatError(message) {

    console.log("Appending chat error:", message); // エラー内容をログ出力

    if (chatHistory) {

        removeTypingIndicator(); // タイピング中なら消す

        // 'error' タイプでメッセージを追加

        appendMessage('error', message, true); // スクロールして表示

    } else {

        // チャット履歴要素がない場合のフォールバック

        console.error("Chat history element not found, cannot append error:", message);

        if(profileError) { // プロファイルのエラー表示領域を使う

            profileError.textContent = `チャットエラー: ${message}`;

            profileError.style.display = 'block';

        }

    }

}





function clearChatError() {

    if(chatHistory) {

        const errorMessages = chatHistory.querySelectorAll('.message--error');

        errorMessages.forEach(el => el.remove()); // エラーメッセージ要素を削除

    }

}



// --- ★★★ 残り回数更新関数 ★★★ ---

function updateTurnCounter(currentCount, maxCount) {

    if (!turnCounterElement) {

        console.warn("Turn counter element not found.");

        return;

    }

    // maxCount が 0 または未定義の場合はカウンターを表示しない

    if (maxCount <= 0) {

        turnCounterElement.textContent = '';

        turnCounterElement.classList.remove('limit-reached'); // スタイルもリセット

        return;

    }



    // 残り送信可能回数（ユーザーが次に送信できる回数）で表示

    const remainingMessages = Math.max(0, maxCount - currentCount);

    turnCounterElement.textContent = `残チャット ${remainingMessages} 回`;



    // 上限に達したらスタイルを変更

    if (remainingMessages <= 0) {

        turnCounterElement.classList.add('limit-reached');

    } else {

        turnCounterElement.classList.remove('limit-reached');

    }

    // console.log(`Turn counter updated: Current=${currentCount}, Max=${maxCount}, RemainingMsg=${remainingMessages}`); // Debug

}





// --- Utility Functions ---

function getCurrentTime() {

    return new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false });

}



function getUniqueIdFromUrl() {

    try {

        const params = new URLSearchParams(window.location.search);

        const potentialId = params.get('char_id') || params.get('id');

        // console.log("Extracted Character ID:", potentialId); // Debug

        if (!potentialId) {

             console.error("URL parameter 'char_id' or 'id' not found.");

             return null;

        }

        return potentialId.trim() || null; // 空白除去して返す

    } catch (e) {

        console.error("Error extracting Character ID from URL:", e);

        return null;

    }

}



// スクロール関数：要素を一番下にスクロールする

function scrollToBottom(element, behavior = 'smooth') {

    if (element) {

        // scrollTop に scrollHeight を設定するのが最も単純で広く動作する

        element.scrollTop = element.scrollHeight;

        // behavior 引数は scrollIntoView や scrollTo で有効だが、

        // scrollTop への直接代入では無視される。アニメーションが必要な場合は別の方法を検討。

        // element.scrollTo({ top: element.scrollHeight, behavior: behavior });

    }

}





// --- ★★★ Visual Viewport Handling for Keyboard (追加) ★★★ ---

function setupVisualViewportListener() {

    // 必要な要素とAPIの存在チェック

    if (!window.visualViewport || !userInput || !chatContainer || !chatFooter || !chatHistory || !chatHeader) {

        console.warn('VisualViewport API or necessary elements not available for keyboard handling.');

        return;

    }



    // 初期スタイルを保存するための変数を関数スコープ内に移動

    // (DOMContentLoaded より後、リスナー設定時に取得)

    initialContainerHeightStyle = chatContainer.style.height || '';

    initialFooterBottomStyle = chatFooter.style.bottom || '';

    let isAdjusting = false; // 調整中の多重実行を防ぐフラグ



    const adjustLayoutForKeyboard = () => {

        // requestAnimationFrame を使って描画タイミングに合わせる（カクつき軽減）

        window.requestAnimationFrame(() => {

            if (isAdjusting) return; // 調整中なら何もしない

            isAdjusting = true;



            const vv = window.visualViewport;

            const windowHeight = window.innerHeight;

            // visualViewport の高さを使うのが基本

            const availableHeight = vv.height;



            console.log(`Adjusting Layout - WindowH: ${windowHeight}, VV H: ${availableHeight}, VV OffsetTop: ${vv.offsetTop}`); // Debug



            // コンテナの高さを visualViewport の高さに設定

            chatContainer.style.height = `${availableHeight}px`;



            // フッターの位置を調整

            // キーボードが表示されている領域を避けるように bottom を設定

            // windowHeight - availableHeight がキーボードが表示されている高さに近い

            const footerBottomOffset = windowHeight - availableHeight;

            chatFooter.style.bottom = `${footerBottomOffset}px`;



            // フッターの位置調整後にスクロール（フッターが動いた後にスクロール）

             setTimeout(() => scrollToBottom(chatHistory, 'auto'), 0);



            // フラグをリセット

             isAdjusting = false;

        });

    };



    const resetLayout = () => {

         window.requestAnimationFrame(() => {

            if (isAdjusting) return;

            isAdjusting = true;



            console.log("Resetting Layout"); // Debug



            // スタイルを初期値（style属性に設定されていた値 or 空文字）に戻す

            chatContainer.style.height = initialContainerHeightStyle;

            chatFooter.style.bottom = initialFooterBottomStyle;



            isKeyboardOpen = false; // フラグをリセット



            isAdjusting = false;

        });

    };



    userInput.addEventListener('focus', () => {

        console.log("Input focused.");

        isKeyboardOpen = true;

        // 初期スタイルを保存（フォーカス時に毎回保存し直す）

        initialContainerHeightStyle = chatContainer.style.height || '';

        initialFooterBottomStyle = chatFooter.style.bottom || '';

        // 調整実行（resizeイベントを待たずに試みる）

        adjustLayoutForKeyboard();

    });



    userInput.addEventListener('blur', () => {

        console.log("Input blurred.");

        // 即時リセットはせず、isKeyboardOpenフラグのみ更新

        isKeyboardOpen = false;

        // Androidでキーボード閉じずにblurする場合があるので、

        // ここでリセットすると問題が起きやすい。resizeイベントに任せる。

    });



    window.visualViewport.addEventListener('resize', () => {

        const vv = window.visualViewport;

        const windowHeight = window.innerHeight;

        // 画面下部に固定されているフッターの高さを取得 (safe-area含む)

        const footerComputedHeight = chatFooter.offsetHeight;

        // キーボードが出ているかの判断：visualViewportの高さがwindowの高さからフッターの高さを引いたものより小さいか

        // 少し余裕を持たせる

        const keyboardThreshold = windowHeight - footerComputedHeight - 50; // フッターの高さ＋αより小さくなったらキーボードが出たと判断



        console.log(`Viewport Resized - VV H: ${vv.height}, Threshold: ${keyboardThreshold}, isKeyboardOpen: ${isKeyboardOpen}`); // Debug



        // キーボードが開いた、またはサイズが変わった場合

        if (vv.height < keyboardThreshold && isKeyboardOpen) {

            console.log("Keyboard detected open/resized via resize.");

            adjustLayoutForKeyboard();

        }

        // キーボードが閉じた、または小さくなった場合

        else if (vv.height >= keyboardThreshold && !isKeyboardOpen) { // blurで isKeyboardOpen が false になっていることを利用

             // レイアウトが変更されたままならリセット

            if (chatContainer.style.height !== initialContainerHeightStyle || chatFooter.style.bottom !== initialFooterBottomStyle) {

                console.log("Keyboard detected closed via resize, resetting layout.");

                resetLayout();

            }

        }

    });

}



// Optional: Function to adjust textarea height dynamically

// function adjustTextareaHeight() {

//   if (!userInput) return;

//   userInput.style.height = 'auto'; // Reset height

//   const maxHeight = parseInt(window.getComputedStyle(userInput).maxHeight, 10) || 100;

//   const newHeight = Math.min(userInput.scrollHeight, maxHeight);

//   userInput.style.height = newHeight + 'px';

// }
