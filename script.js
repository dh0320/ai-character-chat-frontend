/* style.css (キーボード対応 V3) */

/* --- Google Font Import --- */
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&display=swap');

/* --- CSS Variables --- */
:root {
    /* Colors */
    --color-bg: #f8f9fa;
    --color-bg-end: #f1f3f5;
    --color-surface: #ffffff;
    --color-text-primary: #212529;
    --color-text-secondary: #42474d; /* 残り回数の通常色に使用 */
    --color-border: #dee2e6;
    --color-accent: #004080;
    --color-accent-hover: #003366;
    --color-accent-text: #ffffff; /* ヘッダーテキストのデフォルト色 */
    --color-ai-bubble-bg: #e9ecef;
    --color-error-bg: #f8d7da;
    --color-error-text: #721c24;
    --color-limit-reached: #dc3545; /* 上限到達時の色 (エラーに近い赤系) */
    --color-icon-placeholder: #ced4da;
    --link-color: #0056b3;

    /* Typography */
    --font-family-base: 'Noto Sans JP', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    --font-size-base: 1rem; /* 16px */
    --font-size-sm: 0.875rem; /* 14px */
    --font-size-xs: 0.75rem; /* 12px - 残り回数表示に使用 */
    --line-height-base: 1.65;
    --font-weight-normal: 400;
    --font-weight-medium: 500;
    --font-weight-bold: 700;

    /* Spacing */
    --spacing-xs: 0.25rem;
    --spacing-sm: 0.5rem;
    --spacing-md: 1rem;
    --spacing-lg: 1.5rem;
    --spacing-xl: 2rem;
    --spacing-xxl: 3rem;

    /* Borders */
    --border-radius-sm: 0.25rem;
    --border-radius-md: 0.5rem;
    --border-radius-lg: 1rem;
    --border-radius-pill: 50rem;
    --border-radius-circle: 50%;

    /* Shadows */
    --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.08);
    --shadow-md: 0 4px 10px rgba(0, 0, 0, 0.1);
    --shadow-lg: 0 8px 25px rgba(0, 0, 0, 0.12);

    /* Others */
    --header-height-desktop: 60px;
    --footer-height-desktop: 75px;
    --header-height-mobile: 55px;
    --footer-height-mobile: 65px;
    --message-max-width: 80%;
    --transition-duration: 0.2s;
    --message-animate-duration: 0.3s;
    --chat-container-max-width: 800px;

    /* ヘッダー/フッターの高さを取得 (デフォルトはデスクトップ用) */
    --effective-header-height: var(--header-height-desktop);
    --effective-footer-height: var(--footer-height-desktop);
}

/* スマホ用の変数上書き */
@media (max-width: 767px) {
    :root {
        --effective-header-height: var(--header-height-mobile);
        --effective-footer-height: var(--footer-height-mobile);
    }
}

/* --- Basic Reset & Body --- */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

html {
    font-size: var(--font-size-base);
    height: 100%;
    -webkit-text-size-adjust: 100%;
}

body {
    margin: 0;
    padding: 0;
    font-family: var(--font-family-base);
    background-image: linear-gradient(to bottom, var(--color-bg), var(--color-bg-end));
    background-attachment: fixed;
    color: var(--color-text-primary);
    line-height: var(--line-height-base);
    display: flex;
    justify-content: center;
    align-items: center;
    background-color: var(--color-bg-end);
    overscroll-behavior-y: contain;
    height: 100%;
    min-height: 100vh;
    min-height: -webkit-fill-available;
    overflow: hidden; /* Prevent body scroll */
}

.container {
    width: 100%;
    height: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 0;
    overflow: hidden;
}

/* --- View Control --- */
.hidden { display: none !important; }

/* --- Shared Section Styling --- */
.view-section {
    width: 100%;
    height: 100%;
    max-width: var(--chat-container-max-width);
    margin: 0 auto;
    background-color: var(--color-surface);
    border-radius: var(--border-radius-lg);
    box-shadow: var(--shadow-md);
    overflow: hidden;
    position: relative;
    display: flex;
    flex-direction: column;
}

