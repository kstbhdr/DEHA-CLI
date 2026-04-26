# DEHA CLI

> Akıllı, çok modelli AI kodlama asistanı — terminal için.

```
╔══════════════════════════════════════════╗
║  DEHA — Akıllı Kodlama Asistanı         ║
║  v1.0.0  •  github.com/kstbhdr/DEHA-CLI ║
╚══════════════════════════════════════════╝
```

## Özellikler

| Özellik | Detay |
|---|---|
| **Multi-provider** | Claude, OpenAI, DeepSeek, Ollama, OpenRouter, xAI, Custom API |
| **Streaming** | Tüm providerlar için gerçek zamanlı token akışı |
| **Pipeline** | Plan → Code → Judge döngüsü, token-tasarruflu EDIT blokları |
| **Agent modu** | Tool calling: dosya okuma/yazma/düzenleme, shell, Python, browser, vision |
| **MCP desteği** | Model Context Protocol sunucuları (filesystem, git, fetch, github...) |
| **Browser** | Playwright ile web otomasyon, screenshot, form doldurma |
| **Vision** | Screenshot + Claude/GPT-4o ile UI analizi |
| **Smoke test** | HTTP endpoint sağlık kontrolü |
| **Python runner** | venv desteği, pip paket kurulumu |
| **Sohbet geçmişi** | Otomatik Markdown kayıt, arama, görüntüleme |

## Kurulum

```bash
git clone https://github.com/kstbhdr/DEHA-CLI.git
cd DEHA-CLI
npm install
npm run build
npm link          # 'deha' komutunu global olarak kullanılabilir yapar
```

## Yapılandırma

```bash
cp .env.example .env
# .env dosyasını düzenle, API keylerini ekle
```

```env
# Kullanılacak provider
DEHA_PROVIDER=claude

# API Keyleri
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
DEEPSEEK_API_KEY=...
OPENROUTER_API_KEY=sk-or-...
XAI_API_KEY=xai-...

# Pipeline rolleri
PLANNER_PROVIDER=openrouter
PLANNER_MODEL=anthropic/claude-opus-4
CODER_PROVIDER=deepseek
CODER_MODEL=deepseek-chat
JUDGE_PROVIDER=xai
JUDGE_MODEL=grok-3
```

## Kullanım

```bash
# İnteraktif mod
deha

# Tek seferlik soru
deha chat "Python'da async/await nasıl çalışır?"

# Plan → Code → Judge pipeline
deha build "Express.js REST API yaz, kullanıcı CRUD işlemleri olsun"

# Pipeline rolleri CLI'den değiştir
deha build "Redis cache ekle" \
  --planner-provider openrouter --planner-model anthropic/claude-opus-4 \
  --coder-provider deepseek --coder-model deepseek-chat \
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

# Vision analizi
deha vision https://mysite.com -q "UI/UX sorunları var mı?"

# Sohbet geçmişi
deha history
deha history 3
deha history search "async"

# MCP sunucu yönetimi
deha mcp catalog
deha mcp install filesystem
deha mcp install fetch

# Güncelleme
deha update
```

### İnteraktif mod komutları

| Komut | Açıklama |
|---|---|
| `/agent <soru>` | Araç çağırabilen ajan modu |
| `/file <yol>` | Dosyayı bağlama ekle |
| `@./src/index.ts` | Mesaj içine dosya göm |
| `/run <komut>` | Terminal komutu çalıştır |
| `/python <kod>` | Python kodu çalıştır |
| `/smoketest <url>` | HTTP smoke testi |
| `/screenshot <url>` | Ekran görüntüsü al |
| `/vision <url>` | AI görsel analizi |
| `/mcp list` | MCP sunucularını listele |
| `/oldconversations` | Eski sohbetleri görüntüle |
| `/clear` | Geçmişi temizle |

## Custom API (Kendi GPU Sunucun)

```bash
deha -p custom -u http://localhost:1234/v1
```

LM Studio, vLLM, LocalAI, llama.cpp, Kobold — OpenAI-uyumlu her endpoint çalışır.

## Desteklenen Providerlar

| Provider | Env Key | Notlar |
|---|---|---|
| `claude` | `ANTHROPIC_API_KEY` | claude-opus-4-6, claude-sonnet-4-6 |
| `openai` | `OPENAI_API_KEY` | gpt-4o, gpt-4-turbo |
| `deepseek` | `DEEPSEEK_API_KEY` | deepseek-chat, deepseek-coder |
| `openrouter` | `OPENROUTER_API_KEY` | 200+ model |
| `xai` | `XAI_API_KEY` | grok-3 |
| `ollama` | — | Yerel, API key gerekmez |
| `custom` | `CUSTOM_API_KEY` | Herhangi OpenAI-compat endpoint |

## Lisans

MIT
