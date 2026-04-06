# AI Memory Log — Admin-App

## 2026-04-06 — Admin-App v01.78.01 — Homepage Selector (Sidebar)
### Scope
Seletor de página inicial no menu lateral. Cada nav-item (exceto "Visão Geral") exibe ícone Home (Lucide) on hover. Click toggle define/remove homepage. Persistência 100% D1 via `/api/config-store` (key: `admin-app/homepage`), zero localStorage. On mount, useEffect carrega do D1 e navega automaticamente.
### Arquitetura
- `nav-item-row` wrapper div com `.homepage-toggle` button
- State: `homepageModule: ModuleId | null`
- Seleção exclusiva + desselecionável (fallback: overview)
- CSS: opacity 0 → 1 on hover, dourado quando `.homepage-active`
### Controle de versão
- `admin-app`: APP v01.78.00 → APP v01.78.01

## 2026-04-06 — Admin-App v01.78.00 — Pages Functions → Admin-Motor Full Migration
### Scope
Migração completa de **36 Pages Functions** para o `admin-motor` Worker nativo. Arquitetura consolidada de 37+ proxy stubs individuais para um único catch-all `[[path]].ts` usando Service Binding `ADMIN_MOTOR`.
### Arquitetura
- **Monolítico (recomendado)**: V8 isolates não penalizam bundles grandes; wrangler faz tree-shaking automático. Plano pago permite 10MB comprimido.
- **Catch-all**: `functions/api/[[path]].ts` roteia TODAS as requisições `/api/*` para o motor via `ADMIN_MOTOR` binding.
- **Retained**: `health.ts` (Pages direto), `tlsrpt/[[path]].ts` (Service Binding TLSRPT_MOTOR), `_middleware.ts`.
### Dead Code Removido
- `admin-motor-proxy.ts`, `oraculo-admin.ts`, `rate-limit-common.ts` (functions + motor copies)
### Observability
- `head_sampling_rate: 1` (100% log capture), `invocation_logs: true`
### Cross-App Audit
- Zero impacto em 8 apps do workspace — todos usam BIGDATA_DB diretamente, zero chamadas HTTP externas inter-app.
### AI Gateway
- Zero resquícios em todo o workspace.
### Controle de versão
- `admin-app`: APP v01.77.44 → APP v01.78.00

### Scope
Adicionado `'style'` ao `ALLOWED_ATTR` do `sanitizeRichHtml` no `AstrologoModule.tsx`, permitindo que atributos de estilo (`text-align`, `text-indent`) gerados pelo Gemini sejam renderizados corretamente nas abas "Consultas Registradas" e "Dados de Usuários".
### Controle de versão
- `admin-app`: APP v01.77.43 → APP v01.77.44

## 2026-04-05 — Gemini Import Pipeline Estabilização + Formatting Fixes (v01.77.43)
### Scope
Estabilização do pipeline de importação Gemini e correção de bugs visuais de formatação no PostEditor e PostReader.
### Resolved
- **Pipeline Jina Reader**: Refatorada arquitetura de 2 tiers (readerlm-v2 + browser) para tier único **browser-only** (`X-Engine: browser`), eliminando `503 Reader LM at capacity` e `524 timeout`. Payload reduzido ~80% com `X-Retain-Images: none`. Parser SSE removido, código simplificado de ~395 para ~225 linhas.
- **PostEditor — Linhas em branco duplicadas**: Removida inserção forçada de `<p><br></p>` no `postprocessHtml`. Espaçamento agora via CSS: `.tiptap-editor .tiptap p { margin-bottom: 0.65em }` em `App.css`.
- **PostReader — H3 centralizado**: Adicionado inline `text-align: left` nos `<h3>` gerados pelo `postprocessHtml`.
### Controle de versão
- `admin-app`: APP v01.77.42 → APP v01.77.43

