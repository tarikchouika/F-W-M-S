#!/usr/bin/env python3
# HRMP — إضافة مفاتيح i18n للمرحلة 9 (v0.10.0) إلى القواميس الأربع معًا
# (قاعدة CI: أي نقص في لغة = فشل). يعمل مرة واحدة؛ idempotent بمفتاح موجود.
import json, sys
from pathlib import Path

BASE = Path("src/i18n/dictionaries")
LANGS = ["ar", "fr", "en", "es"]

# (قسم، مفتاح) → الترجمات بالترتيب ar, fr, en, es
ADD = {
    # ── dashboard ──
    ("dashboard", "teamPresence"): ("حضور الفرق الميداني", "Présence des équipes", "Team presence", "Presencia de equipos"),
    ("dashboard", "voice"): ("الرسائل الصوتية", "Messages vocaux", "Voice messages", "Mensajes de voz"),
    ("dashboard", "openMenu"): ("فتح القائمة", "Ouvrir le menu", "Open menu", "Abrir el menú"),
    ("dashboard", "phaseNoteBody"): (
        "المنصة مكتملة بكل مراحلها (0–8): الحضور بالتحقق الجغرافي، الجدولة والتغطية، محرك الأجور والاقتطاعات القانونية، المسارات والتصاريح الرسمية، التقارير بأربع لغات، ونقل الملكية — وتضيف هذه الجولة الفرق الميدانية بمسمياتها الوظيفية والرسائل الصوتية والتتبع الأني. الإصدار الحالي:",
        "La plateforme est complète, toutes phases confondues (0–8) : présence avec vérification géographique, planification et couverture, moteur de paie et retenues légales, régimes et déclarations officielles, rapports en quatre langues, transfert de propriété — et cette version ajoute les équipes de terrain avec leurs intitulés, les messages vocaux et le suivi en direct. Version actuelle :",
        "The platform is complete across all phases (0–8): geo-verified attendance, scheduling and coverage, the payroll engine with legal deductions, regimes and official declarations, reports in four languages, ownership transfer — and this release adds field teams with job titles, voice messaging, and live presence tracking. Current version:",
        "La plataforma está completa en todas sus fases (0–8): asistencia con verificación geográfica, planificación y cobertura, motor de nómina y retenciones legales, regímenes y declaraciones oficiales, informes en cuatro idiomas, transferencia de propiedad — y esta versión añade los equipos de campo con sus denominaciones, los mensajes de voz y el seguimiento en vivo. Versión actual:",
    ),

    # ── notifications ──
    ("notifications", "presenceLeftLine1"): ("غادر العضو", "Le membre a quitté", "Member left", "El miembro dejó"),
    ("notifications", "presenceLeftLine2"): ("منطقة الفريق", "la zone de l'équipe", "the team zone", "la zona del equipo"),
    ("notifications", "presenceReturnedLine1"): ("عاد العضو", "Le membre est revenu", "Member returned to", "El miembro volvió a"),
    ("notifications", "presenceReturnedLine2"): ("إلى منطقة الفريق", "dans la zone de l'équipe", "the team zone", "la zona del equipo"),
    ("notifications", "presenceMeters"): ("م", "m", "m", "m"),

    # ── presence (صفحة الحضور الحي) ──
    ("presence", "title"): ("حضور الفرق الميداني", "Présence des équipes", "Team presence", "Presencia de equipos"),
    ("presence", "subtitle"): ("الموقع الأني للأعضاء داخل/خارج منطقة فريقهم الجغرافية — مع إشعار آني لمسؤول الفريق عند المغادرة والعودة", "Position en direct des membres dans/hors de la zone géographique de leur équipe, avec notification instantanée du responsable à la sortie et au retour", "Live member positions inside/outside their team's geographic zone, with instant leader notification on exit and return", "Posición en vivo de los miembros dentro/fuera de la zona geográfica de su equipo, con notificación instantánea al responsable al salir y volver"),
    ("presence", "stateInside"): ("داخل المنطقة", "Dans la zone", "Inside zone", "Dentro de la zona"),
    ("presence", "stateOutside"): ("غادر المنطقة", "Hors zone", "Outside zone", "Fuera de la zona"),
    ("presence", "stateStale"): ("منقطع (>10د)", "Hors ligne (>10min)", "Stale (>10min)", "Inactivo (>10min)"),
    ("presence", "stateNoPing"): ("بلا مشاركة", "Aucun signal", "No signal", "Sin señal"),
    ("presence", "mapTitle"): ("خريطة الموقع الأني", "Carte de position en direct", "Live position map", "Mapa de posición en vivo"),
    ("presence", "refresh"): ("تحديث", "Actualiser", "Refresh", "Actualizar"),
    ("presence", "noGroups"): ("لا فرق ظاهرة لك بعد — أنشئ فريقًا وعيّن قائده من «مجموعات العمال»", "Aucune équipe visible pour l'instant — créez une équipe et nommez son responsable depuis « Groupes »", "No visible teams yet — create a team and assign its leader from « Groups »", "Aún no hay equipos visibles — crea un equipo y asigna su responsable desde « Grupos »"),
    ("presence", "reserveTeam"): ("فريق احتياطي", "Équipe de réserve", "Reserve team", "Equipo de reserva"),
    ("presence", "zoneRadius"): ("نطاق المنطقة", "Rayon de la zone", "Zone radius", "Radio de la zona"),
    ("presence", "zoneFromSite"): ("من الموقع المرجعي", "Déduit du site", "Derived from site", "Derivado del sitio"),
    ("presence", "noJobTitle"): ("بلا مسمى وظيفي", "Sans intitulé", "No job title", "Sin denominación"),
    ("presence", "leader"): ("القائد", "Responsable", "Leader", "Responsable"),
    ("presence", "noLeader"): ("بلا قائد معيَّن", "Sans responsable désigné", "No leader assigned", "Sin responsable asignado"),
    ("presence", "workSite"): ("موقع العمل", "Site de travail", "Work site", "Sitio de trabajo"),
    ("presence", "member"): ("العضو", "Membre", "Member", "Miembro"),
    ("presence", "jobTitle"): ("المسمى الوظيفي", "Intitulé du poste", "Job title", "Denominación"),
    ("presence", "state"): ("الحالة", "État", "State", "Estado"),
    ("presence", "lastPing"): ("آخر نبضة", "Dernier signal", "Last signal", "Última señal"),
    ("presence", "team"): ("الفريق", "Équipe", "Team", "Equipo"),
    ("presence", "noMembers"): ("لا أعضاء في هذا الفريق بعد", "Aucun membre dans cette équipe pour l'instant", "No members in this team yet", "Aún no hay miembros en este equipo"),
    ("presence", "notLeaderHint"): ("هذه الصفحة لقادة الفرق وأصحاب صلاحية الاطلاع (الكوأدمن فأعلى) — أنت لست قائد فريق ولا تملك الصلاحية", "Cette page est réservée aux responsables d'équipe et aux détenteurs de la permission de consultation (co-admin et au-dessus) — vous n'êtes pas responsable d'équipe", "This page is for team leaders and viewers (co-admin and above) — you are not a team leader", "Esta página es para responsables de equipo y titulares del permiso de consulta (coadmin y superior) — no eres responsable de equipo"),

    # ── voice (الرسائل الصوتية) ──
    ("voice", "title"): ("الرسائل الصوتية", "Messages vocaux", "Voice messages", "Mensajes de voz"),
    ("voice", "subtitle"): ("تواصل مباشر بالصوت داخل فريقك — العزل بين الفرق يُطبَّق في الخادم، والإشراف (سوبر/أدمن/كوأدمن) يصل إلى الجميع", "Communication vocale directe au sein de votre équipe — l'isolement entre équipes est appliqué côté serveur ; la supervision (super/admin/co-admin) accède à tous", "Direct voice communication within your team — team isolation is enforced server-side; supervision (super/admin/co-admin) reaches everyone", "Comunicación por voz directa dentro de tu equipo — el aislamiento entre equipos se aplica en el servidor; la supervisión (superadmin/admin/coadmin) llega a todos"),
    ("voice", "modeTeam"): ("وضع الفريق: محادثاتك مع أعضاء فريقك فقط", "Mode équipe : conversations avec les membres de votre équipe uniquement", "Team mode: conversations with your team members only", "Modo equipo: conversaciones solo con los miembros de tu equipo"),
    ("voice", "modeAdmin"): ("وضع الإشراف: يمكنك المراسلة والاستماع مع جميع الفرق والمستخدمين", "Mode supervision : vous pouvez écrire et écouter avec toutes les équipes et tous les utilisateurs", "Supervision mode: you can message and listen with all teams and users", "Modo supervisión: puedes escribir y escuchar con todos los equipos y usuarios"),
    ("voice", "browseGroup"): ("تصفح رسائل فريق", "Parcourir les messages d'une équipe", "Browse a team's messages", "Explorar mensajes de un equipo"),
    ("voice", "noGroupSelected"): ("اختر فريقًا…", "Choisir une équipe…", "Pick a team…", "Elegir un equipo…"),
    ("voice", "groupFeedTitle"): ("كل رسائل الفريق", "Tous les messages de l'équipe", "All team messages", "Todos los mensajes del equipo"),
    ("voice", "noMessages"): ("لا رسائل بعد", "Aucun message pour l'instant", "No messages yet", "Aún no hay mensajes"),
    ("voice", "contactsAll"): ("جميع مستخدمي الشركة", "Tous les utilisateurs de la société", "All company users", "Todos los usuarios de la empresa"),
    ("voice", "contactsTeam"): ("جهات الاتصال (فريقك)", "Contacts (votre équipe)", "Contacts (your team)", "Contactos (tu equipo)"),
    ("voice", "noContacts"): ("لا جهات اتصال متاحة — تأكد من عضويتك في فريق", "Aucun contact disponible — vérifiez votre appartenance à une équipe", "No contacts available — check your team membership", "Sin contactos disponibles — verifica tu pertenencia a un equipo"),
    ("voice", "back"): ("رجوع", "Retour", "Back", "Volver"),
    ("voice", "pollHint"): ("تحديث تلقائي كل 15ث", "Mise à jour toutes les 15 s", "Auto-refresh every 15s", "Actualización cada 15 s"),
    ("voice", "threadEmpty"): ("لا رسائل في هذه المحادثة — سجّل أول رسالة صوتية", "Aucun message dans cette conversation — enregistrez le premier", "No messages in this conversation — record the first one", "Sin mensajes en esta conversación — graba el primero"),
    ("voice", "play"): ("تشغيل", "Lecture", "Play", "Reproducir"),
    ("voice", "recording"): ("جارٍ التسجيل", "Enregistrement", "Recording", "Grabando"),
    ("voice", "cancel"): ("إلغاء", "Annuler", "Cancel", "Cancelar"),
    ("voice", "send"): ("إرسال", "Envoyer", "Send", "Enviar"),
    ("voice", "sending"): ("جارٍ الإرسال…", "Envoi…", "Sending…", "Enviando…"),
    ("voice", "record"): ("تسجيل رسالة صوتية", "Enregistrer un message vocal", "Record a voice message", "Grabar un mensaje de voz"),
    ("voice", "recordHint"): ("≤ 120 ثانية · يتوقف تلقائيًا", "≤ 120 secondes · arrêt automatique", "≤ 120 seconds · auto-stop", "≤ 120 segundos · parada automática"),
    ("voice", "micDenied"): ("رُفض الإذن — فعّل الميكروفون من إعدادات المتصفح", "Permission refusée — activez le micro dans les réglages du navigateur", "Permission denied — enable the microphone in browser settings", "Permiso denegado — activa el micrófono en los ajustes del navegador"),
    ("voice", "micUnsupported"): ("متصفحك لا يدعم التسجيل الصوتي", "Votre navigateur ne prend pas en charge l'enregistrement", "Your browser does not support recording", "Tu navegador no admite la grabación"),
    ("voice", "tooLarge"): ("المقطع كبير جدًا (الحد 2.5MB)", "Clip trop volumineux (limite 2,5 Mo)", "Clip too large (2.5MB limit)", "Clip demasiado grande (límite 2,5 MB)"),
    ("voice", "sendFailed"): ("تعذر الإرسال — حاول مجددًا", "Échec de l'envoi — réessayez", "Failed to send — try again", "No se pudo enviar — reintenta"),
    ("voice", "pickContact"): ("اختر جهة اتصال لبدء المحادثة", "Choisissez un contact pour commencer", "Pick a contact to start", "Elige un contacto para comenzar"),

    # ── usersPage ──
    ("usersPage", "title"): ("المستخدمون", "Utilisateurs", "Users", "Usuarios"),
    ("usersPage", "subtitle"): ("إنشاء الحسابات للسوبر أدمن حصرًا (قابل للتفويض) — وتعيين المسميات الوظيفية وإدارة التفعيل", "Création des comptes réservée au super admin (délégable) — attribution des intitulés et gestion de l'activation", "Account creation is super-admin only (delegable) — job titles and activation management", "La creación de cuentas es solo del superadmin (delegable) — asignación de denominaciones y gestión de activación"),
    ("usersPage", "listTitle"): ("قائمة المستخدمين", "Liste des utilisateurs", "Users list", "Lista de usuarios"),
    ("usersPage", "createTitle"): ("حساب جديد", "Nouveau compte", "New account", "Nueva cuenta"),
    ("usersPage", "createHint"): ("كلمة المرور الابتدائية تُولَّد وتُعرض مرة واحدة إن تركت فارغة", "Le mot de passe initial est généré et affiché une seule fois si laissé vide", "The initial password is generated and shown once if left empty", "La contraseña inicial se genera y se muestra una vez si se deja vacía"),
    ("usersPage", "fullName"): ("الاسم الكامل", "Nom complet", "Full name", "Nombre completo"),
    ("usersPage", "email"): ("البريد الإلكتروني", "E-mail", "Email", "Correo electrónico"),
    ("usersPage", "phone"): ("الهاتف", "Téléphone", "Phone", "Teléfono"),
    ("usersPage", "role"): ("الدور", "Rôle", "Role", "Rol"),
    ("usersPage", "jobTitle"): ("المسمى الوظيفي", "Intitulé du poste", "Job title", "Denominación"),
    ("usersPage", "password"): ("كلمة المرور الابتدائية", "Mot de passe initial", "Initial password", "Contraseña inicial"),
    ("usersPage", "passwordPlaceholder"): ("اتركها فارغة للتوليد التلقائي", "Laisser vide pour générer", "Leave empty to auto-generate", "Dejar vacío para generar"),
    ("usersPage", "passwordHint"): ("8 أحرف على الأقل — تُعرض مرة واحدة بعد الإنشاء", "8 caractères minimum — affichée une seule fois après création", "At least 8 characters — shown once after creation", "Mínimo 8 caracteres — se muestra una vez tras crear"),
    ("usersPage", "initialPasswordTitle"): ("كلمة المرور الابتدائية", "Mot de passe initial", "Initial password", "Contraseña inicial"),
    ("usersPage", "initialPasswordHint"): ("انسخها وأبلغها للمستخدم بقاناة آمنة — لن تُعرض مرة أخرى ولن تُخزَّن صريحة", "Copiez-la et transmettez-la par un canal sûr — elle ne sera plus affichée ni stockée en clair", "Copy it and deliver it via a secure channel — it will never be shown again nor stored in clear", "Cópiala y entrégala por un canal seguro — no se mostrará de nuevo ni se guardará en claro"),
    ("usersPage", "delegationsTitle"): ("تفويض الصلاحيات", "Délégations de permissions", "Permission delegations", "Delegación de permisos"),
    ("usersPage", "grantDelegation"): ("منح تفويض", "Accorder une délégation", "Grant delegation", "Conceder delegación"),
    ("usersPage", "delegationHint"): ("منح مؤقت قابل للسحب — يضاف فوق دور المنحوح له حتى انتهائه", "Octroi temporaire révocable — s'ajoute au rôle du bénéficiaire jusqu'à expiration", "Temporary and revocable — added on top of the grantee's role until expiry", "Temporal y revocable — se añade al rol del beneficiario hasta su expiración"),
    ("usersPage", "noDelegations"): ("لا تفويضات سارية", "Aucune délégation active", "No active delegations", "Sin delegaciones activas"),
    ("usersPage", "grantee"): ("المنوح له", "Bénéficiaire", "Grantee", "Beneficiario"),
    ("usersPage", "permission"): ("الصلاحية", "Permission", "Permission", "Permiso"),
    ("usersPage", "expires"): ("الانتهاء", "Expiration", "Expiry", "Expiración"),
    ("usersPage", "noExpiry"): ("بلا انتهاء", "Sans expiration", "No expiry", "Sin expiración"),
    ("usersPage", "note"): ("ملاحظة", "Note", "Note", "Nota"),
    ("usersPage", "revoke"): ("سحب التفويض", "Révoquer", "Revoke", "Revocar"),
    ("usersPage", "deactivate"): ("تعطيل", "Désactiver", "Deactivate", "Desactivar"),
    ("usersPage", "activate"): ("تفعيل", "Activer", "Activate", "Activar"),
    ("usersPage", "you"): ("أنت", "Vous", "You", "Tú"),
    ("usersPage", "user"): ("المستخدم", "Utilisateur", "User", "Usuario"),

    # ── groups (إضافات المرحلة 9) ──
    ("groups", "teamSetup"): ("إعداد الفريق", "Configurer l'équipe", "Team setup", "Configurar equipo"),
    ("groups", "teamSetupHint"): ("القائد والنوع والمنطقة الجغرافية والأعضاء بمسمياتهم — كل تغيير محفوظ في التدقيق", "Responsable, type, zone géographique et membres avec leurs intitulés — chaque modification est auditée", "Leader, kind, geographic zone and members with titles — every change is audited", "Responsable, tipo, zona geográfica y miembros con denominaciones — cada cambio se audita"),
    ("groups", "teamSettings"): ("إعدادات الفريق", "Paramètres de l'équipe", "Team settings", "Ajustes del equipo"),
    ("groups", "teamKind"): ("نوع الفريق", "Type d'équipe", "Team kind", "Tipo de equipo"),
    ("groups", "teamKindHint"): ("فرق الإحتياط تُستدعى عند الحاجة (تغطية/طوارئ) ويظهر شارة في كل الواجهات", "Les équipes de réserve sont appelées en cas de besoin (couverture/urgence) avec un badge partout", "Reserve teams are called when needed (coverage/emergencies) and show a badge everywhere", "Los equipos de reserva se llaman cuando se necesitan (cobertura/emergencias) y muestran un distintivo"),
    ("groups", "kindRegular"): ("عادي", "Ordinaire", "Regular", "Ordinario"),
    ("groups", "kindReserve"): ("احتياطي", "Réserve", "Reserve", "Reserva"),
    ("groups", "teamLeader"): ("مسؤول الفريق", "Responsable d'équipe", "Team leader", "Responsable de equipo"),
    ("groups", "teamLeaderHint"): ("يُخطر آنيًا عند دخول/مغادرة أي عضو منطقة الفريق — القيادة إسناد لا دورًا", "Notifié instantanément à l'entrée/sortie de tout membre dans la zone — la responsabilité est un assignement, pas un rôle", "Instantly notified when any member enters/leaves the zone — leadership is an assignment, not a role", "Recibe notificación instantánea cuando cualquier miembro entra/sale de la zona — el liderazgo es una asignación, no un rol"),
    ("groups", "noLeader"): ("بلا قائد", "Sans responsable", "No leader", "Sin responsable"),
    ("groups", "workSite"): ("موقع العمل المرجعي", "Site de référence", "Reference site", "Sitio de referencia"),
    ("groups", "workSiteHint"): ("تُشتق منطقة الفريق من مركز هذا الموقع إن لم تُحدد صريحة", "La zone de l'équipe est déduite du centre de ce site si non définie explicitement", "The team zone is derived from this site's center unless set explicitly", "La zona del equipo se deriva del centro de este sitio si no se define explícitamente"),
    ("groups", "noSite"): ("بلا موقع مرجعي", "Sans site de référence", "No reference site", "Sin sitio de referencia"),
    ("groups", "zoneTitle"): ("المنطقة الجغرافية للفريق", "Zone géographique de l'équipe", "Team geographic zone", "Zona geográfica del equipo"),
    ("groups", "zoneMode"): ("مصدر المنطقة", "Source de la zone", "Zone source", "Fuente de la zona"),
    ("groups", "zoneFromSite"): ("من الموقع المرجعي", "Déduite du site", "From reference site", "Del sitio de referencia"),
    ("groups", "zoneExplicit"): ("إحداثيات صريحة", "Coordonnées explicites", "Explicit coordinates", "Coordenadas explícitas"),
    ("groups", "zoneLat"): ("خط العرض", "Latitude", "Latitude", "Latitud"),
    ("groups", "zoneLng"): ("خط الطول", "Longitude", "Longitude", "Longitud"),
    ("groups", "zoneRadius"): ("النطاق (م)", "Rayon (m)", "Radius (m)", "Radio (m)"),
    ("groups", "zoneHint"): ("نطاق أوسع من نطاق تسجيل الحضور (50م) لأن هذه متابعة وجود لا تحقق وردية", "Plus large que le rayon de pointage (50 m) : c'est un suivi de présence, pas une vérification", "Wider than the attendance fence (50m) — this is presence monitoring, not shift verification", "Más amplio que el radio de fichaje (50 m): es seguimiento de presencia, no verificación de turno"),
    ("groups", "saveTeam"): ("حفظ إعدادات الفريق", "Enregistrer l'équipe", "Save team settings", "Guardar ajustes del equipo"),
    ("groups", "teamSaved"): ("حُفظت إعدادات الفريق", "Paramètres de l'équipe enregistrés", "Team settings saved", "Ajustes del equipo guardados"),
    ("groups", "membersTitle"): ("أعضاء الفريق", "Membres de l'équipe", "Team members", "Miembros del equipo"),
    ("groups", "membersCount"): ("{count} أعضاء", "{count} membres", "{count} members", "{count} miembros"),
    ("groups", "addMember"): ("إضافة عضو", "Ajouter un membre", "Add member", "Añadir miembro"),
    ("groups", "pickMember"): ("اختر عضوًا…", "Choisir un membre…", "Pick a member…", "Elegir un miembro…"),
    ("groups", "memberJobTitle"): ("المسمى داخل الفريق", "Intitulé dans l'équipe", "Title in team", "Denominación en el equipo"),
    ("groups", "member"): ("العضو", "Membre", "Member", "Miembro"),
    ("groups", "removeMember"): ("إزالة من الفريق", "Retirer de l'équipe", "Remove from team", "Quitar del equipo"),
    ("groups", "membersHint"): ("الإزالة مؤرخة (التاريخ محفوظ) — والقائد إن أُزيل أسقطت قيادته تلقائيًا", "Le retrait est horodaté (historique conservé) — retirer le leader lui retire aussi la direction", "Removal is timestamped (history kept) — removing the leader also clears leadership", "La retirada queda registrada (se conserva el historial) — quitar al líder también le retira la dirección"),
}

def main():
    missing = []
    for i, lang in enumerate(LANGS):
        path = BASE / f"{lang}.json"
        data = json.loads(path.read_text(encoding="utf-8"))
        dirty = False
        for (section, key), values in ADD.items():
            sec = data.setdefault(section, {})
            if key in sec:
                continue
            sec[key] = values[i]
            dirty = True
        if dirty:
            path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        else:
            missing.append(lang)
    total = len(ADD)
    print(f"OK — أُضيفت {total} مفتاحًا إلى القواميس الأربع" + (f" (skip: {', '.join(missing)})" if missing else ""))

if __name__ == "__main__":
    main()
