# main.py (Firestore連携 + 会話上限チェック + 履歴読み込み機能追加 + 残り回数表示対応)
# --- ★ Secret Manager クライアントをインポート ★ ---
from google.cloud import secretmanager
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
DATABASE_ID = 'characters' # データベースIDを定数化（任意）

try:
    print(f"Initializing Firestore client for database '{DATABASE_ID}'...")
    # database 引数に作成したデータベースのIDを指定する
    db = firestore.Client(database=DATABASE_ID)
    print(f"Firestore client initialized successfully for database '{DATABASE_ID}'.")
except Exception as e:
    # エラーメッセージにもデータベースIDを含めるとデバッグしやすい
    firestore_init_error = f"FATAL: Failed to initialize Firestore client for database '{DATABASE_ID}': {e}"
    print(firestore_init_error); traceback.print_exc()

## --- Google AI (Gemini) Setup ---
## (Geminiの初期化はFirestore初期化が成功した場合のみ行う)
#import google.generativeai as genai
#GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
#MODEL_NAME = "gemini-2.0-flash" # モデル名確認 (最新版推奨)
#gemini_model = None
#gemini_initialization_error = None
#
#if not firestore_init_error: # FirestoreがOKならGemini初期化
#    if not GEMINI_API_KEY:
#        gemini_initialization_error = "FATAL: GEMINI_API_KEY env var not set."
#        print(gemini_initialization_error)
#    else:
#        try:
#            print("Initializing Gemini...")
#            genai.configure(api_key=GEMINI_API_KEY)
#            gemini_model = genai.GenerativeModel(MODEL_NAME)
#            print(f"Gemini Initialized. Model: {MODEL_NAME}")
#        except Exception as e:
#            gemini_initialization_error = f"FATAL: Failed to initialize Google AI: {e}"
#            print(gemini_initialization_error); traceback.print_exc()
#else:
#    gemini_initialization_error = "Skipped due to Firestore init failure."
#    print("Gemini initialization skipped.")

# --- ▼▼▼ Google AI (Gemini) Setup (Secret Managerから読み込むように変更) ▼▼▼ ---
# GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY") # ← 環境変数からの取得を削除
MODEL_NAME = "gemini-2.0-flash"
PROJECT_ID = os.environ.get("GOOGLE_CLOUD_PROJECT", None) # ★★★ 環境変数名を修正 ★★★

gemini_model = None
gemini_initialization_error = None

if not firestore_init_error: # Firestore初期化が成功していることが前提
    if not PROJECT_ID:
         gemini_initialization_error = "FATAL: GCP_PROJECT env var not found for Secret Manager."
         print(gemini_initialization_error)
    else:
        try:
            print("Initializing Secret Manager client for Gemini Key...")
            sm_client = secretmanager.SecretManagerServiceClient()
            # ★ Secret Manager で作成したシークレット名を指定 (バージョンは latest が一般的)
            secret_name = f"projects/{PROJECT_ID}/secrets/gemini-api-key/versions/latest"
            print(f"Accessing secret: {secret_name}")
            response = sm_client.access_secret_version(request={"name": secret_name})
            GEMINI_API_KEY_SM = response.payload.data.decode("UTF-8") # ★ キーを取得・デコード
            print("Gemini API Key successfully retrieved from Secret Manager.")

            if not GEMINI_API_KEY_SM:
                 gemini_initialization_error = "FATAL: Got empty API Key from Secret Manager."
                 print(gemini_initialization_error)
            else:
                try:
                    print("Initializing Gemini with key from Secret Manager...")
                    genai.configure(api_key=GEMINI_API_KEY_SM) # ★ 取得したキーで設定
                    gemini_model = genai.GenerativeModel(MODEL_NAME)
                    print(f"Gemini Initialized. Model: {MODEL_NAME}")
                except Exception as e:
                    gemini_initialization_error = f"FATAL: Failed to init Gemini w/ SM Key: {e}"
                    print(gemini_initialization_error); traceback.print_exc()

        except Exception as e: # Secret Manager アクセスエラーなど
            gemini_initialization_error = f"FATAL: Failed to access Secret Manager: {e}"
            print(gemini_initialization_error); traceback.print_exc()
