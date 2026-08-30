# Quickstart

## 1. Create environment

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
```

## 2. Configure

```bash
cp .env.example .env
```

Keep `WECHAT_MOCK=true` for a no-credential demo.

## 3. Start

```bash
uvicorn app.main:app --reload
```

Open `http://127.0.0.1:8000`.

## 4. Demo path

1. Open “新建投稿”.
2. Import `examples/demo.md` or paste Markdown.
3. Upload any image as the cover.
4. Click “发布检查”.
5. Click “Dry-run” and inspect task logs.
6. Return to the article and click “提交草稿箱”. In mock mode a synthetic `media_id` is returned.

## 5. Live mode

Set:

```env
WECHAT_MOCK=false
WECHAT_APP_ID=your_app_id
WECHAT_APP_SECRET=your_app_secret
```

Before using live mode, confirm the current WeChat Official Account API permissions and whitelist requirements for your account.
