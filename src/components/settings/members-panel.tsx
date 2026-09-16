"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

export function MembersPanel() {
  const { accountRole } = useAuth();
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState("agent");
  const [inviting, setInviting] = useState(false);

  const fetchMembers = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/zenith/members");
      const { data, error } = await res.json();
      if (error) throw new Error(error);
      setMembers(data || []);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMembers();
  }, []);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviting(true);
    try {
      const res = await fetch("/api/zenith/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, name: inviteName, role: inviteRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao convidar membro");
      
      toast.success("Membro adicionado com sucesso.");
      setInviteEmail("");
      setInviteName("");
      fetchMembers();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setInviting(false);
    }
  };

  const handleRoleChange = async (id: string, newRole: string) => {
    try {
      const res = await fetch(`/api/zenith/members/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success("Permissão atualizada.");
      fetchMembers();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleRemove = async (id: string) => {
    if (!confirm("Tem certeza que deseja remover este membro?")) return;
    try {
      const res = await fetch(`/api/zenith/members/${id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success("Membro removido.");
      fetchMembers();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const canManage = accountRole === "owner" || accountRole === "admin";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Adicionar Membro</CardTitle>
        </CardHeader>
        <CardContent>
          {!canManage ? (
            <p className="text-sm text-muted-foreground">Você não tem permissão para adicionar membros.</p>
          ) : (
            <form onSubmit={handleInvite} className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-1">
                <label className="text-xs font-medium">Email</label>
                <Input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} required type="email" placeholder="membro@exemplo.com" />
              </div>
              <div className="flex-1 space-y-1">
                <label className="text-xs font-medium">Nome (opcional)</label>
                <Input value={inviteName} onChange={(e) => setInviteName(e.target.value)} placeholder="João Silva" />
              </div>
              <div className="w-full sm:w-32 space-y-1">
                <label className="text-xs font-medium">Permissão</label>
                <Select value={inviteRole} onValueChange={(val) => val && setInviteRole(val)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="viewer">Viewer</SelectItem>
                    <SelectItem value="agent">Agent</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" disabled={inviting}>
                {inviting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Adicionar
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Membros Atuais</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
             <div className="py-4 text-center text-sm text-muted-foreground">Carregando...</div>
          ) : members.length === 0 ? (
             <div className="py-4 text-center text-sm text-muted-foreground">Nenhum membro encontrado.</div>
          ) : (
             <div className="space-y-4">
               {members.map(member => (
                 <div key={member.id} className="flex items-center justify-between border-b pb-2 last:border-0 last:pb-0">
                   <div>
                     <p className="font-medium text-sm">{member.name}</p>
                     <p className="text-xs text-muted-foreground">{member.email}</p>
                   </div>
                   <div className="flex items-center gap-2">
                     <Select 
                       disabled={!canManage} 
                       value={member.role} 
                       onValueChange={(val) => val && handleRoleChange(member.id, val)}
                     >
                       <SelectTrigger className="w-28 h-8 text-xs">
                         <SelectValue />
                       </SelectTrigger>
                       <SelectContent>
                         <SelectItem value="viewer">Viewer</SelectItem>
                         <SelectItem value="agent">Agent</SelectItem>
                         <SelectItem value="admin">Admin</SelectItem>
                         <SelectItem value="owner">Owner</SelectItem>
                       </SelectContent>
                     </Select>
                     {canManage && (
                       <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => handleRemove(member.id)}>
                         <Trash2 className="h-4 w-4" />
                       </Button>
                     )}
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