else:
    gemini_initialization_error = "Skipped due to Firestore init failure."
    print("Gemini initialization skipped.")
# --- ▲▲▲ Google AI (Gemini) Setup ここまで変更 ▲▲▲ ---

# --- 定数 ---
CHARACTERS_COLLECTION = 'characters' # Firestoreのコレクション名
HISTORY_SUBCOLLECTION = 'history'    # Firestoreのサブコレクション名
MAX_HISTORY_TURNS = 50 # ★本番用の会話履歴の参照数に戻す (必要なら調整)
SUMMARIZE_INTERVAL = 3 # ★本番用の要約間隔を戻す (必要なら調整)
MAX_TOTAL_TURNS = 5    # ★本番用の会話回数上限 (必要なら調整)
ALLOWED_ORIGINS = "https://ai-character-chat-frontend.vercel.app" # 設定済み
# フロントエンドに返す履歴の最大件数 (多すぎるとレスポンスが大きくなる)
MAX_FRONTEND_HISTORY = 50

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

    # =======================================
    # === Handle GET (Profile & History) ===
    # =======================================
    if request.method == 'GET':
        try:
            character_id = request.args.get('id')
            if not character_id: raise ValueError("Missing 'id' query parameter.")
            print(f"GET profile & history: ID={character_id}")

            char_doc_ref = db.collection(CHARACTERS_COLLECTION).document(character_id)
            char_doc = char_doc_ref.get()

            if not char_doc.exists:
                raise ValueError(f"Character '{character_id}' not found.")

            char_data = char_doc.to_dict()

            # --- ★★★ 履歴データの取得処理 ★★★ ---
            history_data = load_history_for_frontend(character_id, limit=MAX_FRONTEND_HISTORY)
            print(f"Loaded {len(history_data)} messages for frontend history.")

            # --- ★★★ 会話回数と上限を取得 ★★★ ---
            current_turn_count = char_data.get('turnCount', 0)
            print(f"Current turn count for {character_id}: {current_turn_count}")

            profile_data = {
                'id': character_id,
                'name': char_data.get('name', "名前未設定"),
                'iconUrl': char_data.get('iconUrl'),
                'profileText': char_data.get('profileText', "プロフィール未設定"),
                'history': history_data,
                # ★★★ 残り回数計算用に回数と上限をレスポンスに追加 ★★★
                'currentTurnCount': current_turn_count,
                'maxTurns': MAX_TOTAL_TURNS * 2 # フロントエンドはメッセージ数(turnCount)で計算するため2倍
            }
            print(f"Profile and history data found for {character_id}")
            return Response(response=json.dumps(profile_data, ensure_ascii=False), status=200, mimetype='application/json; charset=utf-8', headers=cors_headers)

        except ValueError as e: # ID無し or 見つからない
             print(f"GET Client Error/Not Found: {e}")
             return Response(status=404, response=json.dumps({'error': str(e)}), mimetype='application/json; charset=utf-8', headers=cors_headers)
        except Exception as e: # その他のエラー
            print(f"GET Error: {e}"); traceback.print_exc()
            return Response(status=500, response=json.dumps({'error': 'Internal error processing profile and history.'}), mimetype='application/json; charset=utf-8', headers=cors_headers)

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
                # ★★★ 上限エラーレスポンスにも回数情報を含める ★★★
                error_payload = {
                    'error': f'Conversation limit of {MAX_TOTAL_TURNS} turns reached.',
                    'code': 'LIMIT_REACHED',
                    'currentTurnCount': current_turn_count,
                    'maxTurns': MAX_TOTAL_TURNS * 2
                }
                print(f"DEBUG: Returning 403 with payload: {json.dumps(error_payload)}")
                return Response(status=403, response=json.dumps(error_payload), mimetype='application/json; charset=utf-8', headers=cors_headers)

            # --- Get Prompts & History (for Gemini) ---
            system_prompt = char_data.get('systemPrompt', "あなたは親切なアシスタントです。")
            memory_prompt = char_data.get('memoryPrompt')
            print(f"Memory loaded: {'Yes' if memory_prompt else 'No'}")
            final_system_instruction = system_prompt + (f"\n\n[会話相手に関する記憶]\n{memory_prompt}" if memory_prompt else "")

            # Gemini APIに渡す用の履歴を読み込む
            history_for_gemini = load_conversation_history_for_gemini(character_id, limit=MAX_HISTORY_TURNS * 2)
            print(f"Loaded {len(history_for_gemini)} messages for Gemini history.")

            # --- Call Gemini API ---
            print(f"Generating chat content...")
            ai_response_text = "エラーにより応答を生成できませんでした。" # Default in case of API error
            try:
                # Per-request model init (inefficient but allows dynamic instruction)
                instructed_model = genai.GenerativeModel(MODEL_NAME, system_instruction=final_system_instruction)
                chat = instructed_model.start_chat(history=history_for_gemini)
                response = chat.send_message(user_message)

                if hasattr(response, 'text') and response.text:
                    ai_response_text = response.text
                elif hasattr(response, 'prompt_feedback') and response.prompt_feedback:
                    ai_response_text = f"応答ブロック ({response.prompt_feedback.block_reason})。"
                else:
                    # 予期せぬ応答形式の場合
                    print(f"Warning: Unexpected Gemini response structure: {response}")
                    ai_response_text = "AIからの予期せぬ応答がありました。"

            except Exception as api_e:
                 print(f"Error during Gemini Chat Session: {api_e}"); traceback.print_exc()
                 # Keep default error message or re-raise to be caught below
                 raise api_e # Let outer exception handler return 500

            # --- Save Turn & Trigger Summarization ---
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
            # ★★★ 応答データに更新後の回数と上限を追加 ★★★
            response_data = {
                'reply': ai_response_text,
                'currentTurnCount': new_total_message_count,
                'maxTurns': MAX_TOTAL_TURNS * 2
            }
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

