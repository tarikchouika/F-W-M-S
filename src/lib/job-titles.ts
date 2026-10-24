// HRMP — كتالوج المسميات الوظيفية الشامل (المرحلة 9 — v0.10.0)
// ---------------------------------------------------------------------------
// طلب المالك 2026-10-18: «إدراج جميع المسميات الوظيفية للعمال والحرفيين والتقنيين
// والمقيسين وكل ما يلزم لتشمل المنصة تغطية جميع أنواع المجالات الممكنة لإدارة
// اليد العاملة بشكل احترافي مضبوط».
// المصدر الواحد للمسميات: يُستخدم في ملفات العمال (EmployeeProfile.jobTitleKey)
// وفي عضويات الفرق — الترجمة مدمجة (ar/fr/en/es) بلا حاجة لقواميس i18n منفصلة.
// المسمى الحر (jobTitleCustom) يُعرض بجانب مسمى الكتالوج — تغطية الحالات النادرة.

export type JobLocale = "ar" | "fr" | "en" | "es";
type L = Record<JobLocale, string>;
const t = (ar: string, fr: string, en: string, es: string): L => ({ ar, fr, en, es });

export type JobTitle = { key: string; labels: L };
export type JobTitleCategory = { key: string; labels: L; titles: JobTitle[] };

