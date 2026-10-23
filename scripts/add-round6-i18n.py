#!/usr/bin/env python3
# FWMS — إضافة مفاتيح i18n للجولة السادسة (بلاغ المالك 2026-10-24) ×4 لغات
# 1) reports: أعطال التوليد (اختيار العامل إلزامي + تأهيل التصريح + رسائل خطأ محددة)
# 2) voice: الاتصال المباشر (شاشة الاحترافية كاملة) + الصوتيات المؤقتة
import json
from collections import OrderedDict

BASE = "/home/z/my-project/fwms/src/i18n/dictionaries"

# reports: مفاتيح أعطال توليد المستندات
REPORTS = {
    "ar": {
        "workerRequired": "اختر العامل أولًا",
        "workerRequiredHint": "اختيار العامل إلزامي لبيان الحضور والساعات — الزر يُفعَّل بعد الاختيار",
        "periodRequired": "اختر الفترة",
        "noDeclarations": "لا توجد تصاريح بعد — أنشئ تصريحًا من صفحة التصاريح أولًا ثم اعتمده",
        "declarationRequired": "اختر تصريحًا",
        "declarationEligibleHint": "تقرير المطابقة يتطلب تصريحًا معتمدًا أو مُصدَّرًا أو مُودَعًا — الحالات الأخرى تظهر معطلة",
        "workerMissing": "العامل المختار غير موجود في هذه الشركة — أعد الاختيار",
        "declarationNotApproved": "تقرير المطابقة يتطلب تصريحًا معتمدًا — اعتمد التصريح أولًا من صفحة التصاريح",
    },
    "fr": {
        "workerRequired": "Choisir d'abord le travailleur",
        "workerRequiredHint": "Le choix du travailleur est obligatoire pour l'attestation de présence et des heures — le bouton s'active après la sélection",
        "periodRequired": "Choisir la période",
        "noDeclarations": "Aucune déclaration pour l'instant — créez une déclaration puis faites-la approuver",
        "declarationRequired": "Choisir une déclaration",
        "declarationEligibleHint": "Le rapport de conformité exige une déclaration approuvée, exportée ou déposée — les autres statuts sont désactivés",
        "workerMissing": "Le travailleur choisi n'appartient pas à cette société — resélectionnez",
        "declarationNotApproved": "Le rapport de conformité exige une déclaration approuvée — approuvez-la d'abord",
    },
    "en": {
        "workerRequired": "Select a worker first",
        "workerRequiredHint": "Selecting a worker is required for the attendance and hours statements — the button activates after selection",
        "periodRequired": "Select a period",
        "noDeclarations": "No declarations yet — create one from the declarations page and get it approved first",
        "declarationRequired": "Select a declaration",
        "declarationEligibleHint": "The compliance report requires an approved, exported or filed declaration — other statuses are disabled",
        "workerMissing": "The selected worker is not in this company — choose again",
        "declarationNotApproved": "The compliance report requires an approved declaration — approve it first",
    },
    "es": {
        "workerRequired": "Selecciona primero el trabajador",
        "workerRequiredHint": "Elegir trabajador es obligatorio para el certificado de asistencia y horas — el botón se activa tras la selección",
        "periodRequired": "Selecciona el período",
        "noDeclarations": "Aún no hay declaraciones — crea una y apruébala primero",
        "declarationRequired": "Selecciona una declaración",
        "declarationEligibleHint": "El informe de conformidad requiere una declaración aprobada, exportada o presentada — los demás estados quedan deshabilitados",
        "workerMissing": "El trabajador elegido no pertenece a esta empresa — vuelve a elegir",
        "declarationNotApproved": "El informe de conformidad requiere una declaración aprobada — apruébala primero",
    },
}

