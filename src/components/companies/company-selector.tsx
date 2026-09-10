"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ZenithCompany {
  id: string;
  name: string;
}

interface CompanySelectorProps {
  value?: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
}

export function CompanySelector({
  value,
  onChange,
  disabled,
}: CompanySelectorProps) {
  const [companies, setCompanies] = useState<ZenithCompany[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const url = new URL("/api/zenith/companies", window.location.origin);
        // Only loading a single page for simple select
        url.searchParams.set("pageSize", "100");

        const response = await fetch(url.toString());
        if (!response.ok) throw new Error("Failed to load companies");

        const data = await response.json();

        if (active) {
          setCompanies(data);
        }
      } catch (error) {
        console.error(error);
      } finally {
        if (active) setLoading(false);
      }
    }

    load();

    return () => {
      active = false;
    };
  }, []);

  return (
    <Select
      value={value || "unassigned"}
      onValueChange={(val) => onChange(val === "unassigned" ? null : val)}
      disabled={disabled || loading}
    >
      <SelectTrigger>
        <SelectValue placeholder="Selecione uma empresa...">
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Carregando...</span>
            </div>
          ) : (
            companies.find((c) => c.id === value)?.name || "Sem empresa"
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="unassigned" className="text-muted-foreground italic">
          Sem empresa
        </SelectItem>
        {companies.map((company) => (
          <SelectItem key={company.id} value={company.id}>
            {company.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
