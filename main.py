# main.py (会話回数制限チェックを追加)
import functions_framework
import json
import os
from flask import Request, Response
from datetime import datetime, timezone
import traceback

# --- Google Sheets Setup ---
import gspread
SERVICE_ACCOUNT_FILE = 'aillm-456406-8011fdf900b3.json' # ★ユーザーが提供したキーファイル名
SHEET_NAME = 'AI_character_DB'
CHARACTERS_WORKSHEET_NAME = 'Character'
HISTORY_WORKSHEET_NAME = 'ChatHistory'
COL_CHAR_ID = 1
COL_NAME = 2
COL_SYSTEM_PROMPT = 3
COL_ICON_URL = 4
COL_PROFILE_TEXT = 5
COL_MEMORY_PROMPT = 6
COL_HIST_CHAR_ID = 1
COL_HIST_TIMESTAMP = 2
COL_HIST_ROLE = 3
COL_HIST_MESSAGE = 4
MAX_HISTORY_TURNS = 2 # テスト用 (通常: 50)
SUMMARIZE_INTERVAL = 2 # テスト用 (通常: 50)
# ↓↓↓ ★★★ 会話回数上限を設定 (テスト用に 3 に設定。本番では 100 など) ★★★ ↓↓↓
MAX_TOTAL_TURNS = 2

# --- グローバル変数 (初期化処理) ---
gs_initialization_error = None
gemini_initialization_error = None
characters_sheet = None
history_sheet = None
gemini_model = None # グローバルモデル（システム指示なしで初期化）

try:
    print("Initializing Google Sheets connection...")
    gc = gspread.service_account(filename=SERVICE_ACCOUNT_FILE)
    spreadsheet = gc.open(SHEET_NAME)
    characters_sheet = spreadsheet.worksheet(CHARACTERS_WORKSHEET_NAME)
    history_sheet = spreadsheet.worksheet(HISTORY_WORKSHEET_NAME)
    print(f"Google Sheets Initialized: {SHEET_NAME}/{CHARACTERS_WORKSHEET_NAME}, {HISTORY_WORKSHEET_NAME}")
except Exception as e:
    gs_initialization_error = f"FATAL: Failed to initialize Google Sheets: {e}"
    print(gs_initialization_error)

# --- Google AI (Gemini) Setup ---
if not gs_initialization_error:
    import google.generativeai as genai
    GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
    MODEL_NAME = "gemini-1.5-flash-latest"
    if not GEMINI_API_KEY:
        gemini_initialization_error = "FATAL: GEMINI_API_KEY env var not set."
        print(gemini_initialization_error)
    else:
        try:
            genai.configure(api_key=GEMINI_API_KEY)
            gemini_model = genai.GenerativeModel(MODEL_NAME)
            print(f"Google AI Initialized. Model: {MODEL_NAME}")
        except Exception as e:
            gemini_initialization_error = f"FATAL: Failed to initialize Google AI: {e}"
            print(gemini_initialization_error)

# --- CORS Setup ---
ALLOWED_ORIGINS = "https://ai-character-chat-frontend.vercel.app" # ユーザーが設定済み

