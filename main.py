# main.py (SyntaxError修正 + Firestore連携 + 会話上限チェック)
import functions_framework
import json
import os
from flask import Request, Response
from datetime import datetime, timezone
import traceback # エラー出力用にインポート

# --- Firestore Setup ---
from google.cloud import firestore
from google.cloud.firestore import Increment # Turn Count 更新用

firestore_init_error = None
db = None # Firestoreクライアントオブジェクト

try:
    print("Initializing Firestore client...")
    db = firestore.Client()
    print("Firestore client initialized successfully.")
except Exception as e:
    firestore_init_error = f"FATAL: Failed to initialize Firestore client: {e}"
    print(firestore_init_error); traceback.print_exc()

# --- Google AI (Gemini) Setup ---
# (Geminiの初期化はFirestore初期化が成功した場合のみ行う)
import google.generativeai as genai
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
MODEL_NAME = "gemini-1.5-flash-latest" # モデル名確認
gemini_model = None
gemini_initialization_error = None

if not firestore_init_error: # FirestoreがOKならGemini初期化
    if not GEMINI_API_KEY:
        gemini_initialization_error = "FATAL: GEMINI_API_KEY env var not set."
        print(gemini_initialization_error)
    else:
        try:
            print("Initializing Gemini...")
            genai.configure(api_key=GEMINI_API_KEY)
            gemini_model = genai.GenerativeModel(MODEL_NAME)
            print(f"Gemini Initialized. Model: {MODEL_NAME}")
        except Exception as e:
            gemini_initialization_error = f"FATAL: Failed to initialize Google AI: {e}"
            print(gemini_initialization_error); traceback.print_exc()
else:
    gemini_initialization_error = "Skipped due to Firestore init failure."
    print("Gemini initialization skipped.")


# --- 定数 ---
CHARACTERS_COLLECTION = 'characters' # Firestoreのコレクション名
HISTORY_SUBCOLLECTION = 'history'    # Firestoreのサブコレクション名
MAX_HISTORY_TURNS = 50 # ★本番用の会話履歴の参照数に戻す (必要なら調整)
SUMMARIZE_INTERVAL = 50 # ★本番用の要約間隔を戻す (必要なら調整)
MAX_TOTAL_TURNS = 100   # ★本番用の会話回数上限 (必要なら調整)
ALLOWED_ORIGINS = "https://ai-character-chat-frontend.vercel.app" # 設定済み

# Charactersコレクションのフィールド名 (コード内で直接文字列を使うので定数化は任意)
# FIELD_NAME = 'name'; FIELD_SYSPROMPT = 'systemPrompt'; FIELD_ICON = 'iconUrl'; FIELD_PROFILE = 'profileText'; FIELD_MEMORY = 'memoryPrompt'; FIELD_TURNCOUNT = 'turnCount'
# Historyサブコレクションのフィールド名
# FIELD_TS = 'timestamp'; FIELD_ROLE = 'role'; FIELD_MSG = 'message'