export const JOB_TITLE_CATEGORIES: JobTitleCategory[] = [
  {
    key: "construction",
    labels: t("البناء والأشغال العمومية", "Bâtiment et travaux publics", "Construction & public works", "Construcción y obras públicas"),
    titles: [
      { key: "general_laborer", labels: t("عامل بناء عام", "Ouvrier de chantier général", "General construction laborer", "Peón de construcción general") },
      { key: "mason", labels: t("بنّاء (معلم)", "Maçon", "Mason", "Albañil") },
      { key: "mason_assistant", labels: t("مساعد بنّاء", "Aide-maçon", "Mason assistant", "Ayudante de albañil") },
      { key: "formwork_carpenter", labels: t("نجّار قوالب (شدّات)", "Coffreur", "Formwork carpenter", "Carpintero de encofrado") },
      { key: "steel_fixer", labels: t("حدّاد تسليح", "Ferrailleur", "Steel fixer", "Ferrallador") },
      { key: "concrete_pump_operator", labels: t("مشغّل مضخة خرسانة", "Opérateur pompe à béton", "Concrete pump operator", "Operador de bomba de hormigón") },
      { key: "site_foreman", labels: t("رئيس ورشة", "Chef de chantier", "Site foreman", "Jefe de obra") },
      { key: "scaffolder", labels: t("قائم سقالات", "Échafaudeur", "Scaffolder", "Montador de andamios") },
      { key: "demolition_worker", labels: t("عامل هدم", "Ouvrier démolisseur", "Demolition worker", "Operario de demolición") },
      { key: "rigger", labels: t("ريجّر (تركيب حمولات)", "Élingueur", "Rigger", "Aparejador de cargas") },
      { key: "crane_operator", labels: t("مشغّل رافعة برجية", "Opérateur de grue", "Crane operator", "Operador de grúa") },
      { key: "excavator_operator", labels: t("مشغّل حفّار", "Conducteur de pelle", "Excavator operator", "Operador de excavadora") },
      { key: "bulldozer_operator", labels: t("مشغّل جرافة", "Conducteur de bulldozer", "Bulldozer operator", "Operador de bulldozer") },
      { key: "road_worker", labels: t("عامل طرق", "Ouvrier routier", "Road worker", "Operario vial") },
      { key: "asphalt_worker", labels: t("عامل إسفلت", "Ouvrier enrobés", "Asphalt worker", "Operario de asfalto") },
      { key: "tile_marble_installer", labels: t("مركّب زليج ورخام", "Carreleur-marbrier", "Tile & marble installer", "Colocador de azulejos y mármol") },
      { key: "plasterer", labels: t("ملّاص (جبّاص)", "Plâtrier", "Plasterer", "Enlucidor") },
      { key: "insulation_worker", labels: t("عامل عزل", "Ouvrier isolateur", "Insulation worker", "Operario de aislamiento") },
      { key: "waterproofing_worker", labels: t("عامل عزل مائي", "Ouvrier étancheur", "Waterproofing worker", "Operario de impermeabilización") },
    ],
  },
  {
    key: "electrical",
    labels: t("الكهرباء", "Électricité", "Electrical", "Electricidad"),
    titles: [
      { key: "electrician_master", labels: t("كهربائي معلم", "Électricien qualifié", "Master electrician", "Electricista maestro") },
      { key: "electrician_assistant", labels: t("مساعد كهربائي", "Aide-électricien", "Electrician assistant", "Ayudante electricista") },
      { key: "low_voltage_tech", labels: t("تقني تيار ضعيف", "Technicien courant faible", "Low-voltage technician", "Técnico de baja tensión") },
      { key: "high_voltage_tech", labels: t("تقني جهد عالٍ", "Technicien haute tension", "High-voltage technician", "Técnico de alta tensión") },
      { key: "solar_pv_installer", labels: t("مركّب ألواح شمسية", "Installateur photovoltaïque", "Solar PV installer", "Instalador fotovoltaico") },
      { key: "elevator_technician", labels: t("تقني مصاعد", "Technicien ascenseurs", "Elevator technician", "Técnico de ascensores") },
      { key: "electrical_safety_inspector", labels: t("مفتش سلامة كهربائية", "Inspecteur sécurité électrique", "Electrical safety inspector", "Inspector de seguridad eléctrica") },
      { key: "generator_technician", labels: t("تقني مولّدات", "Technicien groupes électrogènes", "Generator technician", "Técnico de generadores") },
    ],
  },
  {
    key: "plumbing_hvac",
    labels: t("السباكة والتدفئة والتهوية", "Plomberie, chauffage et ventilation", "Plumbing, heating & ventilation", "Fontanería, calefacción y ventilación"),
    titles: [
      { key: "plumber", labels: t("سبّاك (معلم)", "Plombier", "Plumber", "Fontanero") },
      { key: "plumber_assistant", labels: t("مساعد سبّاك", "Aide-plombier", "Plumber assistant", "Ayudante fontanero") },
      { key: "pipe_welder", labels: t("لحّام أنابيب", "Soudeur de tuyauterie", "Pipe welder", "Soldador de tuberías") },
      { key: "hvac_technician", labels: t("تقني تكييف وتهوية", "Technicien CVC", "HVAC technician", "Técnico de climatización") },
      { key: "refrigeration_technician", labels: t("تقني تبريد", "Technicien frigoriste", "Refrigeration technician", "Técnico frigorista") },
      { key: "gas_fitter", labels: t("تقني غاز", "Technicien gaz", "Gas fitter", "Técnico de gas") },
      { key: "central_heating_tech", labels: t("تقني تدفئة مركزية", "Technicien chauffage central", "Central heating technician", "Técnico de calefacción central") },
      { key: "swimming_pool_technician", labels: t("تقني مسابح", "Technicien piscines", "Swimming pool technician", "Técnico de piscinas") },
    ],
  },
  {
    key: "carpentry",
    labels: t("النجارة والخشب", "Menuiserie et bois", "Carpentry & wood", "Carpintería y madera"),
    titles: [
      { key: "carpenter_master", labels: t("نجّار معلم", "Menuisier qualifié", "Master carpenter", "Carpintero maestro") },
      { key: "carpenter_assistant", labels: t("مساعد نجّار", "Aide-menuisier", "Carpenter assistant", "Ayudante carpintero") },
      { key: "furniture_maker", labels: t("صانع أثاث", "Ébéniste", "Furniture maker", "Ebanista") },
      { key: "cabinet_installer", labels: t("مركّب مطابخ وخزائن", "Poseur de cuisines", "Cabinet installer", "Instalador de cocinas") },
      { key: "door_window_installer", labels: t("مركّب أبواب ونوافذ", "Poseur menuiseries", "Door & window installer", "Instalador de puertas y ventanas") },
      { key: "wood_restorer", labels: t("مرمّم أخشاب", "Restaurateur de bois", "Wood restorer", "Restaurador de madera") },
    ],
  },
  {
    key: "metal_welding",
    labels: t("المعادن واللحام", "Métallurgie et soudure", "Metalwork & welding", "Metalurgia y soldadura"),
    titles: [
      { key: "welder_arc", labels: t("لحّام قوس كهربائي", "Soudeur à l'arc", "Arc welder", "Soldador de arco") },
      { key: "welder_tig", labels: t("لحّام TIG", "Soudeur TIG", "TIG welder", "Soldador TIG") },
      { key: "sheet_metal_worker", labels: t("عامل صفيح (بياض)", "Tôlier", "Sheet metal worker", "Calderero") },
      { key: "blacksmith", labels: t("حدّاد تقليدي", "Forgeron", "Blacksmith", "Herrero") },
      { key: "structural_steel_worker", labels: t("عامل هياكل معدنية", "Ouvrier charpentier métallique", "Structural steel worker", "Montador de estructura metálica") },
      { key: "cnc_operator", labels: t("مشغّل مخرطة CNC", "Opérateur CNC", "CNC operator", "Operador CNC") },
      { key: "machinist", labels: t("ميكانيكي ماكينات", "Machiniste", "Machinist", "Maquinista") },
      { key: "aluminum_glass_installer", labels: t("مركّب ألمنيوم وزجاج", "Poseur alu-vitrine", "Aluminum & glass installer", "Instalador de aluminio y vidrio") },
    ],
  },
  {
    key: "painting_finishing",
    labels: t("الدهان والتشطيب", "Peinture et finitions", "Painting & finishing", "Pintura y acabados"),
    titles: [
      { key: "painter", labels: t("دهّان", "Peintre", "Painter", "Pintor") },
      { key: "decorative_painter", labels: t("دهّان ديكور", "Peintre décorateur", "Decorative painter", "Pintor decorativo") },
      { key: "wallpaper_installer", labels: t("ملصق ورق جدران", "Poseur de papier peint", "Wallpaper installer", "Instalador de papel pintado") },
      { key: "gypsum_board_installer", labels: t("مركّب جبس (بلاطو)", "Plâtrier plaquiste", "Drywall installer", "Instalador de pladur") },
      { key: "flooring_installer", labels: t("مركّب أرضيات", "Poseur de sols", "Flooring installer", "Instalador de suelos") },
      { key: "cleaning_polisher", labels: t("جلّاق وتلميع", "Polisseur-crystalliseur", "Polishing worker", "Pulidor y cristalizador") },
    ],
  },
  {
    key: "surveying_measurement",
    labels: t("القياس والمساحة (المقيسين)", "Topographie et métré (métreurs)", "Surveying & measurement (measurers)", "Topografía y mediciones (medidores)"),
    titles: [
      { key: "land_surveyor", labels: t("مسّاح أراضٍ", "Géomètre-topographe", "Land surveyor", "Topógrafo") },
      { key: "quantity_surveyor", labels: t("مقيس كميات", "Métreur", "Quantity surveyor", "Medidor de cantidades") },
      { key: "surveying_technician", labels: t("تقني مساحة", "Technicien topographe", "Surveying technician", "Técnico topográfico") },
      { key: "site_measurer", labels: t("مقيس مواقع", "Métreur de chantier", "Site measurer", "Medidor de obra") },
      { key: "lab_test_technician", labels: t("تقني اختبارات مختبر", "Technicien laboratoire", "Lab test technician", "Técnico de laboratorio") },
      { key: "drone_survey_operator", labels: t("مشغّل مسح بالطائرات", "Opérateur de levé drone", "Drone survey operator", "Operador de dron topográfico") },
      { key: "gis_specialist", labels: t("أخصائي نظم معلومات جغرافية", "Spécialiste SIG", "GIS specialist", "Especialista SIG") },
    ],
  },
  {
    key: "engineering_design",
    labels: t("الهندسة والتصميم", "Ingénierie et conception", "Engineering & design", "Ingeniería y diseño"),
    titles: [
      { key: "civil_engineer", labels: t("مهندس مدني", "Ingénieur génie civil", "Civil engineer", "Ingeniero civil") },
      { key: "architect", labels: t("مهندس معماري", "Architecte", "Architect", "Arquitecto") },
      { key: "electrical_engineer", labels: t("مهندس كهربائي", "Ingénieur électricien", "Electrical engineer", "Ingeniero electricista") },
      { key: "mechanical_engineer", labels: t("مهندس ميكانيكي", "Ingénieur mécanicien", "Mechanical engineer", "Ingeniero mecánico") },
      { key: "structural_engineer", labels: t("مهندس إنشائي", "Ingénieur structure", "Structural engineer", "Ingeniero estructural") },
      { key: "cad_draftsman", labels: t("رسّام CAD", "Dessinateur DAO/CAO", "CAD draftsman", "Dibujante CAD") },
      { key: "project_manager_engineer", labels: t("مهندس إدارة مشاريع", "Ingénieur chef de projet", "Project engineer", "Ingeniero de proyectos") },
    ],
  },
  {
    key: "security",
    labels: t("الحراسة والأمن", "Sécurité et gardiennage", "Security & guarding", "Seguridad y vigilancia"),
    titles: [
      { key: "security_guard", labels: t("حارس أمن", "Agent de sécurité", "Security guard", "Vigilante") },
      { key: "site_watchman", labels: t("بوّاب موقع (ناطور)", "Gardien de chantier", "Site watchman", "Vigilante de obra") },
      { key: "cctv_operator", labels: t("مشغّل مراقبة", "Opérateur vidéosurveillance", "CCTV operator", "Operador de videovigilancia") },
      { key: "bodyguard", labels: t("حارس شخصي", "Garde du corps", "Bodyguard", "Escolta") },
      { key: "patrol_supervisor", labels: t("مشرف دوريات", "Superviseur de ronde", "Patrol supervisor", "Supervisor de rondas") },
      { key: "canine_handler", labels: t("مروّض كلاب أمن", "Maître-chien", "Canine handler", "Guía canino") },
    ],
  },
  {
    key: "cleaning",
    labels: t("النظافة والصيانة المنزلية", "Nettoyage et entretien", "Cleaning & housekeeping", "Limpieza y mantenimiento"),
    titles: [
      { key: "cleaner", labels: t("عامل نظافة", "Agent de propreté", "Cleaner", "Personal de limpieza") },
      { key: "window_cleaner", labels: t("نظّاف واجهات زجاجية", "Laveur de vitres", "Window cleaner", "Limpiavidrios") },
      { key: "housekeeper", labels: t("عاملة منزلية", "Gouvernante", "Housekeeper", "Personal doméstico") },
      { key: "waste_collector", labels: t("جامع نفايات", "Éboueur", "Waste collector", "Recogedor de residuos") },
      { key: "pest_control_technician", labels: t("تقني مكافحة آفات", "Technicien 3D (dératisation)", "Pest control technician", "Técnico de control de plagas") },
      { key: "gardener", labels: t("بستاني", "Jardinier", "Gardener", "Jardinero") },
    ],
  },
  {
    key: "agriculture",
    labels: t("الفلاحة والثروة الحيوانية", "Agriculture et élevage", "Agriculture & livestock", "Agricultura y ganadería"),
    titles: [
      { key: "farm_worker", labels: t("عامل فلاحي", "Ouvrier agricole", "Farm worker", "Operario agrícola") },
      { key: "irrigation_technician", labels: t("تقني سقي", "Technicien irrigation", "Irrigation technician", "Técnico de riego") },
      { key: "livestock_worker", labels: t("راعي مواشي", "Berger", "Livestock worker", "Pastor") },
      { key: "harvest_worker", labels: t("عامل جني", "Ouvrier de récolte", "Harvest worker", "Operario de cosecha") },
      { key: "agronomist", labels: t("مهندس فلاحي", "Ingénieur agronome", "Agronomist", "Ingeniero agrónomo") },
      { key: "greenhouse_worker", labels: t("عامل بيوت بلاستيكية", "Ouvrier sous serre", "Greenhouse worker", "Operario de invernadero") },
    ],
  },
  {
    key: "transport_logistics",
    labels: t("النقل واللوجستيك", "Transport et logistique", "Transport & logistics", "Transporte y logística"),
    titles: [
      { key: "truck_driver", labels: t("سائق شاحنة", "Chauffeur poids lourd", "Truck driver", "Conductor de camión") },
      { key: "delivery_driver", labels: t("سائق توصيل", "Livreur", "Delivery driver", "Repartidor") },
      { key: "forklift_operator", labels: t("مشغّل رافعة شوكية", "Cariste", "Forklift operator", "Carretillero") },
      { key: "warehouse_worker", labels: t("عامل مستودع", "Magasinier", "Warehouse worker", "Mozo de almacén") },
      { key: "logistics_coordinator", labels: t("منسق لوجستيك", "Coordinateur logistique", "Logistics coordinator", "Coordinador logístico") },
      { key: "bus_driver", labels: t("سائق حافلة", "Chauffeur de bus", "Bus driver", "Conductor de autobús") },
      { key: "mechanic", labels: t("ميكانيكي سيارات", "Mécanicien auto", "Auto mechanic", "Mecánico automotriz") },
    ],
  },
  {
    key: "food_catering",
    labels: t("المطاعم والتغذية", "Restauration et alimentation", "Food & catering", "Restauración y alimentación"),
    titles: [
      { key: "head_chef", labels: t("طاهٍ رئيس", "Chef de cuisine", "Head chef", "Jefe de cocina") },
      { key: "cook", labels: t("طبّاخ", "Cuisinier", "Cook", "Cocinero") },
      { key: "kitchen_assistant", labels: t("مساعد مطبخ", "Aide de cuisine", "Kitchen assistant", "Ayudante de cocina") },
      { key: "waiter", labels: t("نادل", "Serveur", "Waiter", "Camarero") },
      { key: "barista", labels: t("محضّر قهوة", "Barista", "Barista", "Barista") },
      { key: "bakery_worker", labels: t("عامل مخبزة", "Ouvrier boulangerie", "Bakery worker", "Operario de panadería") },
      { key: "food_safety_officer", labels: t("مراقب سلامة غذائية", "Contrôleur hygiène alimentaire", "Food safety officer", "Controlador de seguridad alimentaria") },
    ],
  },
  {
    key: "it_office",
    labels: t("المعلوماتية والمكاتب", "Informatique et bureautique", "IT & office", "Informática y ofimática"),
    titles: [
      { key: "it_technician", labels: t("تقني معلوماتية", "Technicien informatique", "IT technician", "Técnico informático") },
      { key: "network_technician", labels: t("تقني شبكات", "Technicien réseau", "Network technician", "Técnico de redes") },
      { key: "data_entry_clerk", labels: t("مُدخل بيانات", "Agent de saisie", "Data entry clerk", "Operador de datos") },
      { key: "office_administrator", labels: t("مدير مكتب", "Administrateur de bureau", "Office administrator", "Administrador de oficina") },
      { key: "helpdesk_support", labels: t("دعم فني", "Support helpdesk", "Helpdesk support", "Soporte técnico") },
      { key: "web_developer", labels: t("مطور ويب", "Développeur web", "Web developer", "Desarrollador web") },
    ],
  },
  {
    key: "hse",
    labels: t("الصحة والسلامة المهنية", "Santé et sécurité au travail", "Health & safety (HSE)", "Salud y seguridad laboral"),
    titles: [
      { key: "safety_officer", labels: t("مسؤول سلامة (HSE)", "Responsable HSE", "Safety officer (HSE)", "Responsable de seguridad (HSE)") },
      { key: "first_aid_worker", labels: t("مسعف إسعافات أولية", "Secouriste", "First aid worker", "Socorrista") },
      { key: "fire_safety_technician", labels: t("تقني سلامة حرائق", "Technicien sécurité incendie", "Fire safety technician", "Técnico de seguridad contra incendios") },
      { key: "occupational_doctor", labels: t("طبّيب مختص في طب الشغل", "Médecin du travail", "Occupational doctor", "Médico laboral") },
      { key: "nurse", labels: t("ممرّضة/ممرّض", "Infirmier", "Nurse", "Enfermero/a") },
    ],
  },
  {
    key: "admin_coordination",
    labels: t("الإدارة والتنسيق", "Administration et coordination", "Administration & coordination", "Administración y coordinación"),
    titles: [
      { key: "team_leader", labels: t("مسؤول فريق", "Chef d'équipe", "Team leader", "Responsable de equipo") },
      { key: "site_supervisor", labels: t("مشرف موقع", "Superviseur de site", "Site supervisor", "Supervisor de sitio") },
      { key: "hr_officer", labels: t("مسؤول موارد بشرية", "Responsable RH", "HR officer", "Responsable de RRHH") },
      { key: "training_coordinator", labels: t("منسق تدريب", "Coordinateur formation", "Training coordinator", "Coordinador de formación") },
      { key: "scheduler", labels: t("مجدول وديات", "Planificateur", "Scheduler", "Planificador") },
      { key: "receptionist", labels: t("موظف استقبال", "Réceptionniste", "Receptionist", "Recepcionista") },
    ],
  },
  {
    key: "finance_accounting",
    labels: t("المالية والمحاسبة", "Finance et comptabilité", "Finance & accounting", "Finanzas y contabilidad"),
    titles: [
      { key: "accountant", labels: t("محاسب", "Comptable", "Accountant", "Contable") },
      { key: "payroll_officer", labels: t("مسؤول الأجور", "Responsable paie", "Payroll officer", "Responsable de nóminas") },
      { key: "cashier", labels: t("أمين صندوق", "Caissier", "Cashier", "Cajero") },
      { key: "purchasing_officer", labels: t("مسؤول مشتريات", "Responsable achats", "Purchasing officer", "Responsable de compras") },
      { key: "auditor", labels: t("مراقب حسابات", "Auditeur", "Auditor", "Auditor") },
    ],
  },
  {
    key: "hospitality",
    labels: t("الفنادق والضيافة", "Hôtellerie et accueil", "Hospitality", "Hostelería y recepción"),
    titles: [
      { key: "receptionist_hotel", labels: t("موظف استقبال فندقي", "Réceptionniste hôtel", "Hotel receptionist", "Recepcionista hotelero") },
      { key: "room_attendant", labels: t("عامل غرف", "Gouvernante d'étage", "Room attendant", "Camarera de piso") },
      { key: "laundry_worker", labels: t("عامل مغسلة", "Ouvrier blanchisserie", "Laundry worker", "Operario de lavandería") },
      { key: "maintenance_worker", labels: t("عامل صيانة", "Agent de maintenance", "Maintenance worker", "Operario de mantenimiento") },
    ],
  },
  {
    key: "industrial",
    labels: t("الصناعة والمعامل", "Industrie et usines", "Industry & factories", "Industria y fábricas"),
    titles: [
      { key: "machine_operator", labels: t("مشغّل ماكينات", "Opérateur de machines", "Machine operator", "Operador de máquinas") },
      { key: "production_line_worker", labels: t("عامل خط إنتاج", "Ouvrier de chaîne", "Production line worker", "Operario de línea") },
      { key: "quality_controller", labels: t("مراقب جودة", "Contrôleur qualité", "Quality controller", "Controlador de calidad") },
      { key: "maintenance_technician", labels: t("تقني صيانة صناعية", "Technicien maintenance", "Maintenance technician", "Técnico de mantenimiento") },
      { key: "warehouse_keeper", labels: t("أمين مخزن", "Magasinier chef", "Warehouse keeper", "Jefe de almacén") },
    ],
  },
  {
    key: "telecom",
    labels: t("الاتصالات والشبكات", "Télécommunications et réseaux", "Telecom & networks", "Telecomunicaciones y redes"),
    titles: [
      { key: "telecom_technician", labels: t("تقني اتصالات", "Technicien télécom", "Telecom technician", "Técnico telecomunicaciones") },
      { key: "fiber_splicer", labels: t("لحّام ألياف بصرية", "Épissureur fibre optique", "Fiber splicer", "Empalmador de fibra óptica") },
      { key: "tower_climber", labels: t("فني صعود الأبراج", "Technicien pylônes", "Tower climber", "Técnico de torres") },
      { key: "radio_engineer", labels: t("مهندس لاسلكي", "Ingénieur radio", "Radio engineer", "Ingeniero de radio") },
    ],
  },
  {
    key: "education_training",
    labels: t("التكوين والتدريب المهني", "Formation professionnelle", "Training & education", "Formación y capacitación"),
    titles: [
      { key: "vocational_trainer", labels: t("مدرّب مهني", "Formateur", "Vocational trainer", "Formador") },
      { key: "apprentice_master", labels: t("معلم متدربين", "Maître d'apprentissage", "Apprentice master", "Maestro de aprendices") },
      { key: "apprentice", labels: t("متدرب (تمهين)", "Apprenti", "Apprentice", "Aprendiz") },
    ],
  },
];

