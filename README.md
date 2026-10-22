# mcp-web-search

Servidor MCP (Model Context Protocol) para consultas na internet, publicado na **Vercel** como uma API HTTP stateless. Permite que agentes de IA como o **Antigravity** pesquisem na web, leiam páginas, consumam APIs REST e extraiam links — sem problemas de bloqueios anti-bot.

---

## Ferramentas disponíveis

| Ferramenta | Descrição |
|---|---|
| `web_search` | Busca na internet via **Tavily API** e retorna título, URL e snippet de cada resultado |
| `read_webpage` | Usa o Tavily Extract para baixar páginas burlando bloqueios anti-bot e retorna o conteúdo em Markdown, texto puro ou HTML |
| `fetch_json` | Faz GET em qualquer URL via Axios e retorna o JSON da resposta (ideal para APIs REST públicas) |
| `extract_links` | Usa o Tavily Extract para ler a página e extrai todos os links com suporte a filtro por domínio |

---

## Stack

- **Next.js 16** (App Router) — framework do servidor
- **mcp-handler** — adaptador HTTP para o protocolo MCP
- **@modelcontextprotocol/server** — SDK MCP v2
- **Tavily API** — mecanismo oficial de busca e extração de páginas (imune a bloqueios anti-bot)
- **axios** + **cheerio** + **turndown** — consumo de APIs REST e parsing de conteúdo HTML
- **Zod v4** — validação de schemas das ferramentas
- **Vercel Hobby** — hospedagem gratuita (timeout de 60s por request)

---

## Configurando a Tavily API

Como a Vercel e outros datacenters são frequentemente bloqueados por firewalls ao tentar raspar o conteúdo da web (scraping), este projeto utiliza o **Tavily**, que é uma API focada em IA que consegue ler páginas e buscar na internet de forma 100% confiável.

A chave é **obrigatória** — não há chave embutida no código. Sem variável de ambiente configurada, as ferramentas de busca falham com `Nenhuma chave da Tavily configurada`.

1. Crie uma conta gratuita em [tavily.com](https://tavily.com) (dá direito a 1.000 requisições/mês gratuitas).
2. Vá no painel da sua hospedagem (ex: **Vercel**) e adicione a Variável de Ambiente:
   - `TAVILY_API_KEY`: `sua_chave_aqui`
3. Para rodar local, crie um `.env.local` na raiz com a mesma variável. O arquivo é ignorado pelo git.

### Múltiplas chaves com troca automática

Para não ficar sem busca quando uma conta gratuita atinge o limite, configure várias chaves separadas por vírgula:

- `TAVILY_API_KEYS`: `tvly-dev-chave1,tvly-dev-chave2,tvly-dev-chave3`

O servidor usa a primeira chave e, ao receber um erro de limite (`429` por minuto, `432`/`433` por cota do plano) ou de chave inválida (`401`/`403`), **repete a mesma requisição, com os mesmos parâmetros, na próxima chave** — tudo dentro da mesma chamada MCP. O cliente (a IA) recebe o resultado normalmente e não precisa refazer a busca.

Detalhes do comportamento:

- A chave que funcionou vira a padrão das chamadas seguintes, então não há troca desnecessária.
- A chave que estourou fica em espera antes de voltar ao pool: o valor do header `Retry-After` (ou 1 minuto) para `429`, 6 horas para cota do plano, 24 horas para chave inválida.
- Se a única chave disponível levar um `429` curto, o servidor **espera até 3 segundos e repete** em vez de devolver erro. Esperas maiores falham na hora, para não travar o cliente.
- Se todas as chaves estiverem em espera, ele ainda tenta a que libera primeiro — o tempo de espera é uma estimativa local, não um dado da Tavily.
- Erros que não são de limite (`400` de parâmetro inválido, `500`) sobem direto, sem queimar as outras chaves.
- Esgotado o pool, o erro lista o motivo de cada chave (ex: `chave #1 (432 This request exceeds your plan's set usage limit...)`).

`TAVILY_API_KEYS` e `TAVILY_API_KEY` podem ser usadas juntas — as chaves das duas são somadas no pool. A lógica fica em [lib/tavily.ts](lib/tavily.ts).

### Verificando

```bash
pnpm test:rotation   # testa a rotação com respostas simuladas (não gasta crédito)
pnpm test:links      # testa o parser de links do extract_links (não gasta crédito)
pnpm check:keys      # diz quais chaves do .env.local ainda têm saldo (1 crédito por chave)
pnpm check:tools     # roda as três ferramentas contra a API real (~3 créditos)
```

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

Após o deploy, você receberá uma URL no formato `https://mcp-web-search-xxx.vercel.app`. Não se esqueça de configurar o `TAVILY_API_KEY`!

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

Busca na internet usando a API do Tavily.

**Parâmetros:**

| Nome | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `query` | `string` | ✅ | Termos de busca |
| `num_results` | `number` | ❌ | Quantidade de resultados (padrão: 5) |

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

Lê e extrai o conteúdo de uma URL burlando paywalls e anti-bots usando o Tavily Extract.

**Parâmetros:**

| Nome | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `url` | `string` | ✅ | URL da página |
| `mode` | `"markdown" \| "text" \| "raw_html"` | ❌ | Formato de saída (padrão: `markdown`) |

> Remove automaticamente scripts, estilos, anúncios, navegação e rodapé antes de retornar o conteúdo.

---

### `fetch_json`

Faz uma requisição GET via Axios e retorna o JSON bruto.

**Parâmetros:**

| Nome | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `url` | `string` | ✅ | URL da API |
| `headers` | `Record<string, string>` | ❌ | Headers HTTP opcionais |

---

### `extract_links`

Usa o Tavily Extract para ler o HTML real da página (inclusive sites dinâmicos) e extrai todos os links.

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
│   ├── tavily.ts               ← Cliente Tavily com pool de chaves e troca no limite
│   └── tools/
│       ├── web-search.ts       ← Busca via Tavily API
│       ├── read-webpage.ts     ← Leitura e parsing de páginas (Tavily Extract)
│       ├── fetch-json.ts       ← Fetch de APIs REST genéricas
│       └── extract-links.ts    ← Extração de links via Tavily Extract HTML
├── next.config.ts
└── package.json
```

---

## Protocolo MCP suportado

Este servidor implementa a especificação **MCP 2026-07-28** via transporte **Streamable HTTP stateless**, compatível com clientes modernos. Também oferece fallback automático para clientes que usam a especificação 2025-era Streamable HTTP.

---

## Licença

MIT