# --- Main Cloud Function ---
@functions_framework.http
def handle_chat(request: Request) -> Response:
    """Handles PROFILE (GET) and CHAT (POST) requests using Chat Session."""
    print(f"--- Received request: Method={request.method}, URL={request.url} ---")

    # (CORS Preflightは変更なし)
    if request.method == 'OPTIONS':
        headers = { 'Access-Control-Allow-Origin': ALLOWED_ORIGINS, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '3600'}
        return Response(status=204, headers=headers)

    cors_headers = {'Access-Control-Allow-Origin': ALLOWED_ORIGINS}

    # (初期化チェックは変更なし)
    if gs_initialization_error or gemini_initialization_error or not characters_sheet or not history_sheet or not gemini_model:
        print(f"Responding 503 due to Init Error...")
        return Response(status=503, response=json.dumps({'error': 'Service temporarily unavailable.'}), mimetype='application/json; charset=utf-8', headers=cors_headers)

    # ============================
    # === Handle GET (Profile) ===
    # ============================
    if request.method == 'GET':
        # (変更なし)
        try:
            character_id = request.args.get('id')
            if not character_id: raise ValueError("Missing 'id' query parameter.")
            print(f"GET request for profile: CharacterID={character_id}")
            if not is_valid_id(character_id): raise ValueError(f"Character '{character_id}' not found.")
            cell = characters_sheet.find(character_id, in_column=COL_CHAR_ID)
            character_row = characters_sheet.row_values(cell.row)
            profile_data = {
                'id': character_id,
                'name': get_cell_value(character_row, COL_NAME, "名前未設定"),
                'iconUrl': get_cell_value(character_row, COL_ICON_URL),
                'profileText': get_cell_value(character_row, COL_PROFILE_TEXT, "プロフィール未設定")
            }
            print(f"Profile data found for {character_id}")
            return Response(response=json.dumps(profile_data, ensure_ascii=False), status=200, mimetype='application/json; charset=utf-8', headers=cors_headers)
        except ValueError as e:
             print(f"Client Error (GET - Not Found or Bad Request): {e}")
             return Response(status=404, response=json.dumps({'error': str(e)}), mimetype='application/json; charset=utf-8', headers=cors_headers)
        except Exception as e:
            print(f"Error processing GET request: {e}"); traceback.print_exc()
            return Response(status=500, response=json.dumps({'error': 'Internal server error processing profile request.'}), mimetype='application/json; charset=utf-8', headers=cors_headers)

    # ===========================
    # === Handle POST (Chat) ===
    # ===========================
    elif request.method == 'POST':
        character_id = None
        try:
            request_json = request.get_json(silent=True)
            if not request_json: raise ValueError("Invalid JSON.")
            user_message = request_json.get('message')
            character_id = request_json.get('id')
            if not user_message: raise ValueError("Missing 'message'.")
            if not character_id: raise ValueError("Missing 'id' (character_id).")

            # --- Find Character (POST) ---
            print(f"POST request: Searching for CharacterID: {character_id}")
            cell = characters_sheet.find(character_id, in_column=COL_CHAR_ID)
            if not cell: raise PermissionError(f"Invalid 'id': Character '{character_id}' not found.")

            # --- ▼▼▼ 会話回数チェックを追加 ▼▼▼ ---
            current_message_count = get_turn_count(character_id)
            current_turn_number = current_message_count // 2 # 現在までの往復数 (user+aiで2メッセージ=1往復)
            print(f"Current turn number (before this request): {current_turn_number}")

            if current_turn_number >= MAX_TOTAL_TURNS:
                print(f"Conversation limit reached for {character_id}. Limit: {MAX_TOTAL_TURNS}")
                # 上限到達エラーを返す (HTTP 403 Forbidden を使う)
                error_payload = {
                    'error': f'Conversation limit of {MAX_TOTAL_TURNS} turns reached.',
                    'code': 'LIMIT_REACHED' # フロントエンドで識別するためのコード
                }
                return Response(
                    status=403, # Forbidden
                    response=json.dumps(error_payload),
                    mimetype='application/json; charset=utf-8',
                    headers=cors_headers
                )
            # --- ▲▲▲ 会話回数チェックここまで ▲▲▲ ---

            # --- Get Prompts & History (If limit not reached) ---
            character_row = characters_sheet.row_values(cell.row)
            system_prompt = get_cell_value(character_row, COL_SYSTEM_PROMPT, "あなたは親切なアシスタントです。")
            memory_prompt = get_cell_value(character_row, COL_MEMORY_PROMPT)
            print(f"Found character. SystemPrompt loaded. Memory loaded: {'Yes' if memory_prompt else 'No'}")
            final_system_instruction = system_prompt + (f"\n\n[会話相手に関する記憶]\n{memory_prompt}" if memory_prompt else "")

            history = load_conversation_history(character_id, limit=MAX_HISTORY_TURNS * 2)
            print(f"Loaded {len(history)} messages.")

            # --- Call Gemini API (POST) ---
            print(f"Generating chat content using Chat Session...")
            try:
                instructed_model = genai.GenerativeModel(MODEL_NAME, system_instruction=final_system_instruction)
                chat = instructed_model.start_chat(history=history)
                response = chat.send_message(user_message)

                if response.text: ai_response_text = response.text
                elif response.prompt_feedback: ai_response_text = f"応答ブロック ({response.prompt_feedback.block_reason})。"
                else: ai_response_text = "応答を生成できませんでした。"

            except Exception as api_e:
                 print(f"Error during Gemini Chat Session: {api_e}"); traceback.print_exc()
                 raise api_e # Outer try...except で処理

            # --- Save Turn & Trigger Summarization (POST) ---
            try:
                 save_conversation_turn(character_id, user_message, ai_response_text)
                 print("Conversation turn saved.")
                 new_turn_count_check = get_turn_count(character_id) // 2
                 print(f"New turn count for {character_id}: {new_turn_count_check}")
                 if new_turn_count_check > 0 and new_turn_count_check % SUMMARIZE_INTERVAL == 0:
                      print(f"--- Summarization Triggered (Turn {new_turn_count_check}) ---")
                      try:
                          print("Starting synchronous summarization...")
                          summary = generate_memory_summary(character_id, SUMMARIZE_INTERVAL * 2)
                          if summary: update_memory_prompt(character_id, summary)
                          else: print("Summarization did not produce result.")
                      except Exception as summary_e: print(f"Error sync summary: {summary_e}"); traceback.print_exc()
                      print(f"--- Summarization Process Finished ---")
            except Exception as e: print(f"Error saving/summarizing: {e}"); traceback.print_exc()

            # --- Send Chat Response (POST) ---
            response_data = {'reply': ai_response_text}
            return Response(response=json.dumps(response_data, ensure_ascii=False), status=200, mimetype='application/json; charset=utf-8', headers=cors_headers)

        # (エラーハンドリングは変更なし)
        except (ValueError, PermissionError) as e:
            print(f"Client Error or Not Found (POST): {e}")
            status_code = 404 if isinstance(e, PermissionError) else 400
            return Response(status=status_code, response=json.dumps({'error': str(e)}), mimetype='application/json; charset=utf-8', headers=cors_headers)
        except Exception as e:
            print(f"Error processing POST request: {e}"); traceback.print_exc()
            error_message = 'Failed to get response from AI or process request.'
            if "API key not valid" in str(e): error_message = "AI Service Error: Invalid API Key."
            return Response(status=500, response=json.dumps({'error': error_message}), mimetype='application/json; charset=utf-8', headers=cors_headers)

    else: # Other methods
        return Response(status=405, response='Method Not Allowed', headers=cors_headers)