// ── فهارس وبحث ──

const BY_KEY = new Map<string, { title: JobTitle; category: JobTitleCategory }>();
for (const cat of JOB_TITLE_CATEGORIES) {
  for (const title of cat.titles) {
    BY_KEY.set(title.key, { title, category: cat });
  }
}

export const JOB_TITLE_COUNT = BY_KEY.size;

/** تسمية المسمى بلغة معينة — null إن لم يوجد المفتاح */
export function jobTitleLabel(key: string | null | undefined, locale: JobLocale): string | null {
  if (!key) return null;
  const hit = BY_KEY.get(key);
  return hit ? hit.title.labels[locale] : null;
}

/** تسمية التصنيف بلغة معينة */
export function categoryLabel(key: string | null | undefined, locale: JobLocale): string | null {
  if (!key) return null;
  const cat = JOB_TITLE_CATEGORIES.find((c) => c.key === key);
  return cat ? cat.labels[locale] : null;
}

/** فئة المسمى (مفتاح التصنيف) — null إن لم يوجد */
export function jobTitleCategoryKey(key: string | null | undefined): string | null {
  if (!key) return null;
  return BY_KEY.get(key)?.category.key ?? null;
}

export function isJobTitleKey(key: string | null | undefined): boolean {
  return !!key && BY_KEY.has(key);
}

/** كل مفاتيح المسميات — للتحقق من المدخلات في الخادم */
export const ALL_JOB_TITLE_KEYS: string[] = Array.from(BY_KEY.keys());
