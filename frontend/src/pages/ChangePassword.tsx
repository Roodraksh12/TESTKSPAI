"use client";

import { useNavigate } from "react-router-dom";
import { useState, type FormEvent } from "react";
import { apiRequest, clearAuthStorage } from "@/api/client";
import { useAuth } from "@/context/AuthContext";
import { Button, Input } from "@/components/scrb/primitives";
import { SealMark } from "@/components/scrb/insignia";

export default function ChangePasswordPage() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await apiRequest("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ newPassword: password }),
      });
      clearAuthStorage();
      logout();
      navigate("/login", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update password");
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen grid place-items-center bg-background p-6">
      <div className="w-full max-w-md rounded-2xl border border-hairline bg-surface p-8 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <SealMark size={28} />
          <div>
            <h1 className="text-lg font-semibold">Set a new password</h1>
            <p className="text-xs text-muted-foreground">
              You must change your temporary password before using SCRB Sahayak.
            </p>
          </div>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">New password</label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Confirm password</label>
            <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="mt-1" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? "Saving…" : "Save and sign in again"}
          </Button>
        </form>
      </div>
    </main>
  );
}