/* --- Profile View Styling --- */
.profile { text-align: center; }
.profile__header {
    padding: var(--spacing-xl) var(--spacing-lg) var(--spacing-lg);
    flex-shrink: 0;
    text-align: center;
    width: 100%;
    background-color: var(--color-surface);
    z-index: 10;
}
.profile__icon {
    width: 150px; height: 150px; border-radius: var(--border-radius-circle);
    object-fit: cover; margin: 0 auto var(--spacing-lg) auto; border: 4px solid var(--color-surface);
    box-shadow: var(--shadow-md); background-color: var(--color-icon-placeholder);
}
.profile__name {
    font-size: 1.75rem; font-weight: var(--font-weight-bold); color: var(--color-text-primary);
    margin-bottom: var(--spacing-sm);
}
.profile__card {
    flex-grow: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; scroll-behavior: smooth;
    padding: var(--spacing-lg); padding-right: calc(var(--spacing-lg) + 6px);
    background-color: var(--color-surface); scroll-padding-top: 10px; scroll-padding-bottom: 10px;
    width: 100%; min-height: 0;
}
.profile__text {
    font-size: 0.95rem; line-height: 1.75; color: var(--color-text-secondary);
    white-space: pre-wrap; text-align: left;
}
.profile__footer {
    padding: var(--spacing-lg) var(--spacing-lg) var(--spacing-xl); border-top: 1px solid var(--color-border);
    flex-shrink: 0; text-align: center; width: 100%; background-color: var(--color-surface); z-index: 10;
}
.profile__button {
    display: inline-block; padding: var(--spacing-sm) var(--spacing-xl); font-size: 1.05rem;
    font-weight: var(--font-weight-medium); color: var(--color-accent-text); background-color: var(--color-accent);
    border: none; border-radius: var(--border-radius-pill); cursor: pointer;
    transition: background-color var(--transition-duration) ease, transform var(--transition-duration) ease;
}
.profile__button:hover { background-color: var(--color-accent-hover); transform: translateY(-1px); }
.profile__button:active { transform: translateY(0px) scale(0.98); }
.profile__button:disabled { background-color: var(--color-icon-placeholder); color: var(--color-text-secondary); cursor: not-allowed; transform: none; }
#profile-error.error-message {
    margin-top: var(--spacing-sm); max-width: calc(100% - 2 * var(--spacing-lg)); margin-left: auto;
    margin-right: auto; display: block;
}


/* --- Chat View Styling --- */
.chat { padding: 0; margin: 0; border-radius: inherit; }
.chat__container {
    width: 100%; height: 100%; background-color: var(--color-surface); border-radius: inherit;
    position: relative; display: flex; flex-direction: column; overflow: hidden;
    /* ★ JSで高さを変える場合、transitionを追加するとスムーズに見えることがある */
    /* transition: height 0.2s ease-out; */
}

