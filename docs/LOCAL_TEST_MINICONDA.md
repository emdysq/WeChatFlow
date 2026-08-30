# WeChatFlow 本地测试（Miniconda）

## 1. 解压并进入项目目录

```powershell
cd D:\path\to\wechatflow
```

## 2. 创建 Conda 环境

推荐：

```powershell
conda env create -f environment.yml
conda activate wechatflow
```

如果已有环境，也可以：

```powershell
conda create -n wechatflow python=3.11 -y
conda activate wechatflow
pip install -r requirements.txt
```

## 3. 创建配置文件

Windows PowerShell：

```powershell
Copy-Item .env.example .env
```

Windows CMD：

```cmd
copy .env.example .env
```

保持下面配置即可进行 Mock 测试：

```env
WECHAT_MOCK=true
```

Mock 模式不需要 AppID / AppSecret，也不会向微信公众号写入真实数据。

## 4. 先运行测试

```powershell
pytest -q
```

期望：

```text
9 passed
```

## 5. 启动 Web 服务

```powershell
uvicorn app.main:app --reload
```

打开：

- Web UI: http://127.0.0.1:8000
- Swagger API: http://127.0.0.1:8000/docs
- Health: http://127.0.0.1:8000/health

Health 正常时应返回类似：

```json
{"status":"ok","app":"WeChatFlow","mode":"mock"}
```

## 6. 推荐测试顺序

1. 打开首页确认 Dashboard 正常。
2. 新建投稿，输入标题、作者、摘要和 Markdown 正文。
3. 上传一张封面图片。
4. 点击预览，确认 Markdown 已转成公众号风格 HTML。
5. 执行发布前检查（Preflight）。
6. 执行 Dry-run，确认任务成功且没有调用真实微信写接口。
7. 执行 Mock 草稿创建，进入任务详情页检查状态流转与日志。
8. 打开 `/docs` 测试 REST API。

## 7. 可选：生成演示数据

```powershell
python scripts/seed_demo.py
```

## 8. 常见问题

### `conda` 不是内部或外部命令

请从 Miniconda Prompt 启动，或先执行 `conda init powershell` 后重新打开终端。

### `ModuleNotFoundError`

确认：

```powershell
conda activate wechatflow
python --version
python -m pip -V
```

然后：

```powershell
python -m pip install -r requirements.txt
```

### 端口 8000 被占用

```powershell
uvicorn app.main:app --reload --port 8001
```

### 数据库异常

Mock 测试阶段可以关闭服务后删除项目根目录的 `wechatflow.db`，再次启动会自动重新创建 SQLite 数据库。

### 图片上传目录问题

项目会使用 `uploads/`。请确保项目目录具有写权限，不要放在只读目录。

## 9. Live 微信测试

完成 Mock 测试后再切换 Live：

```env
WECHAT_MOCK=false
WECHAT_APP_ID=你的AppID
WECHAT_APP_SECRET=你的AppSecret
```

真实 AppSecret 只保存在本地 `.env`，不要发到聊天、截图或提交到 GitHub。

还需确认公众号账号接口权限以及调用机器公网 IP 已配置到微信接口白名单。