# --- Main Cloud Function ---
@functions_framework.http
def handle_chat(request: Request) -> Response:
    """Handles PROFILE (GET) and CHAT (POST) requests using Firestore."""
    print(f"--- Received request: Method={request.method}, URL={request.url} ---")

    # CORS Preflight
    if request.method == 'OPTIONS':
        headers = {
            'Access-Control-Allow-Origin': ALLOWED_ORIGINS,
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Max-Age': '3600'
        }
        return Response(status=204, headers=headers)

    cors_headers = {'Access-Control-Allow-Origin': ALLOWED_ORIGINS}

    # Initialization Check
    if firestore_init_error or gemini_initialization_error or not db or not gemini_model:
        print(f"Responding 503 due to Init Error: Firestore={firestore_init_error}, Gemini={gemini_initialization_error}")
        return Response(status=503, response=json.dumps({'error': 'Service temporarily unavailable.'}), mimetype='application/json; charset=utf-8', headers=cors_headers)

    # ============================
    # === Handle GET (Profile) ===
    # ============================
    if request.method == 'GET':
        try:
            character_id = request.args.get('id')
            if not character_id: raise ValueError("Missing 'id' query parameter.")
            print(f"GET profile: ID={character_id}")

            char_doc_ref = db.collection(CHARACTERS_COLLECTION).document(character_id)
            char_doc = char_doc_ref.get()

            if not char_doc.exists:
                raise ValueError(f"Character '{character_id}' not found.")

            char_data = char_doc.to_dict()
            profile_data = {
                'id': character_id,
                'name': char_data.get('name', "名前未設定"),
                'iconUrl': char_data.get('iconUrl'),
                'profileText': char_data.get('profileText', "プロフィール未設定")
            }
            print(f"Profile data found for {character_id}")
            return Response(response=json.dumps(profile_data, ensure_ascii=False), status=200, mimetype='application/json; charset=utf-8', headers=cors_headers)

        except ValueError as e: # ID無し or 見つからない
             print(f"GET Client Error/Not Found: {e}")
             return Response(status=404, response=json.dumps({'error': str(e)}), mimetype='application/json; charset=utf-8', headers=cors_headers)
        except Exception as e: # その他のエラー
            print(f"GET Error: {e}"); traceback.print_exc()
            return Response(status=500, response=json.dumps({'error': 'Internal error processing profile.'}), mimetype='application/json; charset=utf-8', headers=cors_headers)

    # ===========================
    # === Handle POST (Chat) ===
    # ===========================
    elif request.method == 'POST':
        character_id = None # finallyで使う可能性のため
        try:
            request_json = request.get_json(silent=True)
            if not request_json: raise ValueError("Invalid JSON.")
            user_message = request_json.get('message')
            character_id = request_json.get('id')
            if not user_message: raise ValueError("Missing 'message'.")
            if not character_id: raise ValueError("Missing 'id' (character_id).")

            # --- Get Character Doc Ref (and check existence) ---
            print(f"POST chat: Getting Character Ref: {character_id}")
            char_doc_ref = db.collection(CHARACTERS_COLLECTION).document(character_id)
            char_doc = char_doc_ref.get()
            if not char_doc.exists:
                raise PermissionError(f"Invalid 'id': Character '{character_id}' not found.")

            char_data = char_doc.to_dict()

            # --- Conversation Limit Check ---
            current_turn_count = char_data.get('turnCount', 0) # メッセージ総数
            current_turn_number = current_turn_count // 2 # 往復数
            print(f"Current turn number: {current_turn_number} (Total messages: {current_turn_count})")

            if current_turn_number >= MAX_TOTAL_TURNS:
                print(f"Limit reached for {character_id}. Limit: {MAX_TOTAL_TURNS} turns.")
                error_payload = {'error': f'Conversation limit of {MAX_TOTAL_TURNS} turns reached.', 'code': 'LIMIT_REACHED'}
                print(f"DEBUG: Returning 403 with payload: {json.dumps(error_payload)}")
                return Response(status=403, response=json.dumps(error_payload), mimetype='application/json; charset=utf-8', headers=cors_headers)

            # --- Get Prompts & History ---
            system_prompt = char_data.get('systemPrompt', "あなたは親切なアシスタントです。")
            memory_prompt = char_data.get('memoryPrompt')
            print(f"Memory loaded: {'Yes' if memory_prompt else 'No'}")
            final_system_instruction = system_prompt + (f"\n\n[会話相手に関する記憶]\n{memory_prompt}" if memory_prompt else "")

            history = load_conversation_history(character_id, limit=MAX_HISTORY_TURNS * 2)
            print(f"Loaded {len(history)} messages for history.")

            # --- Call Gemini API ---
            print(f"Generating chat content...")
            ai_response_text = "エラーにより応答を生成できませんでした。" # Default in case of API error
            try:
                # Per-request model init (inefficient but allows dynamic instruction)
                instructed_model = genai.GenerativeModel(MODEL_NAME, system_instruction=final_system_instruction)
                chat = instructed_model.start_chat(history=history)
                response = chat.send_message(user_message)

                if response.text: ai_response_text = response.text
                elif response.prompt_feedback: ai_response_text = f"応答ブロック ({response.prompt_feedback.block_reason})。"
                # else: keep default error message

            except Exception as api_e:
                 print(f"Error during Gemini Chat Session: {api_e}"); traceback.print_exc()
                 # Keep default error message or re-raise to be caught below
                 raise api_e # Let outer exception handler return 500

            # --- Save Turn & Trigger Summarization ---
            # Run this even if AI failed, to record the user message? Maybe not. Let's keep it after successful AI call.
            new_total_message_count = current_turn_count # Initialize
            try:
                 new_total_message_count = save_conversation_turn(char_doc_ref, user_message, ai_response_text)
                 print(f"Turn saved. New total message count: {new_total_message_count}")

                 new_turn_number = new_total_message_count // 2
                 print(f"New turn number: {new_turn_number}")
                 if new_turn_number > 0 and new_turn_number % SUMMARIZE_INTERVAL == 0:
                      print(f"--- Summarization Triggered (Turn {new_turn_number}) ---")
                      try:
                          print("Starting sync summary...");
                          # Pass doc ref for potential efficiency later if summary needs char data
                          summary = generate_memory_summary(char_doc_ref, SUMMARIZE_INTERVAL * 2)
                          if summary: update_memory_prompt(char_doc_ref, summary)
                          else: print("Summarization gave no result.")
                      except Exception as summary_e: print(f"Error sync summary: {summary_e}"); traceback.print_exc()
                      print(f"--- Summarization Finished ---")
            except Exception as e: print(f"Error saving/summarizing: {e}"); traceback.print_exc()

            # --- Send Chat Response ---
            response_data = {'reply': ai_response_text}
            return Response(response=json.dumps(response_data, ensure_ascii=False), status=200, mimetype='application/json; charset=utf-8', headers=cors_headers)

        # --- POST Error Handling ---
        except (ValueError, PermissionError) as e: # Bad request / ID not found
            print(f"POST Client Error/Not Found: {e}")
            status_code = 404 if isinstance(e, PermissionError) else 400
            return Response(status=status_code, response=json.dumps({'error': str(e)}), mimetype='application/json; charset=utf-8', headers=cors_headers)
        except Exception as e: # Includes potential API errors raised from inner try
            print(f"POST Processing Error: {e}"); traceback.print_exc()
            error_message = 'サーバー内部でエラーが発生しました。' # More generic message
            if "API key not valid" in str(e): error_message = "AIサービスでエラーが発生しました：APIキーが無効です。"
            # Consider checking for other specific Gemini/API errors here
            return Response(status=500, response=json.dumps({'error': error_message}), mimetype='application/json; charset=utf-8', headers=cors_headers)

    else: # Other methods
        return Response(status=405, response='Method Not Allowed', headers=cors_headers)

