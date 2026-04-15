"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getBoundKingdom } from "@/lib/db";
import { hashKey } from "@/lib/keys";

export async function login(formData: FormData) {
  const key = (formData.get("key") as string)?.trim();
  if (!key) redirect("/login?error=1");

  (await cookies()).set("auth", key, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });

  const keyHash = hashKey(key);
  const boundKingdom = getBoundKingdom(keyHash);
  if (boundKingdom) {
    redirect(`/kingdom/${encodeURIComponent(boundKingdom)}`);
  }
  redirect("/");
}
