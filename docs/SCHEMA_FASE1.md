# Modelo de Dados — Fase 1

Entidades oficiais do FORT BEER ERP (lista solicitada; duplicatas removidas).

## Diagrama lógico

```
Empresa
  ├── UsuarioEmpresa → Usuario + Perfil
  │                      Perfil → PerfilPermissao → Permissao
  ├── Categoria → Produto → ProdutoSKU
  ├── Fornecedor → Compra → ItemCompra (SKU)
  ├── Cliente → Pedido → ItemPedido (SKU)
  ├── FormaPagamento
  ├── EstoqueLocal → EstoqueProduto (SKU) + MovimentacaoEstoque
  ├── ContaFinanceira → LancamentoFinanceiro
  └── CentroCusto → Despesa
```

## Regras

| Tema | Regra |
|------|-------|
| Multi-empresa | Quase tudo leva `empresaId` (exceto `Usuario`, `Permissao`, `RefreshToken`) |
| Estoque | Digitado **nunca**; `EstoqueProduto.quantidade` é saldo materializado; `MovimentacaoEstoque` registra ENTRADA/SAIDA/AJUSTE |
| SKU | Preço/custo/EAN/unidade ficam em `ProdutoSKU`; `Produto` é o item “de catálogo” |
| Pedido | Substitui “Venda”; `tipo` BALCAO\|ENTREGA; `chaveIdempotente` para PDV offline |
| Fiado | `FormaPagamento.geraCaixa=false` + `Cliente.saldoFiado` |
| Financeiro | `LancamentoFinanceiro` na conta; `Despesa` com `CentroCusto` opcional |

## Status / enums (String)

- Compra.status: `RASCUNHO` \| `CONFIRMADA` \| `CANCELADA`
- Pedido.status: `RASCUNHO` \| `CONFIRMADO` \| `SAIU` \| `ENTREGUE` \| `CANCELADO`
- Pedido.tipo: `BALCAO` \| `ENTREGA`
- MovimentacaoEstoque.tipo: `ENTRADA` \| `SAIDA` \| `AJUSTE` \| `TRANSFERENCIA`
- LancamentoFinanceiro.tipo: `ENTRADA` \| `SAIDA`
- FormaPagamento.tipo: `DINHEIRO` \| `PIX` \| `CARTAO` \| `FIADO` \| `OUTRO`

## Seed padrão

- Empresa `fort-beer`
- Perfis: GESTOR (todas permissões), BALCAO, DEPOSITO
- Usuários: `gestor` / `balcao` (senha `1234`)
- 16 categorias do mix
- Formas de pagamento, Depósito Principal, Caixa Loja, Centro OPER
