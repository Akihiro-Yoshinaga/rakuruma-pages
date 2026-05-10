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
WORK_REPORT_SHEET = 'WorkReport'
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
COL_CAR         = 20  # car列（今回追加）


def extract_area(customer_name):
    """住所から区名を抽出（WorkReportには住所がないので空を返す）"""
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
        headers = rows[0]
        data = rows[1:]
        works = []

        for row in data:
            # 列数が足りない行はスキップ
            if len(row) <= COL_PHOTOS:
                continue

            photos = parse_photos(row[COL_PHOTOS] if len(row) > COL_PHOTOS else '')
            work_note = row[COL_WORK_NOTE] if len(row) > COL_WORK_NOTE else ''
            car = row[COL_CAR] if len(row) > COL_CAR else ''

            # 写真なし・作業内容なしはスキップ
            if not photos or not work_note.strip():
                continue

            # 日付を整形（yyyy/MM/dd HH:mm:ss → yyyy.MM.dd）
            date_raw = row[COL_DATE] if len(row) > COL_DATE else ''
            date_display = ''
            m = re.match(r'(\d{4})/(\d{2})/(\d{2})', date_raw)
            if m:
                date_display = f"{m.group(1)}.{m.group(2)}.{m.group(3)}"

            works.append({
                'id':       row[COL_REPORT_ID],
                'date':     date_display,
                'car':      car,
                'note':     work_note.strip(),
                'staff':    row[COL_STAFF] if len(row) > COL_STAFF else '',
                'photo':    photos[0],  # メイン写真は1枚目
                'url':      row[COL_VIEW_URL] if len(row) > COL_VIEW_URL else '',
            })

    # 新しい順にソート（最大100件）
    works.reverse()
    works = works[:100]

    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(works, f, ensure_ascii=False, indent=2)

    print(f'works.json を生成しました（{len(works)}件）')


if __name__ == '__main__':
    main()