# --- Helper Functions ---

def get_cell_value(data_dict: dict, field_name: str, default_value=None):
    """Safely get value from dictionary by field name."""
    # Changed to work with Firestore dictionary
    value = data_dict.get(field_name)
    return value if value else default_value

def is_valid_id(character_id: str) -> bool:
    """Checks if the character ID exists in Firestore."""
    if not db or firestore_init_error: return False
    try:
        # print(f"Validating ID from Firestore: {character_id}") # Reduce log noise
        doc_ref = db.collection(CHARACTERS_COLLECTION).document(character_id)
        doc = doc_ref.get(retry=firestore.DEFAULT_RETRY) # Add retry for robustness
        return doc.exists
    except Exception as e: print(f"Error ID validation: {e}"); traceback.print_exc(); return False

def save_conversation_turn(char_doc_ref: firestore.DocumentReference, user_msg: str, ai_msg: str) -> int:
    """Saves messages to history subcollection and increments turn count."""
    if not db or firestore_init_error: print("Firestore NA for saving."); return 0
    try:
        history_ref = char_doc_ref.collection(HISTORY_SUBCOLLECTION)
        timestamp_now = firestore.SERVER_TIMESTAMP

        batch = db.batch()
        user_doc_ref = history_ref.document(); batch.set(user_doc_ref, {'timestamp': timestamp_now, 'role': 'user', 'message': user_msg})
        ai_doc_ref = history_ref.document(); batch.set(ai_doc_ref, {'timestamp': timestamp_now, 'role': 'model', 'message': ai_msg})
        # Increment total message count by 2
        batch.update(char_doc_ref, {'turnCount': firestore.Increment(2)})
        batch.commit()

        # Get updated count (might have slight delay vs actual incremented value)
        # It's often better to just return the estimated new count
        # updated_doc = char_doc_ref.get()
        # new_count = updated_doc.to_dict().get('turnCount', 0)
        # For simplicity, let's assume increment worked and estimate:
        # Need the count *before* incrementing for estimation, which we don't have here easily
        # Let's refetch for now, although inefficient:
        updated_doc = char_doc_ref.get(retry=firestore.DEFAULT_RETRY)
        new_count = updated_doc.to_dict().get('turnCount', 0)
        return new_count
    except Exception as e: print(f"Error saving turn: {e}"); traceback.print_exc(); return 0

