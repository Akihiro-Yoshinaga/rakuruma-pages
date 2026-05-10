"""
WorkReportシートからworks.jsonを生成するスクリプト。
GitHub Actionsから毎日1回実行される。

必要な環境変数（GitHub Secrets）:
  GOOGLE_SERVICE_ACCOUNT_JSON : サービスアカウントのJSONキー（文字列）
  SPREADSHEET_ID              : スプレッドシートID
"""

import os
import json
import re
from google.oauth2.service_account import Credentials
import gspread

SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly']
SPREADSHEET_ID = os.environ['SPREADSHEET_ID']
WORK_REPORT_SHEET = '作業報告記録'
OUTPUT_PATH = os.path.join(os.path.dirname(__file__), '..', 'works.json')

# WorkReportシートの列インデックス（0始まり）
COL_REPORT_ID   = 0
COL_DATE        = 1
COL_CUSTOMER    = 2
COL_PHONE       = 3
COL_BODY_SIZE   = 4
COL_INDOOR      = 5
COL_OPTIONS     = 6
COL_WORK_NOTE   = 7
COL_STAFF       = 8
COL_PHOTOS      = 9
COL_CONTRACT    = 10
COL_VIEW_URL    = 11
COL_SOURCE      = 12
# 13〜19: carCheck系
COL_CAR         = 20  # car列（追加済み）
COL_TASK        = 21  # taskName列（追加済み）
COL_PUBLISH     = 22  # 公開フラグ列（チェックボックスTRUE = 非公開、FALSE/空欄 = 公開）
COL_REVIEW      = 23  # 口コミテキスト列（手動入力）
COL_RATING      = 24  # 評価（星数）列（手動入力、例: 5）

# 洗車系メニューのキーワード（これを含む報告は除外）
WASH_KEYWORDS = ['洗車', 'コーティング', 'ガラスコーティング', 'クリーニング', '車内清掃', 'ポリッシュ']