def save_conversation_turn(char_doc_ref: firestore.DocumentReference, user_msg: str, ai_msg: str) -> int:
    """Saves messages to history subcollection and increments turn count."""
    if not db or firestore_init_error: print("Firestore NA for saving."); return 0
    try:
        history_ref = char_doc_ref.collection(HISTORY_SUBCOLLECTION)
        timestamp_now = firestore.SERVER_TIMESTAMP # サーバータイムスタンプを使用

        batch = db.batch()
        user_doc_ref = history_ref.document(); batch.set(user_doc_ref, {'timestamp': timestamp_now, 'role': 'user', 'message': user_msg})
        ai_doc_ref = history_ref.document(); batch.set(ai_doc_ref, {'timestamp': timestamp_now, 'role': 'model', 'message': ai_msg})
        # Increment total message count by 2
        batch.update(char_doc_ref, {'turnCount': firestore.Increment(2)})
        batch.commit()

        # 更新後のカウントを効率的に取得するのは難しい場合がある。
        # Increment(2) を行った直後に get しても、反映されていない可能性がある。
        # 確実性を求めるなら再度 get するが、パフォーマンスへの影響を考慮。
        # ここではエラーハンドリングを優先し、再度取得する。
        updated_doc = char_doc_ref.get()
        if updated_doc.exists:
            new_count = updated_doc.to_dict().get('turnCount', 0)
            return new_count
        else:
             print(f"Warning: Failed to refetch document after saving turn for {char_doc_ref.id}")
             # ここで元々のカウント+2を返すことも検討できるが、確実ではない
             # 取得失敗時は 0 を返すようにしておく
             return 0

    except Exception as e: print(f"Error saving turn: {e}"); traceback.print_exc(); return 0


