import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const CATEGORIAS = [
  'Cervejas',
  'Refrigerantes',
  'Energéticos',
  'Águas',
  'Destilados',
  'Doses',
  'Vinhos',
  'Cigarros',
  'Palheiros',
  'Fumos',
  'Doces',
  'Salgados',
  'Gelo',
  'Carvão',
  'Essências',
  'Produtos de conveniência',
];

const PERMISSOES = [
  { codigo: 'venda.criar', nome: 'Criar pedido/venda', modulo: 'vendas' },
  { codigo: 'venda.cancelar', nome: 'Cancelar pedido', modulo: 'vendas' },
  { codigo: 'compra.criar', nome: 'Lançar compra', modulo: 'compras' },
  { codigo: 'estoque.ver', nome: 'Ver estoque', modulo: 'estoque' },
  { codigo: 'estoque.ajustar', nome: 'Ajustar estoque', modulo: 'estoque' },
  { codigo: 'caixa.fechar', nome: 'Fechar caixa', modulo: 'financeiro' },
  { codigo: 'financeiro.ver', nome: 'Ver financeiro', modulo: 'financeiro' },
  { codigo: 'produto.editar_preco', nome: 'Editar preço', modulo: 'catalogo' },
  { codigo: 'relatorio.ver', nome: 'Ver relatórios', modulo: 'relatorios' },
  { codigo: 'admin.usuarios', nome: 'Gerir usuários', modulo: 'admin' },
];

const FORMAS = [
  { codigo: 'DINHEIRO', nome: 'Dinheiro', tipo: 'DINHEIRO', geraCaixa: true, ordem: 1 },
  { codigo: 'PIX', nome: 'PIX', tipo: 'PIX', geraCaixa: true, ordem: 2 },
  { codigo: 'CARTAO_DEBITO', nome: 'Cartão débito', tipo: 'CARTAO', geraCaixa: true, ordem: 3 },
  { codigo: 'CARTAO_CREDITO', nome: 'Cartão crédito', tipo: 'CARTAO', geraCaixa: true, ordem: 4 },
  { codigo: 'FIADO', nome: 'Fiado', tipo: 'FIADO', geraCaixa: false, ordem: 5 },
];

