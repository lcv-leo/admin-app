// admin-motor — GET /api/financeiro/mp-balance
// Consulta o saldo real da conta Mercado Pago via API de balance.

interface Env {
  MP_ACCESS_TOKEN: string;
}

type BalanceContext = { request: Request; env: Env };

export const onRequestGet = async (context: BalanceContext) => {
  const token = ((context as any).data?.env || context.env).MP_ACCESS_TOKEN;
  if (!token) return Response.json({ available_balance: 0, unavailable_balance: 0 });

  try {
    const res = await fetch('https://api.mercadopago.com/v1/account/balance', {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      console.error(`[MP Balance] API returned ${res.status}: ${await res.text()}`);
      return Response.json({ available_balance: 0, unavailable_balance: 0, error: `MP API ${res.status}` });
    }

    const data = (await res.json()) as {
      available_balance?: number;
      unavailable_balance?: number;
      total_amount?: number;
      currency_id?: string;
    };

    return Response.json({
      available_balance: data.available_balance ?? 0,
      unavailable_balance: data.unavailable_balance ?? 0,
      total_amount: data.total_amount ?? 0,
      currency_id: data.currency_id ?? 'BRL',
    });
  } catch (err) {
    console.error('[MP Balance] Erro ao consultar saldo:', (err as Error).message);
    return Response.json({ available_balance: 0, unavailable_balance: 0 });
  }
};