# --- Helper Functions ---
# (変更なし - get_cell_value, is_valid_id, save_conversation_turn, load_conversation_history, get_turn_count, generate_memory_summary, update_memory_prompt)
def get_cell_value(row_values: list, col_index: int, default_value=None):
    try: value = row_values[col_index - 1]; return value if value else default_value
    except IndexError: return default_value
def is_valid_id(character_id: str) -> bool:
    if not characters_sheet or gs_initialization_error: return False
    try: cell = characters_sheet.find(character_id, in_column=COL_CHAR_ID); return cell is not None
    except Exception as e: print(f"Error ID validation: {e}"); return False
def save_conversation_turn(character_id: str, user_msg: str, ai_msg: str):
    if not history_sheet or gs_initialization_error: print("History sheet NA."); return
    try:
        timestamp = datetime.now(timezone.utc).isoformat()
        history_sheet.append_row([character_id, timestamp, 'user', user_msg], value_input_option='USER_ENTERED')
        history_sheet.append_row([character_id, timestamp, 'model', ai_msg], value_input_option='USER_ENTERED')
    except Exception as e: print(f"Error saving turn: {e}"); traceback.print_exc()
def load_conversation_history(character_id: str, limit: int = 100) -> list:
    """Loads the last N messages for a character, formatted for Gemini history, ensuring it ends with a model turn."""
    if not history_sheet or gs_initialization_error: return []
    try:
        print(f"Loading history for {character_id}, limit {limit} messages")
        # WARNING: Inefficient for large sheets! Consider optimization or DB migration later.
        all_records = history_sheet.get_all_records() # Assumes header row exists
        header_row = history_sheet.row_values(1)
        # 列名を取得 (IndexErrorを避けるため、存在チェック推奨だが簡略化)
        char_id_header = header_row[COL_HIST_CHAR_ID - 1]
        role_header = header_row[COL_HIST_ROLE - 1]
        message_header = header_row[COL_HIST_MESSAGE - 1]

        # キャラクターIDでフィルタリング
        character_history_raw = [row for row in all_records if row.get(char_id_header) == character_id]

        # タイムスタンプでのソートが望ましいが、append_rowの順序に依存する形で最新を取得
        recent_history_raw = character_history_raw[-limit:] # 最新limit件を取得

        # Gemini API の history フォーマットに変換
        formatted_history = []
        for row in recent_history_raw:
             role = row.get(role_header)
             text = row.get(message_header)
             # 'user' または 'model' のロールで、メッセージ内容があるものだけを追加
             if role in ['user', 'model'] and text is not None and text != '':
                # Ensure role is correctly mapped if needed, though 'model' should be fine.
                # Gemini API expects 'user' and 'model'.
                valid_role = 'model' if role.lower() == 'model' else 'user'
                formatted_history.append({
                    'role': valid_role,
                    'parts': [{'text': str(text)}]
                })

        # ★★★ 追加修正: 履歴の最後が 'user' なら削除 ★★★
        if formatted_history and formatted_history[-1]['role'] == 'user':
            print("History ends with 'user', removing the last element for chat session.")
            formatted_history.pop() # 最後の要素 (ユーザー発言) を削除

        print(f"Loaded and formatted {len(formatted_history)} messages for chat session.")
        return formatted_history

    except Exception as e:
        print(f"Error loading or formatting history: {e}"); traceback.print_exc()
        return [] # エラー時は空の履歴を返す
