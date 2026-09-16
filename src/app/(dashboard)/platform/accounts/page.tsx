"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, ShieldAlert } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function PlatformAccountsPage() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<any[]>([]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [accRes, planRes] = await Promise.all([
        fetch("/api/platform/accounts"),
        fetch("/api/platform/plans"),
      ]);
      const accData = await accRes.json();
      const planData = await planRes.json();
      
      if (!accRes.ok) throw new Error(accData.error || "Erro ao carregar contas");
      
      setAccounts(accData.data || []);
      setPlans(planData.data || []);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleUpdate = async (id: string, updates: any) => {
    try {
      const res = await fetch(`/api/platform/accounts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success("Conta atualizada com sucesso");
      fetchData();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-2 text-2xl font-bold text-red-600">
        <ShieldAlert className="h-8 w-8" />
        Superadmin: Gestão de Plataforma
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Tenants (Contas)</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
             <div className="py-8 flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : accounts.length === 0 ? (
             <div className="py-8 text-center text-muted-foreground">Nenhuma conta encontrada.</div>
          ) : (
            <div className="space-y-4">
              {accounts.map(acc => (
                <div key={acc.id} className="border p-4 rounded-lg flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div>
                    <h3 className="font-bold text-lg">{acc.name}</h3>
                    <p className="text-sm text-muted-foreground">ID: {acc.id}</p>
                    <p className="text-sm text-muted-foreground">Dono: {acc.ownerName} ({acc.ownerEmail})</p>
                    <p className="text-sm">Criado em: {new Date(acc.createdAt).toLocaleDateString("pt-BR")}</p>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-medium">Plano</label>
                      <Select value={acc.planId || "none"} onValueChange={(val) => handleUpdate(acc.id, { planId: val === "none" ? null : val })}>
                        <SelectTrigger className="w-32 h-8 text-xs">
                          <SelectValue placeholder="Sem plano" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Nenhum</SelectItem>
                          {plans.map(p => (
                             <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-medium">Status</label>
                      <Select value={acc.status} onValueChange={(val) => handleUpdate(acc.id, { status: val })}>
                        <SelectTrigger className="w-32 h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Ativo</SelectItem>
                          <SelectItem value="suspended">Suspenso</SelectItem>
                          <SelectItem value="disabled">Desativado</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
