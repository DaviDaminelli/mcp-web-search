# mcp-web-search

Servidor MCP (Model Context Protocol) para consultas na internet, publicado na **Vercel** como uma API HTTP stateless. Permite que agentes de IA como o **Antigravity** pesquisem na web, leiam páginas, consumam APIs REST e extraiam links — sem nenhuma API key necessária.

---

## Ferramentas disponíveis

| Ferramenta | Descrição |
|---|---|
| `web_search` | Busca na internet via DuckDuckGo e retorna título, URL e snippet de cada resultado |
| `read_webpage` | Baixa uma página e retorna o conteúdo em Markdown limpo, texto puro ou HTML bruto |
| `fetch_json` | Faz GET em qualquer URL e retorna o JSON da resposta (ideal para APIs REST públicas) |
| `extract_links` | Extrai todos os links de uma página, com suporte a filtro por domínio |

---

## Stack

- **Next.js 16** (App Router) — framework do servidor
- **mcp-handler** — adaptador HTTP para o protocolo MCP
- **@modelcontextprotocol/server** — SDK MCP v2
- **duck-duck-scrape** — busca no DuckDuckGo (sem API key)
- **axios** + **cheerio** + **turndown** — fetch e parsing de páginas web
- **Zod v4** — validação de schemas das ferramentas
- **Vercel Hobby** — hospedagem gratuita (timeout de 60s por request)

---

## Deploy na Vercel

### Pré-requisitos

- Node.js 20+
- pnpm

### 1. Clone o repositório

```bash
git clone https://github.com/suportebono/mcp-web-search.git
cd mcp-web-search
pnpm install
```

### 2. Teste localmente

```bash
pnpm dev
```

O endpoint MCP estará disponível em `http://localhost:3000/api/mcp`.

Para inspecionar as ferramentas visualmente:

```bash
npx @modelcontextprotocol/inspector http://localhost:3000/api/mcp
```

### 3. Publique na Vercel

```bash
npx vercel
```

Após o deploy, você receberá uma URL no formato `https://mcp-web-search-xxx.vercel.app`.

---

## Configurando no Antigravity

Edite o arquivo `~/.gemini/config/mcp_config.json` (crie se não existir):

```json
{
  "mcpServers": {
    "web-search": {
      "serverUrl": "https://seu-projeto.vercel.app/api/mcp"
    }
  }
}
```

Reinicie o Antigravity e verifique em **`... > MCP Servers`** — as 4 ferramentas devem aparecer listadas.

---

## Configurando em outros clientes MCP

### Claude Desktop / Cursor / Windsurf

Adicione ao arquivo de configuração do seu cliente:

```json
{
  "mcpServers": {
    "web-search": {
      "url": "https://seu-projeto.vercel.app/api/mcp"
    }
  }
}
```

### Clientes que só suportam stdio

Use o pacote `mcp-remote` como proxy:

```json
{
  "mcpServers": {
    "web-search": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://seu-projeto.vercel.app/api/mcp"]
    }
  }
}
```

---

## Referência das ferramentas

### `web_search`

Busca na internet usando o DuckDuckGo.

**Parâmetros:**

| Nome | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `query` | `string` | ✅ | Termos de busca |
| `num_results` | `number` | ❌ | Quantidade de resultados (1–10, padrão: 5) |

**Exemplo de retorno:**
```json
[
  {
    "title": "Next.js 15 — Blog",
    "url": "https://nextjs.org/blog/next-15",
    "snippet": "Next.js 15 introduces...",
    "source": "nextjs.org"
  }
]
```

---

### `read_webpage`

Lê e extrai o conteúdo de uma URL.

**Parâmetros:**

| Nome | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `url` | `string` | ✅ | URL da página |
| `mode` | `"markdown" \| "text" \| "raw_html"` | ❌ | Formato de saída (padrão: `markdown`) |

> Remove automaticamente scripts, estilos, anúncios, navegação e rodapé antes de retornar o conteúdo.

---

### `fetch_json`

Faz uma requisição GET e retorna o JSON.

**Parâmetros:**

| Nome | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `url` | `string` | ✅ | URL da API |
| `headers` | `Record<string, string>` | ❌ | Headers HTTP opcionais |

---

### `extract_links`

Extrai todos os links de uma página web.

**Parâmetros:**

| Nome | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `url` | `string` | ✅ | URL da página |
| `filter` | `string` | ❌ | Filtra links que contenham essa substring (ex: `"github.com"`) |

**Exemplo de retorno:**
```json
[
  {
    "text": "Documentação",
    "href": "/docs",
    "absolute_url": "https://exemplo.com/docs"
  }
]
```

---

## Estrutura do projeto

```
mcp-web-search/
├── app/
│   └── api/
│       └── mcp/
│           └── route.ts        ← Endpoint MCP (GET + POST)
├── lib/
│   ├── mcp-server.ts           ← Registro de todas as ferramentas
│   └── tools/
│       ├── web-search.ts       ← Busca DuckDuckGo
│       ├── read-webpage.ts     ← Leitura e parsing de páginas
│       ├── fetch-json.ts       ← Fetch de APIs REST
│       └── extract-links.ts   ← Extração de links
├── next.config.ts
└── package.json
```

---

## Protocolo MCP suportado

Este servidor implementa a especificação **MCP 2026-07-28** via transporte **Streamable HTTP stateless**, compatível com clientes modernos. Também oferece fallback automático para clientes que usam a especificação 2025-era Streamable HTTP.

---

## Licença

MIT
