# Contexto de Negócio — FORT BEER ERP

**Empresa:** Fort Beer — distribuidora de bebidas e conveniência  
**Objetivo do sistema:** substituir planilhas de controle por um ERP operacional único  
**Documentos relacionados:** `ARQUITETURA_FORT_BEER_ERP.md`, `ANALISE_PLANILHA.md`, `ANALISE_ARQUITETURA_ATUAL.md`

---

## 1. Quem é a Fort Beer

A Fort Beer opera como **distribuidora + ponto de venda / conveniência**. O mix não é só cerveja: inclui bebidas, tabaco, snacks, gelo, carvão e itens de conveniência. Isso exige:

- Cadastro por **categoria** (filtros no PDV, relatórios, ruptura)
- Unidades e **volumes** (fardo, pack, unidade, dose, kg)
- Regras fiscais/operacionais distintas (ex.: cigarros, doses, gelo)
- Precificação com **custo + markup** (hoje fragmentada na planilha)

A planilha atual (`PROD`, `ENTRADAS`, `SAIDA`, `CAIXA`, `LUCRO`…) já mostrou categorias reais e o problema clássico: **cadastro incompleto**, custo/preço vindos da última compra/venda, e estoque dessincronizado.

---

## 2. Mix de produtos (catálogo)

Categorias oficiais do negócio (taxonomia inicial do ERP):

| Grupo | Categorias |
|-------|------------|
| **Bebidas frias** | Cervejas, Refrigerantes, Energéticos, Águas |
| **Bebidas alcoólicas** | Destilados, Doses, Vinhos |
| **Tabaco** | Cigarros, Palheiros, Fumos |
| **Conveniência / snacks** | Doces, Salgados |
| **Churrasco / apoio** | Gelo, Carvão |
| **Outros** | Essências, Produtos de conveniência |

### Implicações no sistema

| Necessidade | Decisão de domínio |
|-------------|-------------------|
| Padronizar nomes (`Cerveja` ≠ `cerveja`) | `Categoria` cadastrável + `nomeNorm`; seed com a lista acima |
| PDV rápido por família | Favoritos + filtros por categoria |
| Volumes diferentes | `unidade` + conversão volume↔unidade nas compras |
| Kits (ex.: gelo + cerveja) | Módulo kits já previsto |
| Itens sensíveis (tabaco) | Flag/permissão futura; não misturar com “só bebida” nos relatórios |

---

## 3. O que as planilhas controlam hoje → o que o ERP cobre

| Processo na planilha | No ERP | Módulo |
|----------------------|--------|--------|
| **Compras** | Entrada manual + NF-e XML; custo por item | Compras |
| **Estoque** | Saldo por movimentos (nunca digitado) | Estoque / Inventário |
| **Precificação** | Preço de venda sugerido e praticado | Catálogo / Precificação |
| **Custos** | Custo da última compra e/ou custo médio | Compras → Produto |
| **Markup** | `(preço − custo) / custo` e margem % | Precificação / Relatórios |
| **Vendas** | PDV (balcão) + histórico | Vendas / PDV |
| **Entregas** | **Gap atual** — não existe módulo dedicado | Entregas / Logística |
| **Financeiro** | Fiado + visão gestor (parcial) | Financeiro (contas) |
| **Fluxo de caixa** | Caixa diário (parcial/frágil) | Caixa + Fluxo de caixa |
| **Relatórios** | Dia/mês básico | Relatórios / BI operacional |

---

## 4. Processos de ponta a ponta

### 4.1 Ciclo mercadoria

```
Fornecedor → Compra / NF-e → Estoque sobe → Precificação (custo → markup → preço)
    → Venda (balcão ou entrega) → Estoque desce → Caixa / Fiado / Contas
    → Relatórios (giro, margem, ruptura)
```

### 4.2 Ciclo dinheiro

```
Venda à vista (dinheiro/PIX/cartão) → movimento de caixa do dia
Venda fiado → conta do cliente → pagamento posterior → caixa
Compra a prazo (futuro) → conta a pagar → baixa → saída de caixa
Sangria / suprimento / despesas operacionais → fluxo de caixa
```

### 4.3 Ciclo entrega (novo — crítico para distribuidora)

```
Pedido / venda com entrega → roteirização simples (fase 1: fila do dia)
  → saída do estoque (na confirmação ou na expedição — política única)
  → status: Pendente → Saiu → Entregue / Devolvido
  → pagamento (na entrega ou pré-pago) → caixa / fiado
```

**Política recomendada (Fase 1):** estoque baixa na **confirmação da venda/pedido**; entrega é status logístico, não segundo movimento de estoque (evita duplicar baixa). Devolução gera ajuste/estorno auditável.

---

## 5. Precificação, custo e markup

### 5.1 Conceitos

| Conceito | Definição operacional |
|----------|----------------------|
| **Custo unitário** | Preferência: **custo médio ponderado** após cada compra; fallback: último custo |
| **Preço de venda** | Preço praticado no PDV (pode diferir do sugerido com permissão) |
| **Markup** | `(preço − custo) / custo` |
| **Margem** | `(preço − custo) / preço` |
| **Preço sugerido** | `custo × (1 + markupMeta)` por categoria ou produto |

