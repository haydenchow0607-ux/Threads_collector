# 好文收藏庫 – Notion Web 前端

一個深色主題、響應式（手機 + 電腦）嘅 Web 前端，直接連接你嘅 Notion Database。

## 功能

- 文章列表（時間軸風格）
- 收藏日記（統計卡片、10 週熱力圖、每月長條圖、類型分佈）
- 搜尋（標題 / 作者 / 標籤）
- 按「收藏類型」篩選
- 側邊欄分類快速篩選
- 一鍵標記「待讀 / 精華」（如果你有對應 Checkbox 欄位）
- 開啟原文、複製連結、喺 Notion 開啟
- 完全離線可用（資料存在瀏覽器，Token 只存本地）

## 快速開始

### 1. 建立 Notion Integration

1. 打開 [https://www.notion.so/my-integrations](https://www.notion.so/my-integrations)
2. 點「+ New integration」
3. 名稱隨便（例如 `好文收藏庫`）
4. 複製 **Internal Integration Token**（以 `secret_` 開頭）

### 2. 分享 Database 俾 Integration

1. 打開你嘅 Notion Database（Threads 收藏清單）
2. 右上角點「⋯」→ **Connections** → **Connect to** → 選擇你剛建立嘅 Integration
3. 確認已連接

### 3. 取得 Database ID



（從 URL 提取 32 位英數字）

### 4. 開啟前端

**方法 A（最簡單）**
- 直接用瀏覽器打開 `index.html`
- 第一次會彈出設定視窗，貼上 Token 同 Database ID 即可

**方法 B（推薦，可放上網絡）**
- 將整個資料夾上傳去 [Netlify Drop](https://app.netlify.com/drop) 或 Vercel
- 或者用任何靜態託管

### 5. （可選）加入「待讀」同「精華」欄位

如果你想用一鍵標記功能：

1. 喺 Notion Database 新增兩個 **Checkbox** 欄位
2. 名稱分別叫：`待讀` 同 `精華`
3. 重新載入前端即可使用

## 欄位對應

前端預設對應以下 Notion 欄位名稱：

| 前端用途     | Notion 欄位名稱 | 類型       |
|--------------|-----------------|------------|
| 標題         | 主題            | Title      |
| 連結         | 網址            | URL        |
| 分類         | 收藏類型        | Select     |
| 日期         | 加入日期        | Date       |
| 待讀         | 待讀            | Checkbox   |
| 精華         | 精華            | Checkbox   |

如果名稱唔同，可以改 `app.js` 入面嘅 `PROP` 物件。

## 注意事項

- Token 只存在你瀏覽器嘅 localStorage，唔會上傳到任何伺服器
- 因為係直接 call Notion API，建議只喺自己裝置使用
- Notion API 有 rate limit，大量資料時載入可能需時數秒
- 如果之後想加更多功能（例如直接喺前端新增文章），可以再告訴我

## 檔案結構

```
notion-frontend/
├── index.html    # 主頁面
├── app.js        # 全部邏輯
└── README.md     # 說明文件
```
