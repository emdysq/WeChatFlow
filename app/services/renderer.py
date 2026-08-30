from urllib.parse import urlparse

import mistune
from bs4 import BeautifulSoup


class WeChatRenderer:
    """Render Markdown to conservative, inline-styled HTML suitable for WeChat drafts."""

    def __init__(self) -> None:
        self._markdown = mistune.create_markdown(
            escape=True,
            plugins=["strikethrough", "table", "task_lists", "url"],
        )

    def render(self, markdown_text: str) -> str:
        raw = self._markdown(markdown_text or "")
        soup = BeautifulSoup(raw, "html.parser")
        for tag in soup.find_all(["script", "style", "iframe", "object", "embed"]):
            tag.decompose()

        styles = {
            "h1": "font-size:26px;line-height:1.35;margin:28px 0 14px;font-weight:700;color:#172033;",
            "h2": "font-size:22px;line-height:1.4;margin:26px 0 12px;font-weight:700;color:#172033;border-left:4px solid #16a085;padding-left:10px;",
            "h3": "font-size:19px;line-height:1.45;margin:22px 0 10px;font-weight:700;color:#27364b;",
            "p": "font-size:16px;line-height:1.85;margin:12px 0;color:#2d3748;letter-spacing:.2px;",
            "blockquote": "margin:16px 0;padding:12px 16px;background:#f4f8f7;border-left:4px solid #7cc7b6;color:#4a5568;",
            "pre": "overflow-x:auto;background:#0f172a;color:#e2e8f0;padding:14px;border-radius:8px;line-height:1.6;",
            "code": "font-family:Menlo,Consolas,monospace;font-size:14px;",
            "img": "max-width:100%;height:auto;display:block;margin:16px auto;border-radius:8px;",
            "ul": "padding-left:24px;margin:12px 0;color:#2d3748;line-height:1.8;",
            "ol": "padding-left:24px;margin:12px 0;color:#2d3748;line-height:1.8;",
            "li": "margin:5px 0;",
            "table": "width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;",
            "th": "border:1px solid #dfe6e9;padding:8px;background:#f7fafc;text-align:left;",
            "td": "border:1px solid #dfe6e9;padding:8px;",
            "hr": "border:none;border-top:1px solid #e2e8f0;margin:24px 0;",
            "a": "color:#1677ff;text-decoration:none;",
        }
        for name, style in styles.items():
            for tag in soup.find_all(name):
                tag["style"] = style

        for a in soup.find_all("a"):
            href = a.get("href", "")
            parsed = urlparse(href)
            if parsed.scheme not in {"http", "https", "mailto", ""}:
                del a["href"]

        for img in soup.find_all("img"):
            img.attrs = {k: v for k, v in img.attrs.items() if k in {"src", "alt", "title", "style"}}

        return str(soup)
