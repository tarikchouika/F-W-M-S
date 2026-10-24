// HRMP — Webhook بوت تيليغرام (أوامر المشرف فقط)
// يُضبط عبر setWebhook مع secret_token؛ لا يستقبل أي أمر من غير المشرف.
import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

declare const process: { env: Record<string, string | undefined> };
const env = process.env;
import { db } from "@/lib/db";
import { sendTelegramTo } from "@/lib/telegram";
import { APP_VERSION } from "@/lib/version";

export const runtime = "nodejs";

function sameSecret(received: string | null): boolean {
  const expected = env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected || !received) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function pendingSeekersCount(): Promise<number> {
  return db.jobSeeker.count({
    where: {
      status: "pending",
      emailVerifiedAt: { not: null },
      phoneVerifiedAt: { not: null },
      documentType: { not: null },
    },
  });
}

export async function POST(req: NextRequest) {
  if (!sameSecret(req.headers.get("x-telegram-bot-api-secret-token"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const update = await req.json().catch(() => null);
  const message = update?.message;
  const chatId = message?.chat?.id ? String(message.chat.id) : null;
  const text = typeof message?.text === "string" ? message.text.trim() : "";
  const adminId = env.TELEGRAM_ADMIN_CHAT_ID;

  // أي محادثة غير محادثة المشرف تُتجاهل بهدوء (لا رد يكشف وجود البوت)
  if (!chatId || !adminId || chatId !== adminId) {
    return NextResponse.json({ ok: true });
  }

  const command = text.split(/\s+/)[0].toLowerCase();

  if (command === "/start") {
    await sendTelegramTo(
      chatId,
      [
        "✅ HRMP Bot — متصل",
        `chat_id: ${chatId}`,
        "الأوامر: /pending · /status · /help",
        "ستصلك إشعارات الباحثين الجاهزين للمصادقة تلقائيًا.",
      ].join("\n")
    );
  } else if (command === "/pending") {
    const count = await pendingSeekersCount();
    await sendTelegramTo(
      chatId,
      `📋 بانتظار المصادقة: ${count}\nhttps://hrmp.pages.dev/dashboard/seekers`
    );
  } else if (command === "/status") {
    const count = await pendingSeekersCount();
    await sendTelegramTo(
      chatId,
      `HRMP v${APP_VERSION}\nالحالة: يعمل ✅\nبانتظار المصادقة: ${count}\nالوقت: ${new Date().toISOString()}`
    );
  } else {
    await sendTelegramTo(chatId, "الأوامر المتاحة: /pending · /status · /help");
  }

  // نرد 200 دائمًا كي لا يعيد تيليغرام المحاولة
  return NextResponse.json({ ok: true });
}