/* Default (Desktop) Styles */
.chat__header {
    height: var(--effective-header-height); background: linear-gradient(to right, var(--color-accent), var(--color-accent-hover));
    color: var(--color-accent-text); display: flex; align-items: center; justify-content: space-between;
    padding: 0 var(--spacing-lg); flex-shrink: 0; box-shadow: var(--shadow-sm); z-index: 10;
    position: relative; width: 100%; gap: var(--spacing-md);
}
.chat__title {
    font-size: 1.1rem; font-weight: var(--font-weight-medium); white-space: nowrap;
    overflow: hidden; text-overflow: ellipsis; flex-grow: 1; min-width: 0;
}
.chat__turn-counter {
    font-size: var(--font-size-xs); color: rgba(255, 255, 255, 0.85); white-space: nowrap; flex-shrink: 0;
}
.chat__turn-counter.limit-reached { color: #ffcdd2; font-weight: var(--font-weight-medium); }

.chat__history {
    flex-grow: 1; padding: var(--spacing-md) var(--spacing-lg); overflow-y: auto; scroll-behavior: smooth;
    -webkit-overflow-scrolling: touch; min-height: 0; background-color: var(--color-surface);
    scroll-padding-bottom: var(--spacing-md); z-index: 1; position: relative; width: 100%;
}
.chat__footer {
    height: var(--effective-footer-height); background-color: #f1f3f5; border-top: 1px solid var(--color-border);
    padding: var(--spacing-sm) var(--spacing-md); flex-shrink: 0; display: flex; align-items: center;
    z-index: 5; position: relative; width: 100%;
}


/* --- Mobile Specific Layout (LINE style) --- */
@media (max-width: 767px) {
    body {
        min-height: 100vh;
        min-height: -webkit-fill-available;
        overflow: hidden;
    }
    .container {
        height: 100%;
        height: -webkit-fill-available;
        overflow: hidden;
    }
    .view-section {
        border-radius: 0; box-shadow: none; max-width: 100%; width: 100%;
        height: 100%; height: -webkit-fill-available; /* JSで上書きされる可能性あり */
        position: relative; overflow: hidden;
    }

    /* Profile view mobile adjustments */
    .profile__header {
        position: sticky; top: 0;
        padding-top: calc(var(--spacing-xl) + env(safe-area-inset-top));
        padding-left: max(var(--spacing-lg), env(safe-area-inset-left));
        padding-right: max(var(--spacing-lg), env(safe-area-inset-right));
        padding-bottom: var(--spacing-lg);
    }
    .profile__icon { width: 120px; height: 120px; margin-top: 0; }
    .profile__name { font-size: 1.5rem; }
    .profile__card {
        padding-left: max(var(--spacing-lg), env(safe-area-inset-left));
        padding-right: calc(max(var(--spacing-lg), env(safe-area-inset-right)) + 4px);
        scroll-padding-top: 5px; scroll-padding-bottom: 5px;
        padding-bottom: calc(var(--effective-footer-height) + env(safe-area-inset-bottom) + var(--spacing-lg));
        overflow-y: auto; height: auto;
    }
    .profile__footer {
        position: sticky; bottom: 0;
        padding-top: var(--spacing-md);
        padding-left: max(var(--spacing-lg), env(safe-area-inset-left));
        padding-right: max(var(--spacing-lg), env(safe-area-inset-right));
        padding-bottom: calc(var(--spacing-md) + env(safe-area-inset-bottom));
    }

    /* Chat view mobile adjustments */
    .chat__container {
        height: 100%; /* Fill view-section */
         /* ★ JSで高さを変更する場合、transition を追加 */
        transition: height 0.1s ease-out;
    }
    .chat__header {
        position: fixed; top: 0; left: 0; right: 0; z-index: 100;
        height: calc(var(--effective-header-height) + env(safe-area-inset-top));
        padding-top: env(safe-area-inset-top);
        padding-left: max(var(--spacing-md), env(safe-area-inset-left));
        padding-right: max(var(--spacing-md), env(safe-area-inset-right));
        padding-bottom: 0; gap: var(--spacing-sm);
    }
    .chat__title { font-size: 1rem; }

    .chat__history {
        padding-top: calc(var(--effective-header-height) + env(safe-area-inset-top) + var(--spacing-md));
        padding-bottom: calc(var(--effective-footer-height) + env(safe-area-inset-bottom) + var(--spacing-md));
        padding-left: max(var(--spacing-md), env(safe-area-inset-left));
        padding-right: max(var(--spacing-md), env(safe-area-inset-right));
        overflow-y: auto;
        /* ★ flex-grow で高さを確保し、height: auto に変更 */
        flex-grow: 1;
        height: auto;
        position: static; width: 100%;
    }
    .chat__footer {
        position: fixed; /* Fix footer */
        bottom: 0; /* ★ 初期位置 */
        left: 0; right: 0; z-index: 100;
        height: calc(var(--effective-footer-height) + env(safe-area-inset-bottom));
        padding-bottom: env(safe-area-inset-bottom);
        padding-left: max(var(--spacing-md), env(safe-area-inset-left));
        padding-right: max(var(--spacing-md), env(safe-area-inset-right));
        padding-top: var(--spacing-sm);
        /* ★ JSでのbottom変更をスムーズにするためのtransition */
        transition: bottom 0.2s ease-out;
    }

    /* Scrollbar width adjustments */
    .profile__card::-webkit-scrollbar { width: 4px; }
    .chat__history::-webkit-scrollbar { width: 6px; }
}

/* --- Shared Input/Button Styles --- */
.chat__input-form {
    display: flex; align-items: center; width: 100%; height: 100%; gap: var(--spacing-sm);
}
.chat__input {
    flex-grow: 1; padding: var(--spacing-sm) var(--spacing-lg); border: 1px solid var(--color-border);
    border-radius: var(--border-radius-pill); background-color: var(--color-surface); color: var(--color-text-primary);
    font-size: 1rem; outline: none; transition: border-color var(--transition-duration) ease, box-shadow var(--transition-duration) ease;
    -webkit-appearance: none; -moz-appearance: none; appearance: none; min-height: 38px; line-height: 1.4;
    align-self: stretch; resize: none; overflow-y: auto; max-height: 100px;
}
.chat__input:focus, .chat__input:focus-visible { border-color: var(--color-accent); box-shadow: 0 0 0 3px rgba(0, 64, 128, 0.2); }
.chat__input::placeholder { color: var(--color-text-secondary); }
.chat__send-button {
    background-color: var(--color-accent); color: var(--color-accent-text); border: none; border-radius: var(--border-radius-circle);
    width: 48px; height: 48px; flex-shrink: 0; cursor: pointer; display: flex; justify-content: center; align-items: center;
    transition: background-color var(--transition-duration) ease;
}
.chat__send-button:hover { background-color: var(--color-accent-hover); }
.chat__send-button:disabled { background-color: var(--color-icon-placeholder); cursor: not-allowed; }
.chat__send-button svg { width: 24px; height: 24px; fill: currentColor; }

/* --- Message Styling --- */
.message {
    display: flex; align-items: flex-start; margin-bottom: var(--spacing-lg); max-width: var(--message-max-width);
    opacity: 0; animation: fadeIn var(--message-animate-duration) ease forwards;
}
@keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
.message__icon {
    width: 40px; height: 40px; border-radius: var(--border-radius-circle); background-color: var(--color-icon-placeholder);
    background-size: cover; background-position: center; background-repeat: no-repeat; flex-shrink: 0; margin-top: 0; box-shadow: var(--shadow-sm);
}
.message--user .message__icon { background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%236c757d"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>'); background-color: transparent; }
.message--error .message__icon { background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23dc3545"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>'); background-color: transparent; }
.message__content { margin: 0 var(--spacing-md); display: flex; flex-direction: column; min-width: 0; }
.message__bubble {
    padding: var(--spacing-sm) var(--spacing-md); border-radius: var(--border-radius-lg); word-wrap: break-word;
    line-height: var(--line-height-base); box-shadow: var(--shadow-sm); position: relative; max-width: 100%;
    background-color: var(--color-ai-bubble-bg); color: var(--color-text-primary);
}
.message__bubble a { color: var(--link-color); text-decoration: underline; }
.message__bubble a:hover { text-decoration: none; }
.message__timestamp { font-size: var(--font-size-xs); color: var(--color-text-secondary); margin-top: var(--spacing-xs); padding: 0 var(--spacing-sm); }
.message--ai { margin-right: auto; }
.message--ai .message__bubble { border-bottom-left-radius: var(--border-radius-sm); }
.message--ai .message__timestamp { align-self: flex-start; }
.message--user { flex-direction: row-reverse; margin-left: auto; }
.message--user .message__content { align-items: flex-end; }
.message--user .message__bubble { background-color: var(--color-accent); color: var(--color-accent-text); border-bottom-right-radius: var(--border-radius-sm); }
.message--user .message__bubble a { color: inherit; text-decoration: underline; font-weight: var(--font-weight-medium); }
.message--user .message__timestamp { align-self: flex-end; }
.message--error .message__bubble { background-color: var(--color-error-bg); color: var(--color-error-text); border: 1px solid rgba(114, 28, 36, 0.3); font-weight: var(--font-weight-medium); border-bottom-left-radius: var(--border-radius-sm); }
.message--error .message__timestamp { display: none; }

/* Error message styling (shared) */
.error-message {
    color: var(--color-error-text); background-color: var(--color-error-bg); border: 1px solid rgba(114, 28, 36, 0.3);
    padding: var(--spacing-sm) var(--spacing-md); border-radius: var(--border-radius-md); font-size: var(--font-size-sm); font-weight: var(--font-weight-medium);
}

/* Typing Indicator */
.typing-indicator { display: flex; align-items: center; padding: 0.6rem 0.9rem; }
.typing-indicator__dot { height: 8px; width: 8px; background-color: var(--color-text-secondary); border-radius: 50%; display: inline-block; margin: 0 2px; animation: bounce 1.3s infinite ease-in-out both; }
.typing-indicator__dot:nth-child(1) { animation-delay: -0.32s; }
.typing-indicator__dot:nth-child(2) { animation-delay: -0.16s; }
.typing-indicator__dot:nth-child(3) { animation-delay: -0.0s; }
@keyframes bounce { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1.0); } }

/* Scrollbar Styling (Webkit) - Light Theme */
.chat__history::-webkit-scrollbar { width: 8px; }
.chat__history::-webkit-scrollbar-track { background: #f1f1f1; border-radius: 4px; }
.chat__history::-webkit-scrollbar-thumb { background: #cccccc; border-radius: 4px; }
.chat__history::-webkit-scrollbar-thumb:hover { background: #b0b0b0; }
.profile__card::-webkit-scrollbar { width: 6px; }
.profile__card::-webkit-scrollbar-track { background: #f1f1f1; border-radius: 3px; }
.profile__card::-webkit-scrollbar-thumb { background: #cccccc; border-radius: 3px; }
.profile__card::-webkit-scrollbar-thumb:hover { background: #b0b0b0; }

/* Mobile scrollbar styles are inside the @media query */