# voice: الاتصال المباشر + الصوتيات المؤقتة
VOICE = {
    "ar": {
        "callAudio": "اتصال صوتي مباشر",
        "callVideo": "اتصال مرئي مباشر",
        "callRequesting": "جارٍ تجهيز الاتصال…",
        "callRinging": "جارٍ الرن…",
        "callIncoming": "اتصال وارد",
        "callConnecting": "جارٍ التوصيل…",
        "callEnded": "انتهى الاتصال",
        "callDeclined": "تم رفض الاتصال",
        "callFailed": "تعذّر إتمام الاتصال",
        "callBusy": "الطرف الآخر مشغول بمكالمة أخرى",
        "callMediaDenied": "يجب السماح بالوصول إلى الميكروفون والكاميرا",
        "callForbidden": "لا يمكنك الاتصال بهذا المستخدم حسب الصلاحيات",
        "callRateLimited": "محاولات كثيرة — حاول بعد قليل",
        "callAccept": "قبول الاتصال",
        "callDecline": "رفض الاتصال",
        "callHangup": "إنهاء الاتصال",
        "callMute": "كتم الصوت",
        "callUnmute": "إلغاء الكتم",
        "callCamOn": "تشغيل الكاميرا",
        "callCamOff": "إطفاء الكاميرا",
        "callP2pNote": "مشفّر مباشرة بين الجهازين — لا يُخزَّن في المنصة",
        "callUnknown": "مستخدم",
        "purgedBadge": "استُهلكت ومُسحت",
        "ephemeralNote": "الرسائل الصوتية مؤقتة: تُمسح بعد استماع المستقبِل أو خلال 72 ساعة",
    },
    "fr": {
        "callAudio": "Appel audio direct",
        "callVideo": "Appel vidéo direct",
        "callRequesting": "Préparation de l'appel…",
        "callRinging": "Sonnerie en cours…",
        "callIncoming": "Appel entrant",
        "callConnecting": "Connexion en cours…",
        "callEnded": "Appel terminé",
        "callDeclined": "Appel refusé",
        "callFailed": "Impossible d'établir l'appel",
        "callBusy": "Le correspondant est en ligne sur un autre appel",
        "callMediaDenied": "Autorisez l'accès au microphone et à la caméra",
        "callForbidden": "Vous ne pouvez pas appeler cet utilisateur (permissions)",
        "callRateLimited": "Trop de tentatives — réessayez dans un instant",
        "callAccept": "Accepter l'appel",
        "callDecline": "Refuser l'appel",
        "callHangup": "Raccrocher",
        "callMute": "Couper le micro",
        "callUnmute": "Activer le micro",
        "callCamOn": "Allumer la caméra",
        "callCamOff": "Éteindre la caméra",
        "callP2pNote": "Chiffré directement entre les deux appareils — jamais stocké",
        "callUnknown": "Utilisateur",
        "purgedBadge": "Consommée et effacée",
        "ephemeralNote": "Les messages vocaux sont éphémères : effacés après écoute du destinataire ou au bout de 72 h",
    },
    "en": {
        "callAudio": "Direct audio call",
        "callVideo": "Direct video call",
        "callRequesting": "Preparing the call…",
        "callRinging": "Ringing…",
        "callIncoming": "Incoming call",
        "callConnecting": "Connecting…",
        "callEnded": "Call ended",
        "callDeclined": "Call declined",
        "callFailed": "Could not establish the call",
        "callBusy": "The other person is busy on another call",
        "callMediaDenied": "Please allow microphone and camera access",
        "callForbidden": "You cannot call this user (permissions)",
        "callRateLimited": "Too many attempts — try again shortly",
        "callAccept": "Accept call",
        "callDecline": "Decline call",
        "callHangup": "Hang up",
        "callMute": "Mute",
        "callUnmute": "Unmute",
        "callCamOn": "Turn camera on",
        "callCamOff": "Turn camera off",
        "callP2pNote": "Encrypted directly between the two devices — never stored",
        "callUnknown": "User",
        "purgedBadge": "Consumed and erased",
        "ephemeralNote": "Voice messages are ephemeral: erased after the recipient listens or within 72 hours",
    },
    "es": {
        "callAudio": "Llamada de audio directa",
        "callVideo": "Llamada de vídeo directa",
        "callRequesting": "Preparando la llamada…",
        "callRinging": "Sonando…",
        "callIncoming": "Llamada entrante",
        "callConnecting": "Conectando…",
        "callEnded": "Llamada finalizada",
        "callDeclined": "Llamada rechazada",
        "callFailed": "No se pudo establecer la llamada",
        "callBusy": "La otra persona está en otra llamada",
        "callMediaDenied": "Permite el acceso al micrófono y a la cámara",
        "callForbidden": "No puedes llamar a este usuario (permisos)",
        "callRateLimited": "Demasiados intentos — inténtalo en un momento",
        "callAccept": "Aceptar llamada",
        "callDecline": "Rechazar llamada",
        "callHangup": "Colgar",
        "callMute": "Silenciar",
        "callUnmute": "Activar micrófono",
        "callCamOn": "Encender cámara",
        "callCamOff": "Apagar cámara",
        "callP2pNote": "Cifrado directamente entre los dos dispositivos — nunca se almacena",
        "callUnknown": "Usuario",
        "purgedBadge": "Consumido y borrado",
        "ephemeralNote": "Los mensajes de voz son efímeros: se borran tras escucharlos el destinatario o en 72 horas",
    },
}

for locale in ["ar", "fr", "en", "es"]:
    path = f"{BASE}/{locale}.json"
    with open(path, encoding="utf-8") as f:
        data = json.load(f, object_pairs_hook=OrderedDict)

    rep = data.setdefault("reports", OrderedDict())
    for k, v in REPORTS[locale].items():
        if k not in rep:
            rep[k] = v

    voc = data.setdefault("voice", OrderedDict())
    for k, v in VOICE[locale].items():
        if k not in voc:
            voc[k] = v

    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"✓ {locale}: reports +{len(REPORTS[locale])} · voice +{len(VOICE[locale])}")

print("تمت إضافة المفاتيح للغات الأربع")