def load_conversation_history(character_id: str, limit: int = 100) -> list:
    """Loads last N messages from Firestore, formatted for Gemini."""
    if not db or firestore_init_error: return []
    try:
        print(f"Loading history from Firestore for {character_id}, limit {limit}")
        history_ref = db.collection(CHARACTERS_COLLECTION).document(character_id).collection(HISTORY_SUBCOLLECTION)
        query = history_ref.order_by('timestamp', direction=firestore.Query.DESCENDING).limit(limit)
        docs = query.stream(retry=firestore.DEFAULT_RETRY) # Add retry
        raw_history = [doc.to_dict() for doc in docs]
        formatted_history = []
        # Reverse the list so oldest is first
        for entry in reversed(raw_history):
            role = entry.get('role')
            message = entry.get('message')
            if role in ['user', 'model'] and message is not None: # Check for None
                 formatted_history.append({'role': role, 'parts': [{'text': str(message)}]})
        # Ensure history ends with 'model' role for chat session start
        if formatted_history and formatted_history[-1]['role'] == 'user':
            print("Popping last user message from history for chat session.")
            formatted_history.pop()
        print(f"Loaded and formatted {len(formatted_history)} messages for session.")
        return formatted_history
    except Exception as e: print(f"Error loading history: {e}"); traceback.print_exc(); return []

# get_turn_count function is removed (count is read directly from character doc)

def generate_memory_summary(char_doc_ref: firestore.DocumentReference, history_limit: int) -> str | None:
     """Generates summary (uses Firestore history)."""
     character_id = char_doc_ref.id # Get ID from ref
     if not gemini_model or gemini_initialization_error: print("Gemini NA for summary."); return None
     try:
         history = load_conversation_history(character_id, limit=history_limit)
         if not history: print("No history for summary."); return None
         history_text = "\n".join([f"{t['role']}: {t['parts'][0]['text']}" for t in history])
         # TODO: Refine summarization prompt
         prompt = f"以下の会話履歴に基づいて、AIと対話するユーザーの特徴、好み、会話のトピックなどを3行程度の箇条書きで要約してください。相手のことを理解して話をしたいのでユーザーの特徴の身を抽出ください:\n\n[会話履歴]\n{history_text}\n\n[要約]"
         print("Calling Gemini for summarization...")
         response = gemini_model.generate_content(prompt)
         if response.text: summary = response.text.strip(); print(f"Summarization OK: {summary[:100]}..."); return summary
         else: print("Summarization response empty/blocked."); return None
     except Exception as e: print(f"Error during summary gen: {e}"); traceback.print_exc(); return None

def update_memory_prompt(char_doc_ref: firestore.DocumentReference, summary_text: str):
     """Updates the MemoryPrompt field in Firestore."""
     if not db or firestore_init_error: print("Firestore NA for memory update."); return
     try:
         print(f"Updating memory prompt for {char_doc_ref.id}...")
         char_doc_ref.update({'memoryPrompt': summary_text}, retry=firestore.DEFAULT_RETRY) # Add retry
         print(f"Memory prompt updated successfully in Firestore.")
     except Exception as e: print(f"Error updating memory: {e}"); traceback.print_exc()
