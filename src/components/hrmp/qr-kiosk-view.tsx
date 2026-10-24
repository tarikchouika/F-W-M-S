"use client";

// HRMP — شاشة رمز QR للموقع (المرحلة 4 — SPEC §4.2): «يتجدد من لوحة الموقع أو شاشة عند الباب»
// تتحدث تلقائياً قبل انتهاء الصلاحية؛ الرمز موقَّع HMAC بلا حالة في الخادم ولا يُخزَّن
import { useCallback, useEffect, useRef, useState } from "react";
import { LoaderCircle, MapPin, RefreshCcw, Timer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/i18n/provider";
import { apiRequest } from "@/components/hrmp/org-bits";

type QrResponse = {
  site: { id: string; name: string };
  token: string;
  expiresAt: string;
  ttlSeconds: number;
  qrSvg: string;
};

export function SiteQrKiosk({ siteId }: { siteId: string }) {
  const { t } = useI18n();

  const [data, setData] = useState<QrResponse | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await apiRequest<QrResponse>(`/api/sites/${siteId}/qr-token`);
      setData(res);
      setSecondsLeft(res.ttlSeconds);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    void load();
  }, [load]);

  // عدّاد تنازلي + تحديث تلقائي قبل انتهاء الصلاحية بـ 5 ثوان
  useEffect(() => {
    if (!data) return;
    timerRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 6) {
          void load();
          return data.ttlSeconds;
        }
        return s - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [data, load]);

  const urgent = secondsLeft <= 15;

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col items-center gap-6 py-6">
      <Card className="w-full border-primary/30">
        <CardHeader className="pb-2 text-center">
          <CardTitle className="flex items-center justify-center gap-2 text-lg">
            <MapPin className="size-5 text-primary" aria-hidden />
            {data?.site.name ?? t("qr.siteQr")}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          {loading && !data && (
            <div className="flex h-72 w-72 items-center justify-center rounded-xl border border-dashed">
              <LoaderCircle className="size-8 animate-spin text-muted-foreground" aria-hidden />
            </div>
          )}
          {error && (
            <div className="flex flex-col items-center gap-3 py-8">
              <p className="text-sm text-destructive">{t("common.operationFailed")}</p>
              <Button variant="outline" onClick={() => void load()} className="gap-1.5">
                <RefreshCcw className="size-4" aria-hidden />
                {t("common.retry")}
              </Button>
            </div>
          )}
          {!error && data && (
            <>
              <div
                className="flex size-72 items-center justify-center rounded-xl border bg-white p-3 [&>svg]:size-full dark:bg-white"
                aria-label={t("qr.qrImage")}
                dangerouslySetInnerHTML={{ __html: data.qrSvg }}
              />
              <Badge
                variant={urgent ? "destructive" : "secondary"}
                className="gap-1.5 tabular-nums"
              >
                <Timer className="size-3.5" aria-hidden />
                {t("qr.expiresIn")}: {secondsLeft} {t("myAttendance.seconds")}
              </Badge>
              <p className="text-center text-xs leading-relaxed text-muted-foreground">
                {t("qr.kioskNote")}
              </p>
              <code dir="ltr" className="max-w-full truncate rounded bg-muted px-2 py-1 font-mono text-[10px] text-muted-foreground">
                {data.token}
              </code>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
