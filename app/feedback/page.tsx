"use client";

import React, { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FeedbackForm } from "./FeedbackForm";
import { ReleaseNotes } from "./ReleaseNotes";
import { ArrowLeft, Loader2 } from "lucide-react";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export default function FeedbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "allowed" | "denied">("loading");
  const [supabase] = useState(() =>
    createClient(supabaseUrl, supabaseAnonKey)
  );

  useEffect(() => {
    let cancelled = false;

    async function checkAccess() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) {
        setStatus("denied");
        router.push("/");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("is_founder_vip")
        .eq("id", user.id)
        .maybeSingle();

      if (cancelled) return;
      if (profile?.is_founder_vip !== true) {
        setStatus("denied");
        router.push("/");
        return;
      }
      setStatus("allowed");
    }

    checkAccess();
    return () => {
      cancelled = true;
    };
  }, [supabase, router]);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50">
        <div className="inline-flex items-center gap-2 text-stone-600">
          <Loader2 className="h-5 w-5 animate-spin" strokeWidth={2} />
          <span>Checking access...</span>
        </div>
      </div>
    );
  }

  if (status === "denied") {
    return null;
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-4 px-4 sm:px-6">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-stone-600 transition hover:text-stone-900"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={2} />
            Back to Twizz
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight text-stone-900 sm:text-3xl">
          Beta Feedback
        </h1>
        <p className="mt-2 text-stone-600">
          Hi friends! Thanks for helping me build the app. I'll be reviewing your feedback and posting updates below so you can follow along for the adventure - Wes
        </p>

        <div className="mt-8 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
          <FeedbackForm supabase={supabase} />
        </div>

        <ReleaseNotes />
      </main>
    </div>
  );
}