function normalizar(s: string) {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

async function main() {
  for (const p of PERMISSOES) {
    await prisma.permissao.upsert({
      where: { codigo: p.codigo },
      update: { nome: p.nome, modulo: p.modulo },
      create: p,
    });
  }

  const empresa = await prisma.empresa.upsert({
    where: { slug: 'fort-beer' },
    update: {},
    create: {
      slug: 'fort-beer',
      nome: 'Fort Beer',
    },
  });

  const perfilGestor = await prisma.perfil.upsert({
    where: { empresaId_codigo: { empresaId: empresa.id, codigo: 'GESTOR' } },
    update: { nome: 'Gestor' },
    create: {
      empresaId: empresa.id,
      codigo: 'GESTOR',
      nome: 'Gestor',
      sistema: true,
    },
  });

  const perfilBalcao = await prisma.perfil.upsert({
    where: { empresaId_codigo: { empresaId: empresa.id, codigo: 'BALCAO' } },
    update: { nome: 'Balcão' },
    create: {
      empresaId: empresa.id,
      codigo: 'BALCAO',
      nome: 'Balcão',
      sistema: true,
    },
  });

  const perfilDeposito = await prisma.perfil.upsert({
    where: { empresaId_codigo: { empresaId: empresa.id, codigo: 'DEPOSITO' } },
    update: { nome: 'Depósito' },
    create: {
      empresaId: empresa.id,
      codigo: 'DEPOSITO',
      nome: 'Depósito',
      sistema: true,
    },
  });

  const allPerms = await prisma.permissao.findMany();
  for (const perm of allPerms) {
    await prisma.perfilPermissao.upsert({
      where: {
        perfilId_permissaoId: {
          perfilId: perfilGestor.id,
          permissaoId: perm.id,
        },
      },
      update: {},
      create: { perfilId: perfilGestor.id, permissaoId: perm.id },
    });
  }

  const balcaoCodes = ['venda.criar', 'estoque.ver', 'produto.editar_preco'];
  for (const codigo of balcaoCodes) {
    const perm = allPerms.find((p) => p.codigo === codigo);
    if (!perm) continue;
    await prisma.perfilPermissao.upsert({
      where: {
        perfilId_permissaoId: {
          perfilId: perfilBalcao.id,
          permissaoId: perm.id,
        },
      },
      update: {},
      create: { perfilId: perfilBalcao.id, permissaoId: perm.id },
    });
  }

  const depositoCodes = ['estoque.ver', 'estoque.ajustar', 'compra.criar'];
  for (const codigo of depositoCodes) {
    const perm = allPerms.find((p) => p.codigo === codigo);
    if (!perm) continue;
    await prisma.perfilPermissao.upsert({
      where: {
        perfilId_permissaoId: {
          perfilId: perfilDeposito.id,
          permissaoId: perm.id,
        },
      },
      update: {},
      create: { perfilId: perfilDeposito.id, permissaoId: perm.id },
    });
  }

  const senhaHash = await bcrypt.hash('1234', 10);

  const gestor = await prisma.usuario.upsert({
    where: { login: 'gestor' },
    update: {},
    create: {
      nome: 'Gestor',
      login: 'gestor',
      senhaHash,
    },
  });

  const balcao = await prisma.usuario.upsert({
    where: { login: 'balcao' },
    update: {},
    create: {
      nome: 'Balcão',
      login: 'balcao',
      senhaHash,
    },
  });

  await prisma.usuarioEmpresa.upsert({
    where: {
      usuarioId_empresaId: { usuarioId: gestor.id, empresaId: empresa.id },
    },
    update: { perfilId: perfilGestor.id, ativo: true },
    create: {
      usuarioId: gestor.id,
      empresaId: empresa.id,
      perfilId: perfilGestor.id,
    },
  });

  await prisma.usuarioEmpresa.upsert({
    where: {
      usuarioId_empresaId: { usuarioId: balcao.id, empresaId: empresa.id },
    },
    update: { perfilId: perfilBalcao.id, ativo: true },
    create: {
      usuarioId: balcao.id,
      empresaId: empresa.id,
      perfilId: perfilBalcao.id,
    },
  });

  let ordem = 0;
  for (const nome of CATEGORIAS) {
    const nomeNorm = normalizar(nome);
    await prisma.categoria.upsert({
      where: { empresaId_nomeNorm: { empresaId: empresa.id, nomeNorm } },
      update: { nome, ordem },
      create: {
        empresaId: empresa.id,
        nome,
        nomeNorm,
        ordem,
        markupMeta: 0.35,
      },
    });
    ordem += 1;
  }

  for (const f of FORMAS) {
    await prisma.formaPagamento.upsert({
      where: { empresaId_codigo: { empresaId: empresa.id, codigo: f.codigo } },
      update: { nome: f.nome, tipo: f.tipo, geraCaixa: f.geraCaixa, ordem: f.ordem },
      create: { empresaId: empresa.id, ...f },
    });
  }

  await prisma.estoqueLocal.upsert({
    where: { empresaId_nome: { empresaId: empresa.id, nome: 'Depósito Principal' } },
    update: {},
    create: {
      empresaId: empresa.id,
      nome: 'Depósito Principal',
      tipo: 'DEPOSITO',
    },
  });

  await prisma.contaFinanceira.upsert({
    where: { empresaId_nome: { empresaId: empresa.id, nome: 'Caixa Loja' } },
    update: {},
    create: {
      empresaId: empresa.id,
      nome: 'Caixa Loja',
      tipo: 'CAIXA',
    },
  });

  await prisma.centroCusto.upsert({
    where: { empresaId_codigo: { empresaId: empresa.id, codigo: 'OPER' } },
    update: {},
    create: {
      empresaId: empresa.id,
      codigo: 'OPER',
      nome: 'Operacional',
    },
  });

  console.log(
    'Seed OK — Empresa fort-beer, perfis GESTOR/BALCAO/DEPOSITO, gestor/balcao (1234), categorias, formas, estoque e caixa.',
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
