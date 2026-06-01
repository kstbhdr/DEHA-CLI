# DEHA CLI

> Akıllı, çok modelli AI kodlama asistanı | Multi-model AI coding assistant

```
╔══════════════════════════════════════════╗
║  DEHA — Intelligent Coding Assistant     ║
║  v1.0.0  •  Tests: 83 ✅                 ║
╚══════════════════════════════════════════╝
```

## Features

| Feature | Description |
|---|---|
| **Multi-provider** | Claude, OpenAI, DeepSeek, Ollama, OpenRouter, xAI, Custom API |
| **Streaming** | Real-time token streaming for all providers |
| **Pipeline** | Plan → Code → Judge loop with token-efficient EDIT blocks |
| **Agent mode** | Tool calling: read/write/edit files, shell, Python, browser, vision |
| **Context compression** | Token-based auto-summarization, persistent session memory |
| **ESC abort** | Press ESC to cancel agent mid-response |
| **Multi-line paste** | Paste code blocks — type more, send only when ready |
| **Security filter** | Blocks destructive commands (rm -rf /, fork bomb, shutdown) |
| **MCP support** | Model Context Protocol servers (filesystem, git, fetch, github…) |
| **Browser** | Playwright-based web automation, screenshots, form interaction |
| **Vision** | Screenshot + Claude/GPT-4o UI analysis |
| **Smoke tests** | HTTP endpoint health checks with assertions |
| **Python runner** | Runs snippets or files, venv support, pip install |
| **Chat history** | Auto-saved as Markdown, searchable, viewable |

## Installation

```bash
git clone https://github.com/kstbhdr/DEHA-CLI.git
cd DEHA-CLI
npm install
npm run build
npm link        # makes 'deha' available globally
```

## Configuration

```bash
cp .env.example .env
# Edit .env and add your API keys
```

```env
# Default provider
DEHA_PROVIDER=claude

# API Keys
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
DEEPSEEK_API_KEY=...
OPENROUTER_API_KEY=sk-or-...
XAI_API_KEY=xai-...

# Pipeline roles (each can use a different model/provider)
PLANNER_PROVIDER=openrouter
PLANNER_MODEL=anthropic/claude-opus-4
CODER_PROVIDER=deepseek
CODER_MODEL=deepseek-v4-flash
JUDGE_PROVIDER=xai
JUDGE_MODEL=grok-3
```

## Usage

```bash
# Interactive mode
deha

# One-shot question
deha chat "How does async/await work in Python?"

# Plan → Code → Judge pipeline
deha build "Write an Express.js REST API with user CRUD"

# Judge existing code (independent review)
deha judge src/index.ts "Check for security vulnerabilities"

# Override pipeline roles via CLI flags
deha build "Add Redis cache" \
  --planner-provider openrouter --planner-model anthropic/claude-opus-4 \
  --coder-provider deepseek --coder-model deepseek-v4-flash \
  --judge-provider xai --judge-model grok-3

# Terminal
deha run "npm test"

# Python
deha python -c "import sys; print(sys.version)"
deha python script.py -p numpy,pandas

# Smoke test
deha smoketest https://myapi.com -r "/health,/api/users"

# Screenshot
deha screenshot https://mysite.com --full-page

# Vision analysis
deha vision https://mysite.com -q "Are there any UI/UX issues?"

# Chat history
deha history
deha history 3
deha history search "async"

# MCP server management
deha mcp catalog
deha mcp install filesystem
deha mcp install fetch

# Check for updates
deha update
```

### Interactive mode commands

| Command | Description |
|---|---|
| `/agent <prompt>` | Agentic mode with tool calling |
| `/judge <file> <task>` | Judge a file interactively |
| `/file <path>` | Inject file into context |
| `@./src/index.ts` | Embed file inline in a message |
| `/run <cmd>` | Run a terminal command |
| `/python <code>` | Execute Python code |
| `/smoketest <url>` | Run HTTP smoke tests |
| `/screenshot <url>` | Take a screenshot |
| `/vision <url>` | AI visual analysis |
| `/mcp list` | List MCP servers |
| `/oldconversations` | Browse past conversations |
| `/clear` | Clear conversation history |

### ESC ile iptal

Agent uzun düşünüyor veya yanlış yönde ilerliyorsa **ESC** tuşuna basarak işlemi anında durdurabilirsiniz.

### Çoklu satır yapıştırma

Birden fazla satır yapıştırdığınızda DEHA otomatik olarak bekleme moduna geçer. Mesajınızı tamamlayıp **boş satırda Enter** ile gönderebilirsiniz. Tek satırda Enter direkt gönderir.