## 2026-04-05 — Remoção dos Botões de IA Públicos e Modelo do Leitor (v01.77.42)
### Scope
Remoção completa dos botões "Resumo por IA" e "Traduzir Para" do `mainsite-frontend/PostReader.tsx` e do seletor "Modelo do Leitor (Tradução/Resumo Público)" do `admin-app/ConfigModule.tsx`.
### Removido
- **PostReader.tsx**: estados `postSummary`, `translatedContent`, `isSummarizing`, `isTranslating`, `aiError`; handlers `handleSummarize`, `handleTranslate`; todo o CSS das classes `.ai-btn`, `.ai-select`, `.ai-error-msg`, `.ai-summary-box`, `.ai-actions-container`, `.processing-active`; JSX dos botões e summary box; imports órfãos (`ChangeEvent`, `useEffect`, `useState`, `AlignLeft`, `Languages`, `X`, `AlertTriangle`, `Sparkles`); prop `API_URL` da interface e do uso em `App.tsx`.
- **mainsite-worker/ai.ts**: rotas `POST /api/ai/public/summarize` e `POST /api/ai/public/translate`.
- **mainsite-worker/genai.ts**: campo `reader?` em `MainsiteConfig`; entradas `summarize` e `translate` em `ENDPOINT_CONFIGS`.
- **ConfigModule.tsx**: fieldset "Modelo do Leitor (Tradução/Resumo Público)"; campo `reader` em `msAiModels` state, no tipo de `saveAiModelsImmediately`, na union do `handleAiModelChange` e no loader de configurações.
### Controle de versão
- `admin-app`: APP v01.77.41 → APP v01.77.42
- `mainsite-frontend`: APP v03.04.03 → APP v03.04.04

## 2026-04-05 — Gemini Import Resiliência Jina Reader (v01.77.41)
### Scope
Correção dos erros intermitentes 429/timeout no `admin-motor/src/handlers/routes/mainsite/gemini-import.ts`.
### Root Causes Resolvidos
- **JINA_API_KEY ausente**: sem a key, chamadas iam para limite 20 RPM/IP compartilhado CF. Secret `jina-api-key` criado no Secrets Store (`df90c0935...`, scope: workers) e binding `JINA_API_KEY` adicionado ao `admin-motor/wrangler.json`.
- **Timeout insuficiente**: 15s → 35s local + header `X-Timeout: 30` para o servidor Jina aguardar mais tempo pelo carregamento da página-alvo.
- **Sem retry Jina**: adicionado loop de 3 tentativas com exponential backoff (1.5s, 3s), honrando `Retry-After` no 429 (cap 12s).
- **Gemini maxRetries 1→2**, retryDelayMs 1000→1500.
### Controle de versão
- `admin-app`: APP v01.77.40 → APP v01.77.41

### Scope
Extensão da Modernização do Gemini API (v1beta) com aplicação de suas 10 features estruturais diretamente no middleware / pipeline de resumos de SEO e Linked Data do mainsite (`admin-motor/src/handlers/routes/mainsite/post-summaries.ts`).
### Resolved
- **@google/genai SDK**: A adoção nativa do SDK resolve a formatação defasada de headers, introduzindo nativamente as restrições arquiteturais.
- **Implementações das 10 Features**: O código agora conta os pre-tokens via `countTokens`, gerencia o log detalhadamente via `structuredLog`, impõe os safe-guards obrigatórios (`BLOCK_ONLY_HIGH` + `CIVIC_INTEGRITY`), restringe a resiliação via retry limits formatados, loga os costs reais (usage metadata) e escapa corretamente as partes em modo de Thinking Model.