# --- ★★★ 履歴読み込み関数 (変更なし) ★★★ ---

def load_conversation_history_for_gemini(character_id: str, limit: int = 100) -> list:
    """Loads last N messages from Firestore, formatted for Gemini API."""
    if not db or firestore_init_error: return []
    try:
        print(f"Loading history for Gemini from Firestore for {character_id}, limit {limit}")
        history_ref = db.collection(CHARACTERS_COLLECTION).document(character_id).collection(HISTORY_SUBCOLLECTION)
        # Gemini 用は最新の会話が必要なので DESCENDING
        query = history_ref.order_by('timestamp', direction=firestore.Query.DESCENDING).limit(limit)
        docs = query.stream()
        raw_history = [doc.to_dict() for doc in docs]
        formatted_history = []
        # Reverse the list so oldest is first for Gemini format
        for entry in reversed(raw_history):
            role = entry.get('role')
            message = entry.get('message')
            # タイムスタンプの存在もチェック（古いデータにない可能性）
            timestamp = entry.get('timestamp')
            if role in ['user', 'model'] and message is not None and timestamp is not None:
                formatted_history.append({'role': role, 'parts': [{'text': str(message)}]})
            else:
                print(f"Skipping history entry due to missing field: {entry}")

        # Ensure history ends with 'model' role for chat session start if needed by Gemini (often handled by library)
        # The genai library typically handles the turn order automatically. Let's remove the pop logic for now.
        # if formatted_history and formatted_history[-1]['role'] == 'user':
        #     print("Popping last user message from history for chat session.")
        #     formatted_history.pop()
        print(f"Loaded and formatted {len(formatted_history)} messages for Gemini session.")
        return formatted_history
    except Exception as e: print(f"Error loading history for Gemini: {e}"); traceback.print_exc(); return []

def load_history_for_frontend(character_id: str, limit: int = 50) -> list:
    """Loads last N messages from Firestore, formatted for frontend display (chronological)."""
    if not db or firestore_init_error: return []
    try:
        print(f"Loading history for frontend from Firestore for {character_id}, limit {limit}")
        history_ref = db.collection(CHARACTERS_COLLECTION).document(character_id).collection(HISTORY_SUBCOLLECTION)
        # フロントエンドは古い順に表示するので ASCENDING で取得し、最新N件に絞る (Firestoreクエリの組み合わせ)
        # Firestore は limit_to_last が直接ないので、一度 DESC で取得して Python で reverse するか、
        # ASC で取得して全件読み込み後にスライスするのが一般的。件数が多くなる場合は注意。
        # ここでは DESC で limit 件取得し、Python 側で reverse する方法を採用。
        query = history_ref.order_by('timestamp', direction=firestore.Query.DESCENDING).limit(limit)
        docs = query.stream()
        raw_history = []
        for doc in docs:
             entry = doc.to_dict()
             role = entry.get('role')
             message = entry.get('message')
             # タイムスタンプの存在もチェック
             timestamp = entry.get('timestamp') # デバッグや将来の拡張用に保持しても良い
             if role in ['user', 'model'] and message is not None and timestamp is not None:
                  # フロントエンドに必要な形式で格納
                  raw_history.append({'role': role, 'message': str(message)})
             else:
                 print(f"Skipping history entry for frontend due to missing field: {entry}")

        # DESC で取得したので、フロントエンド用に古い順 (chronological) に並び替える
        frontend_history = list(reversed(raw_history))
        print(f"Loaded and formatted {len(frontend_history)} messages for frontend display.")
        return frontend_history
    except Exception as e: print(f"Error loading history for frontend: {e}"); traceback.print_exc(); return []

# --- 履歴読み込み関数ここまで ---


