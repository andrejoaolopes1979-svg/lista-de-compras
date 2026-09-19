# Compras Inteligentes

Aplicativo **PWA + SPA** de lista de supermercado, planejamento e controle de compras,
desenvolvido com **HTML, CSS e JavaScript puro (Vanilla JS)** — sem frameworks e sem
backend. Funciona **100% offline** no navegador do smartphone e pode ser instalado
como um aplicativo nativo.

| | |
|---|---|
| **Experimente online** | https://andrejoaolopes1979-svg.github.io/lista-de-compras/ |
| **Repositório** | https://github.com/andrejoaolopes1979-svg/lista-de-compras |
| **Stack** | Vanilla JS · IndexedDB · Chart.js (CDN) · PWA (manifest + Service Worker) |

---

## Funcionalidades

### 1. Planejamento / Pré-compra
- Cria a lista em casa: nome, categoria, quantidade estimada e preço estimado (opcional).
- **Sugestões rápidas**: itens frequentes do histórico em um clique + autocompletar.
- Botão **"Iniciar Compra"** transfere todos os itens planejados para o módulo Em Compras.

### 2. Em Compras / Carrinho Ativo
- Define ou altera o nome do supermercado a qualquer momento.
- **Checklist interativo**: ao marcar "peguei", abre os campos de **quantidade real** e
  **preço real** para confirmação na hora.
- Distinção visual clara entre **Itens no Carrinho** (verde) e **Itens Pendentes**.
- Cálculo em tempo real: subtotal pego × estimado pendente × estimativa total.
- **Múltiplas formas de pagamento** na mesma compra (Dinheiro, Pix, Cartão Benefício
  iFood, Débito, Crédito), com **validação automática** — só finaliza quando a soma dos
  pagamentos fecha com o total.

### 3. Comparador de Preços ("Onde Compensa Mais")
- Analisa todo o histórico por produto e mostra o **menor preço já registrado** e em
  qual supermercado, com ranking ordenado do mais barato.

### 4. Histórico de Compras
- Compras passadas agrupadas por data e supermercado, com detalhamento de itens
  (preços individuais) e divisão exata das formas de pagamento.
- **Reaproveitar** uma compra como base para um novo planejamento, ou excluí-la.

### 5. Dashboard de Análise
- **KPIs**: total acumulado, média por compra, supermercado mais frequentado e forma de
  pagamento mais utilizada.
- **Gráficos (Chart.js)**: gastos por categoria (rosquinha), gastos por forma de
  pagamento (pizza) e evolução mensal de gastos (linha).

### 6. Backup Local
- **Exportar** todos os dados (planejamento, carrinho e histórico) em um arquivo `.json`
  salvo na memória do smartphone.
- **Importar** um arquivo `.json` a qualquer momento (substitui os dados atuais).
- **Proteção de armazenamento** via `navigator.storage.persist()`, evitando que o
  navegador limpe os dados automaticamente.

---

## Arquitetura e Persistência

- **IndexedDB** (`js/db.js`) — banco local com grande capacidade, sem os limites do
  LocalStorage. Stores: `plan`, `cart`, `cartMeta`, `purchases`.
- **Service Worker** (`sw.js`) — estratégia *stale-while-revalidate*: a casca do app é
  pré-cacheadaa na instalação e o CDN do Chart.js é cacheado na primeira visita,
  garantindo o funcionamento offline completo depois disso.
- **Manifest** (`manifest.json`) — modo *standalone*, tema verde, ícones 192/512/SVG.
- Nenhum dado sai do dispositivo. Todo o processamento é local.

---

## Estrutura do Projeto

```
Lista de Compras/
├── index.html          # Casca SPA + navegação inferior + Chart.js (CDN)
├── manifest.json       # Manifesto PWA (instalação/standalone)
├── sw.js               # Service Worker (offline-first)
├── css/
│   └── style.css       # Tema dark + verde, mobile-first
├── js/
│   ├── db.js           # Camada de persistência (IndexedDB)
│   ├── views.js        # Renderização das 6 vistas
│   ├── charts.js       # Gráficos do dashboard (Chart.js)
│   └── app.js          # Estado global, eventos, comparador, backup e boot
└── icons/
    ├── icon.svg        # Fonte vetorial do ícone
    ├── icon-192.png
    └── icon-512.png
```

**Fluxo de dados:** `Planejamento` → *Iniciar Compra* → `Em Compras` → *Finalizar* →
`Histórico` → *Reaproveitar* → `Planejamento`.

---

## Como executar localmente

O Service Worker exige **HTTP/HTTPS** (não funciona via `file://`). Use qualquer
servidor estático:

```bash
# Opção 1: Python
python3 -m http.server 8080

# Opção 2: Node (se preferir)
npx serve .
```

Abra `http://localhost:8080`.

> Nota: na primeira visita online o Chart.js (CDN) é cacheado pelo Service Worker.
> Depois disso, a aplicação inteira funciona offline, inclusive os gráficos.

---

## Como instalar como PWA

1. Acesse o site (HTTPS obrigatório).
2. No Android/Chrome: menu do navegador → **"Adicionar à tela inicial"** /
   **"Instalar aplicativo"**.
3. No iOS/Safari: botão **Compartilhar** → **"Adicionar à Tela de Início"**.

---

## Backup e Privacidade

- Exporte um `.json` em **Backup** para armazenar seus dados (ao trocar de celular,
  por exemplo).
- A importação **substitui** todos os dados atuais.
- Recomenda-se exportar nos primeiros acessos e solicitar a **persistência** da
  armazenagem na aba Backup.

---

## Deploy

O projeto está publicado em **GitHub Pages** (build estático, sem configuração extra):

```
https://andrejoaolopes1979-svg.github.io/lista-de-compras/
```

Atualize a aplicação publicando na branch `main`; o GitHub Pages recompila
automaticamente.

```bash
git add -A
git commit -m "descrição das mudanças"
git push origin main
```

---

## Licença

Projeto pessoal — código aberto para uso e estudo.