def get_turn_count(character_id: str) -> int:
     if not history_sheet or gs_initialization_error: return 0
     try:
        all_char_ids = history_sheet.col_values(COL_HIST_CHAR_ID) # Inefficient!
        header = history_sheet.cell(1, COL_HIST_CHAR_ID).value
        count = all_char_ids.count(character_id) if header != character_id else all_char_ids[1:].count(character_id)
        return count
     except Exception as e: print(f"Error counting turns: {e}"); return 0
def generate_memory_summary(character_id: str, history_limit: int) -> str | None:
     if not gemini_model or gemini_initialization_error: print("Gemini NA for summary."); return None
     try:
         history = load_conversation_history(character_id, limit=history_limit)
         if not history: print("No history for summary."); return None
         history_text = "\n".join([f"{t['role']}: {t['parts'][0]['text']}" for t in history])
         prompt = f"以下の会話履歴に基づいて、AIと対話するユーザーの特徴、好み、会話のトピックなどを3行程度の箇条書きで要約してください。相手のことを理解して話をしたいのでユーザーの特徴の身を抽出ください:\n\n[会話履歴]\n{history_text}\n\n[要約]"
         print("Calling Gemini for summarization...")
         response = gemini_model.generate_content(prompt)
         if response.text: summary = response.text.strip(); print(f"Summarization OK: {summary[:100]}..."); return summary
         else: print("Summarization response empty/blocked."); return None
     except Exception as e: print(f"Error during summary gen: {e}"); traceback.print_exc(); return None
def update_memory_prompt(character_id: str, summary_text: str):
     if not characters_sheet or gs_initialization_error: print("Characters sheet NA for memory update."); return
     try:
         print(f"Updating memory for {character_id}...")
         cell = characters_sheet.find(character_id, in_column=COL_CHAR_ID)
         if cell: characters_sheet.update_cell(cell.row, COL_MEMORY_PROMPT, summary_text); print(f"Memory updated in Sheet row {cell.row}.")
         else: print(f"Char ID {character_id} not found for memory update.")
     except Exception as e: print(f"Error updating memory: {e}"); traceback.print_exc()