## Context Management (Bağlam Yönetimi)

DEHA, uzun konuşmalarda bağlam kaybını önlemek için 3 katmanlı bellek kullanır:

```
Hot (5 mesaj)  ──→ Modele doğrudan eklenir
Warm (tümü)    ──→ Redis veya session buffer (JSON)
Cold (arşiv)   ──→ ~/.deha/conversations/*.json (20 mesajda bir flush)
```

**Auto Compression:** Token sayısı eşiği geçince AI eski mesajları özetler. Özet + son N mesaj korunur, gerisi arşive gider. Bu sayede sonsuz konuşma mümkün olur.

```env
DEHA_MAX_CONTEXT_TOKENS=0      # 0 = otomatik (provider'a göre)
DEHA_COMPRESS_THRESHOLD=0.75   # %75 → compress
DEHA_MIN_HOT_MESSAGES=10       # compress'te korunan mesaj
```

## Güvenlik Filtresi

`run_shell` tool'u ile çalıştırılan komutlar otomatik olarak taranır. Aşağıdaki kalıplar **engellenir**:

- `rm -rf /`, `rm -rf ~` (kök dizin silme)
- `dd if=`, `mkfs`, `fdisk`, `format` (disk işlemleri)
- `shutdown`, `reboot`, `poweroff`, `halt` (sistem kapatma)
- Fork bomb (`:(){...}`)
- `chmod 777 /`, `chown`, `shred`
- Doğrudan disk yazma (`> /dev/sda`)

Engellenen komutlar için kullanıcıya 3 seçenek sunulur: İptal Et / Bir Kere İzin Ver / Oturum Boyunca İzin Ver.

## Pipeline: Plan → Code → Judge

DEHA's `build` command runs a multi-agent pipeline where each role can use a **different model from a different provider**:

```
Task
 │
 ▼
[PLANNER]  Analyzes the task, produces a structured plan
 │         e.g. Claude Opus via OpenRouter
 ▼
[CODER]    Implements the plan, writes production-ready code
 │         e.g. DeepSeek Coder
 ▼
[JUDGE]    Reviews the code → PASS or FAIL + feedback
 │         e.g. Grok 3 Reasoning via xAI
 │
FAIL ──→ CODER (with feedback, uses EDIT blocks for token efficiency)
 │
PASS ──→ Final output
```

On revision iterations, the Coder uses **EDIT blocks** instead of rewriting entire files — saving tokens significantly:

```
EDIT: src/index.ts
<<<OLD>>>
return false;
<<<NEW>>>
return true;
<<<END>>>
```

## Test

```bash
npm test              # 83 test, 7 dosya
npm run test:watch    # geliştirme modu
npm run test:coverage # coverage raporu
npx tsc --noEmit      # tip kontrolü
```

Detaylı bilgi: [CONTRIBUTING.md](CONTRIBUTING.md)

## Custom API (Self-hosted / Local GPU)

```bash
deha -p custom -u http://localhost:1234/v1
```

Works with any OpenAI-compatible endpoint: LM Studio, vLLM, LocalAI, llama.cpp server, Kobold, TabbyAPI, Jan.

## Supported Providers

| Provider | Env Key | Notes |
|---|---|---|
| `claude` | `ANTHROPIC_API_KEY` | claude-opus-4-6, claude-sonnet-4-6 |
| `openai` | `OPENAI_API_KEY` | gpt-4o, gpt-4-turbo |
| `deepseek` | `DEEPSEEK_API_KEY` | deepseek-v4-flash, deepseek-chat, deepseek-coder |
| `openrouter` | `OPENROUTER_API_KEY` | 200+ models |
| `xai` | `XAI_API_KEY` | grok-3 |
| `ollama` | — | Local, no API key needed |
| `custom` | `CUSTOM_API_KEY` | Any OpenAI-compatible endpoint |

## MCP Servers

```bash
deha mcp catalog          # list installable servers
deha mcp install filesystem
deha mcp install fetch
deha mcp install git
deha mcp install github   # requires GITHUB_PERSONAL_ACCESS_TOKEN
deha mcp install puppeteer
deha mcp install postgres
deha mcp install sqlite

# Add custom server
deha mcp add myserver npx -y my-mcp-server
```

Once installed, MCP tools are automatically available in `/agent` mode.

## Contributing

Katkıda bulunmak için [CONTRIBUTING.md](CONTRIBUTING.md) dosyasını okuyun.

## License

MIT