# ------------------------------------------------------------
# メーカー判定マップ
# (正式メーカー名, [判定キーワードリスト]) の順。上から優先。
# ------------------------------------------------------------
MAKER_MAP = [
    # ===== 国産メーカー =====
    ("トヨタ",          ["トヨタ", "Toyota", "TOYOTA", "アルファード", "ヴェルファイア", "ベルファイア",
                         "プリウス", "カローラ", "クラウン", "ランクル", "ランドクルーザー",
                         "ハリアー", "RAV4", "C-HR", "ヤリス", "アクア", "シエンタ",
                         "ノア", "ヴォクシー", "エスクァイア", "ハイエース", "86", "GR86",
                         "スープラ", "GRヤリス", "センチュリー", "レクサス以外のトヨタ"]),
    ("レクサス",        ["レクサス", "Lexus", "LEXUS", "LS", "LC", "LX", "RX", "NX",
                         "UX", "IS", "ES", "GS", "RC", "GX"]),
    ("ホンダ",          ["ホンダ", "Honda", "HONDA", "フィット", "シビック", "アコード",
                         "CR-V", "ヴェゼル", "フリード", "ステップワゴン", "オデッセイ",
                         "N-BOX", "N-ONE", "N-WGN", "NSX", "S2000", "インテグラ",
                         "ジェイド", "シャトル", "グレイス"]),
    ("日産",            ["日産", "Nissan", "NISSAN", "ノート", "セレナ", "エクストレイル",
                         "キックス", "リーフ", "スカイライン", "GT-R", "フェアレディZ",
                         "シルビア", "マーチ", "ティアナ", "ムラーノ", "アリア",
                         "サクラ", "デイズ", "ルークス"]),
    ("マツダ",          ["マツダ", "Mazda", "MAZDA", "CX-5", "CX-8", "CX-3", "CX-30",
                         "CX-60", "CX-90", "アクセラ", "アテンザ", "デミオ",
                         "マツダ2", "マツダ3", "マツダ6", "ロードスター", "RX-7", "RX-8",
                         "MPV", "プレマシー", "ビアンテ"]),
    ("スバル",          ["スバル", "Subaru", "SUBARU", "インプレッサ", "レガシィ", "フォレスター",
                         "アウトバック", "XV", "レヴォーグ", "WRX", "BRZ", "エクシーガ",
                         "ステラ", "サンバー", "シフォン", "プレオ"]),
    ("三菱",            ["三菱", "ミツビシ", "Mitsubishi", "MITSUBISHI", "アウトランダー",
                         "エクリプスクロス", "デリカ", "パジェロ", "ランサー", "ギャラン",
                         "コルト", "eKワゴン", "eKスペース", "RVR", "i-MiEV"]),
    ("スズキ",          ["スズキ", "Suzuki", "SUZUKI", "アルト", "ワゴンR", "スペーシア",
                         "ハスラー", "ジムニー", "スイフト", "バレーノ", "クロスビー",
                         "エスクード", "ソリオ", "イグニス", "カプチーノ"]),
    ("ダイハツ",        ["ダイハツ", "Daihatsu", "DAIHATSU", "タント", "ムーヴ", "ミラ",
                         "コペン", "ロッキー", "ライズ", "トール", "ウェイク", "キャスト",
                         "アトレー", "ハイゼット", "テリオス"]),
    ("いすゞ",          ["いすゞ", "イスズ", "Isuzu", "ISUZU", "エルフ", "フォワード",
                         "ギガ", "ビッグホーン", "ミュー", "ロデオ"]),
    ("日野",            ["日野", "Hino", "HINO", "プロフィア", "レンジャー", "デュトロ"]),
    ("三菱ふそう",      ["ふそう", "FUSO", "キャンター", "ファイター", "スーパーグレート"]),
    ("マツダ・スクラム", ["スクラム"]),

    # ===== ドイツ車 =====
    ("メルセデス・ベンツ", ["メルセデス", "ベンツ", "Mercedes", "Benz", "MERCEDES",
                            "Cクラス", "Eクラス", "Sクラス", "Aクラス", "Bクラス",
                            "GLC", "GLE", "GLS", "GLA", "GLB", "CLA", "CLS",
                            "AMG", "Gクラス", "Gワゴン", "マイバッハ", "EQC", "EQS"]),
    ("BMW",              ["BMW", "ビーエム", "3シリーズ", "5シリーズ", "7シリーズ",
                          "1シリーズ", "2シリーズ", "4シリーズ", "6シリーズ", "8シリーズ",
                          "X1", "X2", "X3", "X4", "X5", "X6", "X7",
                          "M2", "M3", "M4", "M5", "M8", "iX", "i4", "i7"]),
    ("MINI",             ["MINI", "ミニ", "クーパー", "クロスオーバー", "クラブマン",
                          "ペースマン", "カントリーマン", "コンバーチブル"]),
    ("フォルクスワーゲン", ["フォルクスワーゲン", "VW", "Volkswagen", "VOLKSWAGEN",
                            "ゴルフ", "ポロ", "パサート", "ティグアン", "トゥアレグ",
                            "ID.4", "ID.3", "アルテオン", "シロッコ", "アップ"]),
    ("アウディ",         ["アウディ", "Audi", "AUDI", "A1", "A3", "A4", "A5", "A6",
                          "A7", "A8", "Q2", "Q3", "Q5", "Q7", "Q8",
                          "TT", "R8", "e-tron", "RS"]),
    ("ポルシェ",         ["ポルシェ", "Porsche", "PORSCHE", "911", "カイエン", "マカン",
                          "パナメーラ", "ボクスター", "ケイマン", "タイカン", "カレラ"]),
    ("オペル",           ["オペル", "Opel", "アストラ", "ヴィーヴァロ", "インシグニア"]),

    # ===== イギリス車 =====
    ("ランドローバー",   ["ランドローバー", "Land Rover", "LAND ROVER", "レンジローバー",
                          "ディスカバリー", "ディフェンダー", "フリーランダー", "イヴォーク"]),
    ("ジャガー",         ["ジャガー", "Jaguar", "JAGUAR", "XE", "XF", "XJ", "Fタイプ",
                          "Fペイス", "Eペイス", "Iペイス"]),
    ("ベントレー",       ["ベントレー", "Bentley", "BENTLEY", "コンチネンタル", "フライングスパー",
                          "ベンテイガ", "ミュルザンヌ"]),
    ("ロールスロイス",   ["ロールスロイス", "Rolls-Royce", "ゴースト", "ファントム",
                          "カリナン", "スペクター", "レイス", "ドーン"]),
    ("マクラーレン",     ["マクラーレン", "McLaren", "720S", "570S", "765LT", "GT",
                          "アルトゥーラ", "エルバ"]),
    ("アストンマーティン", ["アストンマーティン", "Aston Martin", "DB11", "DB12", "Vantage",
                            "DBS", "DBX"]),
    ("ロータス",         ["ロータス", "Lotus", "エリーゼ", "エヴォーラ", "エミーラ", "エキシージ"]),

    # ===== イタリア車 =====
    ("フェラーリ",       ["フェラーリ", "Ferrari", "FERRARI", "458", "488", "F8",
                          "296", "812", "SF90", "ローマ", "ポルトフィーノ", "プロサングエ"]),
    ("ランボルギーニ",   ["ランボルギーニ", "Lamborghini", "ウラカン", "アヴェンタドール",
                          "ウルス", "レヴエルト"]),
    ("マセラティ",       ["マセラティ", "Maserati", "MASERATI", "グラントゥーリズモ",
                          "ギブリ", "クアトロポルテ", "レヴァンテ", "グレカーレ", "MC20"]),
    ("アルファロメオ",   ["アルファロメオ", "アルファ・ロメオ", "Alfa Romeo", "ALFA ROMEO",
                          "ジュリア", "ステルヴィオ", "トナーレ", "ジュリエッタ",
                          "147", "156", "159", "ミト"]),
    ("フィアット",       ["フィアット", "Fiat", "FIAT", "500", "チンクエチェント",
                          "パンダ", "ティーポ", "プント", "ブラヴォ"]),
    ("ランチア",         ["ランチア", "Lancia", "デルタ", "ストラトス"]),
    ("パガーニ",         ["パガーニ", "Pagani", "ゾンダ", "ウアイラ"]),

    # ===== フランス車 =====
    ("プジョー",         ["プジョー", "Peugeot", "PEUGEOT", "208", "308", "508",
                          "2008", "3008", "5008", "RCZ"]),
    ("シトロエン",       ["シトロエン", "Citroën", "Citroen", "CITROEN", "C3", "C4", "C5",
                          "DS", "グランドC4"]),
    ("ルノー",           ["ルノー", "Renault", "RENAULT", "クリオ", "ルーテシア", "メガーヌ",
                          "カングー", "キャプチャー", "アルカナ", "コレオス", "トゥインゴ"]),
    ("DS",               ["DS3", "DS4", "DS5", "DS7", "DS9"]),
    ("ブガッティ",       ["ブガッティ", "Bugatti", "ヴェイロン", "シロン", "ディーヴォ"]),

    # ===== アメリカ車 =====
    ("テスラ",           ["テスラ", "Tesla", "TESLA", "モデルS", "モデル3", "モデルX",
                          "モデルY", "サイバートラック", "ロードスター"]),
    ("シボレー",         ["シボレー", "Chevrolet", "CHEVROLET", "コルベット", "カマロ",
                          "タホ", "サバーバン", "トレイルブレイザー", "コロラド"]),
    ("フォード",         ["フォード", "Ford", "FORD", "マスタング", "エクスプローラー",
                          "F-150", "レンジャー", "エッジ", "エスケープ", "ブロンコ",
                          "エベレスト", "マーベリック"]),
    ("ジープ",           ["ジープ", "Jeep", "JEEP", "ラングラー", "チェロキー",
                          "グランドチェロキー", "コンパス", "レネゲード", "グラディエーター"]),
    ("キャデラック",     ["キャデラック", "Cadillac", "CADILLAC", "エスカレード",
                          "CT4", "CT5", "XT4", "XT5", "XT6", "リリック"]),
    ("リンカーン",       ["リンカーン", "Lincoln", "ナビゲーター", "アビエイター",
                          "コルセア", "ノーチラス"]),
    ("クライスラー",     ["クライスラー", "Chrysler", "300C", "ミニバン"]),
    ("ダッジ",           ["ダッジ", "Dodge", "チャレンジャー", "チャージャー", "デュランゴ"]),
    ("GMC",              ["GMC", "ユーコン", "シエラ", "アカディア", "テレイン"]),
    ("ハマー",           ["ハマー", "Hummer", "HUMMER"]),

    # ===== 韓国車 =====
    ("ヒュンダイ",       ["ヒュンダイ", "現代", "Hyundai", "HYUNDAI", "アイオニック",
                          "ツーソン", "サンタフェ", "コナ", "넥쏘"]),
    ("キア",             ["キア", "KIA", "Kia", "ソレント", "スポーテージ", "EV6",
                          "カーニバル", "テルライド"]),

    # ===== スウェーデン車 =====
    ("ボルボ",           ["ボルボ", "Volvo", "VOLVO", "XC40", "XC60", "XC90",
                          "V40", "V60", "V90", "S60", "S90", "C40", "EX30", "EX90"]),

    # ===== スペイン車 =====
    ("セアト",           ["セアト", "SEAT", "レオン", "イビサ", "アロナ", "アテカ"]),
    ("クプラ",           ["クプラ", "CUPRA", "フォーメンター", "アテカ・クプラ"]),

    # ===== チェコ車 =====
    ("シュコダ",         ["シュコダ", "Škoda", "Skoda", "オクタヴィア", "スーパーブ", "コディアック"]),

    # ===== その他欧州 =====
    ("プジョー・シトロエン", ["PSA"]),
    ("ステランティス",   ["ステランティス", "Stellantis"]),
    ("スマート",         ["スマート", "Smart", "SMART", "フォーフォー", "フォーツー"]),
    ("マイバッハ",       ["マイバッハ", "Maybach"]),
    ("モルガン",         ["モルガン", "Morgan"]),
    ("ケータハム",       ["ケータハム", "Caterham", "セブン"]),
    ("TVR",              ["TVR"]),
    ("ノーブル",         ["ノーブル", "Noble"]),

    # ===== 中国車 =====
    ("BYD",              ["BYD", "シール", "アット3", "ドルフィン", "ハン"]),
    ("NIO",              ["NIO", "ニオ"]),
    ("ゼカー",           ["ゼカー", "Zeekr"]),
    ("リ・オート",       ["リ・オート", "Li Auto"]),
    ("シャオミ",         ["シャオミ", "Xiaomi", "SU7"]),
]