### Controle de versão
- `admin-app`: APP v01.77.38 -> APP v01.77.39
## 2026-04-04 — Gemini Direct API Migration & Gateway Elimination
### Scope
Remoção integral do Cloudflare AI Gateway e do fallback estrito para Cloudflare Workers AI nas operações de geração e processamento de textos do MainSite e backends de edição (`post-summaries`, `transform.ts`, `gemini-import.ts`), prevenindo erros \`524 Timeout\` em operações pesadas no proxy do Cloudflare.
### Resolved
- **Expurgo Ambiental**: Excluídos do `admin-motor/index.ts` e do runtime resolver os tokens estritos como \`CF_AI_GATEWAY\` e \`CF_AI_TOKEN\`.
- **Tipagens Corrigidas**: A supressão das env vars ausentes permitiram limpar problemas de linter com a `ResolvedAdminMotorEnv`.
- **Frontend Unification**: \`ConfigModule.tsx\` desvinculou as listagens nativas da CF AI para exibir puramente a UI de \`geminiModels\`.

## 2026-04-04 — Admin-Motor Post Summaries AI Binding Issue
### Scope
Resolução do erro `AI binding não configurado` que ocorria no disparo em background (via POST `/api/mainsite/post-summaries`) responsável pelas auto-summarizações (SEO e LD) dos artigos novos criados pelo LCV Admin. O Binding não fluía de forma propagada na topologia interna Worker->Service.

### Resolved
- **Injeção do Binding `AI`**: O objeto proxy local responsável por carregar o setup do ambiente e injetar the secrets dentro do `admin-app/admin-motor` (no file `index.ts`, func `resolveRuntimeEnv`) antes rejeitava (drop) a existência da injeção nativa de AI no `AdminMotorEnv` devido ao object reconstruction. O AI binding foi inserido nos mappings da interface `AdminMotorEnv`, `ResolvedAdminMotorEnv` e no próprio callback garantindo `AI: env.AI`.

### Controle de versão
- `admin-app`: APP v01.77.37 -> APP v01.77.38

## 2026-04-04 — Crash no FinanceiroModule Modal Corrigido
### Scope
Resolvido um erro fatal que ocorria ao tentar abrir o modal de estorno no ambiente financeiro (`TypeError: Cannot read properties of undefined (reading 'toLocaleString')`).

### Resolved
- **Tratamento de undefined nas Moedas**: O frontend estava tentando invocar o método nativo `.toLocaleString('pt-BR')` diretamente no atributo `modal.tx.amount` na renderização do campo Input (em `FinanceiroModule.tsx:670`). Se nulo, colapsava todo o DOM da aplicação (White Screen of Death). A correção introduziu um cast forte e coeso usando `Number(modal.tx.amount ?? 0)`.

### Controle de versão
- `admin-app`: APP v01.77.36 -> APP v01.77.37

## 2026-04-03 — Cloudflare Runtime & Secrets Parity + Proxy Strict Typings
### Scope
Resolução imediata de anomalia de middleware (em dmin-app/_middleware.ts) que causou a falha sistemática 500 em todo ecossistema administrativo por não propagar secrets (bindings limitados/deep frozen pelo Cloudflare Pages router handler lifecycle). Adicionalmente, sanados os 5 erros críticos de incompatibilidade DOM vs Worker-type em mainsite-frontend/functions/api/[[path]].ts.

### Resolved
- **Runtime Propagation (admin-app)**: Implementou-se injeção persistente adotando a especificação primária do Cloudflare via context.data.env. Executada varredura baseada em regex customizado, alterando as extrações de variáveis estritas em lote em 72 endpoints para garantirem context.data?.env || context.env, restabelecendo o fluxo em tempo real de GEMINI_API_KEY, AI Gateways e serviços financeiros isolados. Modificadores em \_middleware.ts\ validados pelo rigor de lint contra tipos inferidos inexperientes (\Record<string, unknown>\ substituindo \ny\).
- **Proxy TS Fixes (mainsite-frontend)**: Castings seguros criados para transição entre o DOM local Request interfaces e Node/Cloudflare (import('@cloudflare/workers-types')), curando falhas de BodyInit streams nulos e compatibilizando Arrays estritos de Headers, preservando com solidez os encaminhamentos \/api/*\ para o Service Binding subjacente.

> **Nota:** Este arquivo contém o histórico de desenvolvimento e decisões arquiteturais exclusivos do módulo `admin-app`. Refere-se a atualizações, correções e novos recursos referentes ao app administrativo.

## 2026-04-04 — Admin API Connectivity & Infra Parity Restored (Proxy Native Fix)
## 2026-04-03 — Cloudflare Paid Scale Integration
## 2026-04-03 — Admin-App v01.77.30 — Editor Spacing Custom Extension
## 2026-04-03 — Admin-App v01.77.19 — Fix Crítico: Gemini Import 502 Bad Gateway Fantasma
## 2026-04-02 — Admin-App v01.77.08 — Migrate AI Model Selectors to D1 (MainSite)
## 2026-04-01 — Admin-App v01.77.05 — CF P&W Module Audit & API Compliance Enforcement
## 2026-04-01 — Admin-App v01.77.04 — Cloudflare Token Eradication & Refactoring
## 2026-04-01 — Admin-App v01.77.03 — Cloudflare Cache Token Isolation
## 2026-04-01 — Admin-App v01.77.02 — Cloudflare Purge Cache Authentication Fix
## 2026-04-01 — Admin-App v01.77.01 — Cloudflare Purge Cache Authentication Fix
## 2026-04-01 — Admin-App v01.77.00 — Cloudflare Purge Cache
## 2026-03-31 — Admin-App v01.76.01 — AI Summary Auto-Generation Fix
## 2026-03-31 — Admin-App v01.75.00 — Gemini Import Gold Standard & AI Transform Fix
## 2026-03-31 — Admin-App v01.74.21 — PostEditor Gemini Import Crash Fix Fixed
## 2026-03-31 — Admin-App v01.74.20 — PostEditor Lint Gate Hardening
## 2026-03-31 — Admin-App v01.74.19 — Gemini Import Hardening + Popup Crash Fix
## 2026-03-31 — Admin-App v01.74.18 — Hotfix Build e Imports
## 2026-03-31 — Admin-App v01.74.17 — Legados BUG FIX e Chrome Opts
## 2026-03-31 — Admin-App v01.74.16 — PostEditor Legados Selection Bugfix
## 2026-03-31 — Admin-App v01.74.15 — PostEditor v5 Closure
## 2026-03-31 — Admin-App v01.74.10 — PR Queue Unblock via CodeQL Workflow
## 2026-03-31 — Admin-App v01.74.09 — GitHub Deploy ERESOLVE Fix
## 2026-03-31 — Admin-App v01.74.08 — Compliance Module Typing & Linter Cleanup
## 2026-03-31 — Admin-App v01.74.07 — GCP Monitoring JWT Fix
## 2026-03-29 — Admin-App v01.74.01 — CF DNS Table Text Overflow Fix
## 2026-03-29 — Admin-App v01.74.00 — Visual Standardization (Google Palette + Balanced Sizing)
## 2026-03-29 — Admin-App v01.73.00 + Mainsite Frontend v03.02.00 + Worker v02.01.01 — Dynamic Post Author
## 2026-03-29 — Admin-App v01.72.01 — D1 Autosave Defaults on First Run
## 2026-03-29 — Admin-App v01.72.00 — localStorage → D1 Migration
## 2026-03-29 — Admin-App v01.71.00 — AI Share Summaries for Social Sharing
## 2026-03-29 — Admin-App v01.70.04 — Financeiro Table Alignment (SumUp/MP)
## 2026-03-29 — Admin-App v01.70.01 — PostEditor Inline Save Feedback
## 2026-03-29 — Admin-App v01.70.00 — Purge Logic Fix + Complete window.confirm Migration
## 2026-03-29 — Admin-App v01.69.05 — Custom Confirm Modal (Purge Deployments)
## 2026-03-29 — Admin-App v01.69.04 — Notification Visual Overhaul + Build Cache Fix
## 2026-03-29 — Admin-App v01.69.03 — Purge Deployments Toast Compliance
## 2026-03-29 — Admin-App v01.69.02 — Telemetria Chatbot Tab Merge
## 2026-03-29 — Admin-App v01.69.01 — AI Status UI Humanization + Telemetry Instrumentation
## 2026-03-29 — Admin-App v01.69.00 — AI Status Module (Tier A+B+C)
## 2026-03-29 — Admin-App v01.67.03 — Frontend Refund Status Override Fix
## 2026-03-29 — Admin-App v01.67.02 + Mainsite v03.01.01/v02.00.01 — Refund Detection + Sitemap Fix
## 2026-03-28 — Admin-App v01.67.01 — Rate Limit Contato Parity
## 2026-03-28 — Admin-App v01.67.00 — Cloudflare Pages Deployment Governance
## 2026-03-28 — Admin-App v01.66.01 — CF DNS Audit False-Positive Fix
## 2026-03-28 — Admin-App v01.66.00 — Oráculo Rate Limit Controls
## 2026-03-28 — Admin-App v01.65.03 — CF DNS Visual UX + CF P&W Humanized Results
## 2026-03-28 — Admin-App v01.65.01 — CF DNS Proxied Record Validation Fix
## 2026-03-28 — Admin-App v01.65.00 — Cloudflare Full-Parity Expansion + DNS Zone Context
## 2026-03-28 — Admin-App v01.64.00 — Cloudflare P&W Advanced Ops + DNS Detailed Alerts
## 2026-03-28 — Admin-App v01.63.01 — Cloudflare UX Fidelity + Details Resilience
## 2026-03-28 — Admin-App v01.63.00 — Cloudflare Control Expansion (CF DNS + CF P&W)
## 2026-03-28 — Admin-App v01.61.02 — Astrologo UserData Frontend Alignment
## 2026-03-28 — Admin-App v01.61.01 — Mainsite Editor Layout Tweaks
## 2026-03-28 — Admin-App v01.61.00 — Calculadora AI Model Selector
## 2026-03-28 — Admin-App v01.60.02 — Cloudflare DNS Token Resolution
## 2026-03-28 — Admin-App v01.60.01 — Menu Lateral e Deploy Automático
## 2026-03-28 — LCV Workspace — Migração TLS-RPT (Admin-App v01.60.00)
## 2026-03-28 — SumUp Canonical Checkout ID Reconciliation (Admin-App + Mainsite)
## 2026-03-27 — Oráculo Financeiro v01.07.00 + Admin-App v01.57.00 — Data Architecture Overhaul (Email Linkage + Cascade Delete)
## 2026-03-27 — Oráculo Financeiro v01.06.01 + Admin-App v01.56.01 — Cron Modernization + Observability + Fixes
## 2026-03-26 — Oráculo Financeiro v01.05.00 + Admin-App v01.55.00 — Email Report Rewrite + Admin Data View
## 2026-03-26 — Oráculo Financeiro v01.03.00 + Admin-App v01.53.00 — Tesouro Transparente + Cron + Redesign Admin
## 2026-03-26 — Admin-App v01.52.00 + Oráculo Financeiro v01.02.00 — Migração de Gestão de Registros e UI Redesign (Tiptap / Google Blue)

## 2026-03-26 — Admin-App v01.51.00 — Remoção do Mecanismo de Dry Sync

## 2026-03-26 — Admin-App v01.50.00 — Global Settings Parity (mainsite-admin → admin-app)

## 2026-03-26 — Admin-App v01.49.02 — FloatingScrollButtons Fix

## 2026-03-26 — Admin-App v01.49.01 — PostEditor Cleanup

## 2026-03-26 — Admin-App v01.49.00 — UI/UX Redesign (tiptap.dev Style, Google Blue)

## 2026-03-26 — Admin-App v01.48.01 — TipTap Console Warnings + AI Pill UI

## 2026-03-26 — Admin-App v01.48.00 — Editor Evolution Port

## 2026-03-26 — Admin-App v01.47.00 + Mainsite Worker — updated_at Infrastructure

## 2026-03-25 — Admin-App v01.46.24 (patch)

## 2026-03-25 — Admin-App v01.46.23 (patch)

## 2026-03-25 — Admin-App v01.46.17 (patch)

## 2026-03-25 — Admin-App v01.46.16 (patch)

## 2026-03-25 — Admin-App v01.46.15 (patch)

## 2026-03-25 — Admin-App v01.46.14 (patch)

## 2026-03-25 — Admin-App v01.46.13 (patch)

## 2026-03-25 — Admin-App v01.46.12 (patch)

## 2026-03-25 — Admin-App v01.46.11 (patch)

## 2026-03-25 — Admin-App v01.46.10 (patch)

## 2026-03-25 — Admin-App v01.46.09 (patch)

## 2026-03-25 — Admin-App v01.46.08 (patch)

## 2026-03-24 — Admin-App v01.46.07 (patch)

## 2026-03-24 — Admin-App v01.46.06 (patch)

## 2026-03-24 — Admin-App v01.46.05 (patch)

## 2026-03-24 — Admin-App v01.46.04 (patch)

## 2026-03-24 — Admin-App v01.46.03 (patch)

## 2026-03-24 — Admin-App v01.46.02 (patch)

## 2026-03-24 — Admin-App v01.46.01 (patch)

## 2026-03-24 — Admin-App v01.46.00 (Antigravity Agent — RSS Discovery Engine + PostEditor Popup)

## 2026-03-24 — Admin-App v01.45.01 (patch)

## 2026-03-24 — Admin-App v01.45.00 (Antigravity Agent — Dynamic News + Scroll Buttons + MainSite Cleanup)

## 2026-03-24 — Admin-App v01.44.00 (Antigravity Agent — News Panel Overhaul + Jargon Cleanup)

## 2026-03-24 — Admin-App v01.43.00 (Antigravity Agent — UI Cleanup + News Panel)

## 2026-03-24 — Admin-App Hardening (Telemetria + UX)

## 2026-03-24 — Admin-App v01.32.00 (Antigravity Agent — Refactoring UI)

## 2026-03-24 — Admin-App v01.37.00 (Antigravity Agent — Módulo Financeiro)

## 2026-03-24 — Admin-App v01.38.00 (Antigravity Agent — UI Cleanup + Code-Splitting)

## 2026-03-24 — Admin-App v01.41.00 (Antigravity Agent — TipTap Code-Splitting)

## 2026-03-24 — Admin-App v01.42.00 (Antigravity Agent — Astrólogo Bug Fixes)

## 2026-04-03 — Enforcing Canonical Domain Security & TypeScript Audit
## 2026-04-03 — AI Models Selection Parity & Hardcoding Eradication