# --- 要約関数 (変更なし) ---
def generate_memory_summary(char_doc_ref: firestore.DocumentReference, history_limit: int) -> str | None:
     """Generates summary (uses Firestore history)."""
     character_id = char_doc_ref.id # Get ID from ref
     if not gemini_model or gemini_initialization_error: print("Gemini NA for summary."); return None
     try:
         # 要約生成には Gemini 用の履歴データを使う
         history_for_gemini = load_conversation_history_for_gemini(character_id, limit=history_limit)
         if not history_for_gemini: print("No history for summary."); return None

         # Gemini 形式からテキスト形式へ変換
         history_text_parts = []
         for turn in history_for_gemini:
             role = turn.get('role')
             text = turn.get('parts', [{}])[0].get('text', '')
             if role and text:
                 history_text_parts.append(f"{role}: {text}")
         history_text = "\n".join(history_text_parts)

         if not history_text.strip():
             print("History text for summary is empty."); return None

         # TODO: Refine summarization prompt
         prompt = f"""｛プロンプト｝:
         あなたは「ユーザーの会話履歴を分析し、ユーザーの好みや性格、考え方を魅力的にまとめる専門家」です。
         以下の会話ログから、ユーザーの特徴を体系的に抽出し、
         今後のやり取りでユーザーが「自分のことをよく分かっている」と感じられるようなメモリーデータ（プロフィール情報）を作成してください。
         1. 目的:
         将来の会話でユーザーに合わせた返信ができるよう、
         ユーザーの好みや関心事、価値観、性格傾向などを把握すること。
         2. 重要項目:
         - 好きなもの（趣味、食べ物、ブランド、音楽、本など）
         - 嫌いなもの（苦手な話題、避けたいものなど）
         - よく使う表現や口癖、コミュニケーションスタイル
         - 性格や価値観（ポジティブ/ネガティブ、外交的/内向的、保守的/革新的 など）
         - ユーモアの傾向や笑いのツボ
         - 他に特徴的なエピソード（仕事・ライフスタイル・目標や夢・悩み など）
         3. 出力形式:
         以下のセクションに分けて、わかりやすくコンパクトにまとめてください。
         必要に応じて短いコメントなども加えてください。出力は以下のセクションに沿った結果のみ出力ください。
         - 【ユーザー名・基本情報】
         - 【性格・価値観】
         - 【興味・関心 / 好きなもの】
         - 【苦手・嫌いなもの】
         - 【ストーリー・エピソード】
         - 【メモ】
         4. 注意点:
         - あくまで会話履歴に基づいた情報をまとめてください。分からない情報まで推定するのは絶対にやめてください。分からない箇所は空欄で良いです。
         - 個人情報やプライバシーには十分に配慮してください。
         - ユーザーに親しみを感じられるようにまとめてください。
         [会話履歴]
         {history_text}
         [メモリー]
         """
         print("Calling Gemini for summarization...")
         response = gemini_model.generate_content(prompt)
         if hasattr(response, 'text') and response.text:
             summary = response.text.strip()
             print(f"Summarization OK: {summary[:100]}...")
             return summary
         else:
             print(f"Summarization response empty/blocked. Feedback: {getattr(response, 'prompt_feedback', 'N/A')}")
             return None
     except Exception as e: print(f"Error during summary gen: {e}"); traceback.print_exc(); return None

def update_memory_prompt(char_doc_ref: firestore.DocumentReference, summary_text: str):
      """Updates the MemoryPrompt field in Firestore."""
      if not db or firestore_init_error: print("Firestore NA for memory update."); return
      try:
          print(f"Updating memory prompt for {char_doc_ref.id}...")
          char_doc_ref.update({'memoryPrompt': summary_text})
          print(f"Memory prompt updated successfully in Firestore.")
      except Exception as e: print(f"Error updating memory: {e}"); traceback.print_exc()
