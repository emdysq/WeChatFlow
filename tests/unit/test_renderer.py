from app.services.renderer import WeChatRenderer


def test_renderer_outputs_inline_styles_and_escapes_script():
    html = WeChatRenderer().render("# 标题\n\n正文 <script>alert(1)</script>")
    assert "font-size:26px" in html
    assert "<script>" not in html
    assert "正文" in html
