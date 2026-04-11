// admin-motor — GET /api/financeiro/mp-balance
// Consulta saldo / receita Mercado Pago.
//
// Estratégia:
// 1. Tenta GET /users/me — em contas com saldo visível, retorna available_balance
// 2. Fallback: soma pagamentos via /v1/payments/search com paginação completa,
//    usando net_received_amount (líquido de taxas)

interface Env {
  MP_ACCESS_TOKEN: string;
}

type BalanceContext = { request: Request; env: Env };

const FINANCIAL_CUTOFF = '2026-03-01';
const MP_API = 'https://api.mercadopago.com';

async function tryUserBalance(token: string): Promise<{ available_balance: number; unavailable_balance: number } | null> {
  try {
    const res = await fetch(`${MP_API}/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    // Some MP accounts expose balance fields on /users/me
    if (typeof data.available_balance === 'number') {
      return {
        available_balance: data.available_balance as number,
        unavailable_balance: (data.unavailable_balance as number) ?? 0,
      };
    }
    return null;
  } catch {
    return null;
  }
}

async function fetchAllPayments(
  token: string,
  status: string,
  startDate: string,
): Promise<Array<{ transaction_amount?: number; net_received_amount?: number }>> {
  const all: Array<{ transaction_amount?: number; net_received_amount?: number }> = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const url = `${MP_API}/v1/payments/search?status=${status}&begin_date=${startDate}T00:00:00-03:00&limit=${limit}&offset=${offset}&sort=date_created&criteria=desc`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) break;

    const data = (await res.json()) as {
      results?: Array<{ transaction_amount?: number; net_received_amount?: number }>;
      paging?: { total?: number };
    };

    const results = data.results || [];
    all.push(...results);

    const total = data.paging?.total ?? 0;
    offset += limit;
    if (offset >= total || results.length === 0) break;
  }

  return all;
}

export const onRequestGet = async (context: BalanceContext) => {
  const token = ((context as any).data?.env || context.env).MP_ACCESS_TOKEN;
  if (!token) return Response.json({ available_balance: 0, unavailable_balance: 0 });

  // Strategy 1: /users/me may return real account balance
  const userBalance = await tryUserBalance(token);
  if (userBalance) {
    return Response.json({ ...userBalance, source: 'account' });
  }

  // Strategy 2: Sum payments with full pagination
  const url = new URL(context.request.url);
  const rawStart = url.searchParams.get('start_date') || FINANCIAL_CUTOFF;
  const startDate = rawStart < FINANCIAL_CUTOFF ? FINANCIAL_CUTOFF : rawStart;

  try {
    const [approved, pending, inProcess] = await Promise.all([
      fetchAllPayments(token, 'approved', startDate),
      fetchAllPayments(token, 'pending', startDate),
      fetchAllPayments(token, 'in_process', startDate),
    ]);

    const sumNet = (results: Array<{ transaction_amount?: number; net_received_amount?: number }>) =>
      results.reduce((sum, tx) => sum + Number(tx?.net_received_amount ?? tx?.transaction_amount ?? 0), 0);

    const sumGross = (results: Array<{ transaction_amount?: number }>) =>
      results.reduce((sum, tx) => sum + Number(tx?.transaction_amount ?? 0), 0);

    return Response.json({
      available_balance: Math.round(sumNet(approved) * 100) / 100,
      unavailable_balance: Math.round(sumGross([...pending, ...inProcess]) * 100) / 100,
      source: 'payments',
      counts: { approved: approved.length, pending: pending.length, in_process: inProcess.length },
    });
  } catch (err) {
    console.error('[MP Balance] Erro ao consultar saldo:', (err as Error).message);
    return Response.json({ available_balance: 0, unavailable_balance: 0 });
  }
};