### 5.2 Regras

1. Compra atualiza custo (médio ou último — configuração por tenant; default = médio).
2. Markup meta pode ser **por categoria** (ex.: Cervejas 35%, Doces 50%).
3. Gestor altera preço; balcão só vende (exceto permissão `produto.editar_preco`).
4. Relatório LUCRO da planilha vira tela/relatório de **margem por produto/categoria/período**.
5. Nunca “chutar” preço na migração: usar última entrada/saída + revisão.

---

## 6. Entregas (requisito novo vs sistema atual)

O legado cobre bem **balcão (PDV)**. Distribuidora exige **entrega**:

| Capacidade | Fase | Descrição |
|------------|------|-----------|
| Venda com flag “entrega” | P1 | Endereço/telefone do cliente, observação |
| Fila do dia | P1 | Lista: pendente / saiu / entregue |
| Baixa de estoque | P1 | Na confirmação da venda (política acima) |
| Pagamento na entrega | P1 | Dinheiro/PIX/fiado no fechamento da entrega |
| Rotas / motorista | P2 | Agrupar por bairro, responsável |
| Taxa de entrega | P2 | Item ou campo na venda |
| Comprovante / assinatura | P3 | Foto/assinatura mobile |

---

## 7. Financeiro e fluxo de caixa

### 7.1 Separar três visões (evitar misturar planilha)

| Visão | Pergunta | Módulo |
|-------|----------|--------|
| **Caixa do dia** | Quanto entrou hoje no balcão (dinheiro/PIX/cartão)? | Caixa operacional |
| **Fiado / clientes** | Quem deve? Quanto? Aging? | Contas a receber |
| **Fluxo de caixa** | Entradas − saídas no período (operacional) | Fluxo de caixa |

### 7.2 Escopo Fase 1–2 (sem virar contabilidade)

- Caixa diário com ledger por forma de pagamento  
- Contas a receber (fiado) com baixa  
- Despesas avulsas / sangrias  
- Contas a pagar simples (compras a prazo) — Fase 2  
- **Fora de escopo inicial:** SPED, plano de contas, conciliação bancária automática  

---

## 8. Relatórios que substituem a planilha

| Relatório | Substitui | Prioridade |
|-----------|-----------|------------|
| Vendas do dia / mês | SAIDA agregada | P0 |
| Estoque atual + mínimos | Controle mental / PROD | P0 |
| Caixa conferido | ABA CAIXA | P0 |
| Margem / markup por produto e categoria | ABA LUCRO | P1 |
| Curva ABC / giro | Decisão de compra | P1 |
| Ruptura / abaixo do mínimo | Operação | P1 |
| Fiado em aberto + aging | Caderno | P1 |
| Entregas do dia | WhatsApp / papel | P1 |
| Compras por fornecedor | ENTRADAS | P1 |
| Fluxo de caixa período | Planilha financeira | P2 |

---

## 9. Personas e jornadas

| Persona | Jornada principal |
|---------|-------------------|
| **Balcão** | Bipe → quantidade → pagar → comprovante |
| **Entregador / expedição** | Fila do dia → sair → entregar → receber |
| **Depósito** | NF-e/compra → conferir volumes → inventário |
| **Compras / gestor** | Ver ruptura e giro → comprar → revisar markup |
| **Sócio** | Caixa, margem, fiado, fluxo da semana |

---

## 10. Requisitos não funcionais do negócio

1. Interface simples — equipe acostumada à planilha.  
2. Funcionar no celular (PWA) no balcão e na rua (entregas).  
3. Rede instável: fila offline de vendas (já existe).  
4. Histórico preservado na migração (conferência de totais).  
5. Um sistema só: acabar com “uma aba por controle”.

---

## 11. Gaps vs sistema atual (resumo executivo)

| Tema | Situação hoje | Ação |
|------|---------------|------|
| Categorias do mix | Campo texto irregular | Seed + cadastro oficial |
| Compras / estoque / vendas / caixa / fiado | Parcialmente ok | Endurecer (Fase 0–1) |
| Custo / markup / precificação | Preço solto; LUCRO só na planilha | Módulo Precificação |
| Entregas | **Inexistente** | Novo módulo |
| Fluxo de caixa amplo | Só caixa diário frágil | Ledger + despesas + período |
| Relatórios de margem/ABC | Fracos | Ampliar Relatórios |

---

## 12. Impacto no roadmap

Complemento à `ARQUITETURA_FORT_BEER_ERP.md`:

| Fase | Inclusões de negócio |
|------|----------------------|
| **0** | Fundação técnica; corrigir caixa; categorias seed |
| **1** | Precificação (custo médio, markup meta, margem); inventário; alertas |
| **1b** | **Entregas** (fila do dia + status + cliente/endereço) |
| **2** | Fluxo de caixa período; contas a pagar; Postgres |
| **3+** | Multi-loja, rotas, SaaS |

---

*Este documento é a fonte de verdade do domínio de negócio Fort Beer para decisões de produto e priorização do ERP.*
