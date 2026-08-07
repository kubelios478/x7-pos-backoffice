export interface NavFeature {
  id: string;
  name: string;
  applicationId: string;
  planId: number;
  isSaaS: boolean;
}

export interface NavApplication {
  id: string;
  name: string;
  categoryName: string;
  categoryIcon: string;
  categorySortOrder: number;
  features: NavFeature[];
}

export interface NavCategory {
  id: string; // Clave única en minúsculas (ej: 'saas', 'core', 'finance')
  name: string;
  icon: string;
  sortOrder: number;
  applications: NavApplication[];
}

const parseTextFile = (text: string): string[][] => {
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('Plan_id') && !line.startsWith('Application_Id') && !line.startsWith('Feature_Id'))
    .map(line => line.split('|'));
};

const MERCHANT_COMPANY_FEATURE_IDS = new Set([
  'company-profile',
  'company-configurations',
  'merchant-directory',
  'user-management',
]);

export const navigationService = {
  async loadAndParseNavigation(userPlanId: number, userRole: string): Promise<NavCategory[]> {
    try {
      // 1. Cargar los tres archivos planos de base de datos desde public/
      const [subsRes, appsRes, featsRes] = await Promise.all([
        fetch('/Subscriptions.txt').then(r => r.text()),
        fetch('/Applications.txt').then(r => r.text()),
        fetch('/Features.txt').then(r => r.text())
      ]);

      const subsData = parseTextFile(subsRes);
      const appsData = parseTextFile(appsRes);
      const featsData = parseTextFile(featsRes);

      // Mapeo de suscripciones por si es necesario
      const plansMap = new Map<number, string>();
      subsData.forEach(row => {
        if (row.length >= 2) {
          plansMap.set(parseInt(row[0]), row[1]);
        }
      });

      const isSaaSMode = userRole === 'SaaS Owner';
      const isGodMode = userRole === 'Super Admin (All Access)' || userRole === 'God Mode';

      // 2. Parsear y filtrar características (L3)
      const features: NavFeature[] = featsData
        .map(row => {
          if (row.length < 5) return null;
          return {
            id: row[0],
            name: row[1],
            applicationId: row[2],
            planId: parseInt(row[3]),
            isSaaS: row[4] === '1'
          };
        })
        .filter((f): f is NavFeature => f !== null)
        .filter(f => {
          if (isGodMode) {
            // El rol Super Admin (All Access) ve absolutamente todas las opciones de menú
            return true;
          }
          if (isSaaSMode) {
            // SaaS Owner ve únicamente características marcadas como SaaS
            return f.isSaaS;
          } else {
            // Admin de company/merchants: visible en todos los planes de merchant
            if (MERCHANT_COMPANY_FEATURE_IDS.has(f.id)) {
              return true;
            }
            // Merchant ve características si no son exclusivas del SaaS Owner y entran en su plan
            const exclusiveSaaS = [
              'saas-dashboard',
              'companies-dashboard',
              'apps-config',
              'features-control',
              'plan-apps-rules',
              'plan-features-mapping',
              'sub-plans-core',
              'sub-apps-mapping'
            ];
            return !exclusiveSaaS.includes(f.id) && f.planId === userPlanId;
          }
        });

      // 3. Parsear aplicaciones (L2)
      const applications: NavApplication[] = appsData
        .map(row => {
          if (row.length < 5) return null;
          return {
            id: row[0],
            name: row[1],
            categoryName: row[2],
            categoryIcon: row[3],
            categorySortOrder: parseInt(row[4]),
            features: [] as NavFeature[]
          };
        })
        .filter((app): app is NavApplication => app !== null);

      // Asignar características a sus aplicaciones
      applications.forEach(app => {
        app.features = features.filter(f => f.applicationId === app.id);
      });

      // Regla de Supresión de Padres Vacíos (Nivel 2: Aplicaciones sin características válidas)
      const visibleApps = applications.filter(app => app.features.length > 0);

      // 4. Agrupar aplicaciones en categorías (L1)
      const categoriesMap = new Map<string, NavCategory>();

      visibleApps.forEach(app => {
        const catId = app.categoryName.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (!categoriesMap.has(catId)) {
          categoriesMap.set(catId, {
            id: catId,
            name: app.categoryName,
            icon: app.categoryIcon,
            sortOrder: app.categorySortOrder,
            applications: []
          });
        }
        categoriesMap.get(catId)!.applications.push(app);
      });

      // Convertir a array y ordenar por Category_SortOrder
      const categoriesList = Array.from(categoriesMap.values()).sort(
        (a, b) => a.sortOrder - b.sortOrder
      );

      return categoriesList;
    } catch (error) {
      console.error('Error cargando y parseando el menú de navegación:', error);
      return [];
    }
  }
};