def detect_maker(car_str):
    """車種文字列からメーカー名を判定して返す"""
    if not car_str:
        return ''
    for maker, keywords in MAKER_MAP:
        for kw in keywords:
            if kw in car_str:
                return maker
    return ''


def parse_photos(photo_str):
    """カンマ区切りの写真URL文字列をリストに変換"""
    if not photo_str:
        return []
    urls = [u.strip() for u in photo_str.split(',') if u.strip()]
    return urls


def main():
    # サービスアカウント認証
    sa_json = os.environ['GOOGLE_SERVICE_ACCOUNT_JSON']
    sa_info = json.loads(sa_json)
    creds = Credentials.from_service_account_info(sa_info, scopes=SCOPES)
    gc = gspread.authorize(creds)

    ss = gc.open_by_key(SPREADSHEET_ID)
    sheet = ss.worksheet(WORK_REPORT_SHEET)
    rows = sheet.get_all_values()

    if len(rows) < 2:
        print('WorkReportシートにデータがありません')
        works = []
    else:
        data = rows[1:]
        works = []

        for row in data:
            if len(row) <= COL_PHOTOS:
                continue

            photos = parse_photos(row[COL_PHOTOS] if len(row) > COL_PHOTOS else '')
            work_note = row[COL_WORK_NOTE] if len(row) > COL_WORK_NOTE else ''
            car = row[COL_CAR] if len(row) > COL_CAR else ''
            task = row[COL_TASK] if len(row) > COL_TASK else ''

            # 写真なし・作業内容なしはスキップ
            if not photos or not work_note.strip():
                continue

            # 公開フラグがチェック済み（TRUE）の行はスキップ（非公開）
            publish = row[COL_PUBLISH].strip().upper() if len(row) > COL_PUBLISH else ''
            if publish == 'TRUE':
                continue

            # 洗車系メニューはスキップ（整備ページなので整備実績のみ表示）
            if any(kw in task for kw in WASH_KEYWORDS):
                continue

            # 日付を整形（yyyy/MM/dd HH:mm:ss → yyyy.MM.dd）
            date_raw = row[COL_DATE] if len(row) > COL_DATE else ''
            date_display = ''
            m = re.match(r'(\d{4})/(\d{2})/(\d{2})', date_raw)
            if m:
                date_display = f"{m.group(1)}.{m.group(2)}.{m.group(3)}"

            maker = detect_maker(car)

            review = row[COL_REVIEW].strip() if len(row) > COL_REVIEW else ''
            rating = row[COL_RATING].strip() if len(row) > COL_RATING else ''

            works.append({
                'id':     row[COL_REPORT_ID],
                'date':   date_display,
                'maker':  maker,
                'car':    car,
                'note':   work_note.strip(),
                'staff':  row[COL_STAFF] if len(row) > COL_STAFF else '',
                'photo':  photos[0],
                'url':    row[COL_VIEW_URL] if len(row) > COL_VIEW_URL else '',
                'review': review,
                'rating': rating,
            })

    # 新しい順にソート（最大100件）
    works.reverse()
    works = works[:100]

    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(works, f, ensure_ascii=False, indent=2)

    print(f'works.json を生成しました（{len(works)}件）')


if __name__ == '__main__':
    main()
