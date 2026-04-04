import { proxyToAdminMotor } from '../_lib/admin-motor-proxy';

type PagesContext = {
  request: Request;
  env: {
    ADMIN_MOTOR?: Fetcher;
  };
};

type Fetcher = {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
};

export async function onRequestGet(context: PagesContext): Promise<Response> {
  return proxyToAdminMotor(context.request, context.env.ADMIN_MOTOR);
}

export async function onRequestPut(context: PagesContext): Promise<Response> {
  return proxyToAdminMotor(context.request, context.env.ADMIN_MOTOR);
}