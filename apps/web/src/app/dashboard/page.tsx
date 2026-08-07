"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, logoutRequest, type AuthUser } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [health, setHealth] = useState<string>("…");

  useEffect(() => {
    (async () => {
      try {
        const me = await apiFetch<{ user: AuthUser }>("/auth/me");
        setUser(me.user);
      } catch {
        router.replace("/");
        return;
      }
      try {
        const h = await apiFetch<{
          status: string;
          db: boolean;
          redis: boolean;
        }>("/health");
        setHealth(
          `${h.status} · DB ${h.db ? "ok" : "down"} · Redis ${h.redis ? "ok" : "off"}`,
        );
      } catch {
        setHealth("indisponível");
      }
    })();
  }, [router]);

  async function sair() {
    await logoutRequest();
    router.replace("/");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-[var(--accent)]">FORT BEER ERP</p>
          <h1 className="text-3xl font-semibold text-[var(--brand)]">Dashboard</h1>
        </div>
        <Button variant="outline" onClick={sair}>
          Sair
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Fase 1 — modelo de dados</CardTitle>
          <CardDescription>
            Empresa, catálogo SKU, pedidos, estoque e financeiro no Postgres.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <strong>Usuário:</strong> {user?.nome ?? "…"} ({user?.perfil ?? "…"})
          </p>
          <p>
            <strong>Login:</strong> {user?.login ?? "…"}
          </p>
          <p>
            <strong>Empresa:</strong> {user?.empresaNome ?? user?.empresaId ?? "…"}
          </p>
          <p>
            <strong>API health:</strong> {health}
          </p>
          <p className="text-neutral-600">
            Próximo: APIs de catálogo, pedido/PDV, estoque e compras sobre este
            modelo.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
