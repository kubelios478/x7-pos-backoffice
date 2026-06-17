export interface UserProfile {
  name: string;
  role: string;
  portraitUrl: string;
}

export interface SalesData {
  totalSales: string;
  variance: string;
  isPositive: boolean;
  hourlyData: { hour: string; sales: number }[];
}

export interface OccupancyData {
  active: number;
  total: number;
  percentage: number;
}

export interface KitchenPerformance {
  prepRate: number;
  onTimePrepText: string;
}

export interface TopItem {
  id: string;
  name: string;
  category: string;
  soldCount: number;
  icon: string;
}

export interface ActiveShift {
  id: string;
  initials: string;
  name: string;
  role: string;
  timeText: string;
  status: 'Active' | 'Late';
}

export interface SystemNotification {
  id: string;
  title: string;
  message: string;
  time: string;
}

// Banderas de control de demo
let simulate401 = false;
let isUserAuthenticated = true;

export const setSimulate401 = (value: boolean) => {
  simulate401 = value;
};

export const getSimulate401 = () => simulate401;

export const setAuthenticatedState = (state: boolean) => {
  isUserAuthenticated = state;
};

export const getAuthenticatedState = () => isUserAuthenticated;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const checkAuth = () => {
  if (simulate401 || !isUserAuthenticated) {
    const err: any = new Error('Unauthorized');
    err.status = 401;
    throw err;
  }
};

export const restaurantService = {
  async getUserProfile(): Promise<UserProfile> {
    await delay(400);
    checkAuth();
    return {
      name: 'Marco Rossi',
      role: 'General Manager',
      portraitUrl: 'https://images.unsplash.com/photo-1579038773843-c5a52b90ea0a?w=80&h=80&fit=crop&q=80',
    };
  },

  async getEstablishmentTier(): Promise<string> {
    await delay(300);
    checkAuth();
    return 'Full Restaurant';
  },

  async getDailySales(): Promise<SalesData> {
    await delay(500);
    checkAuth();
    return {
      totalSales: '$12,482.50',
      variance: '+14.2%',
      isPositive: true,
      hourlyData: [
        { hour: '11:00 AM', sales: 1200 },
        { hour: '12:00 PM', sales: 1800 },
        { hour: '1:00 PM', sales: 1500 },
        { hour: '2:00 PM', sales: 2200 },
        { hour: '3:00 PM', sales: 1900 },
        { hour: '4:00 PM', sales: 2800 },
        { hour: '5:00 PM', sales: 3100 },
      ],
    };
  },

  async getTableOccupancy(): Promise<OccupancyData> {
    await delay(350);
    checkAuth();
    return {
      active: 24,
      total: 32,
      percentage: 75, // (24/32) * 100
    };
  },

  async getKitchenPerformance(): Promise<KitchenPerformance> {
    await delay(300);
    checkAuth();
    return {
      prepRate: 94,
      onTimePrepText: 'On-time prep rate',
    };
  },

  async getTopSellingItems(): Promise<TopItem[]> {
    await delay(450);
    checkAuth();
    return [
      {
        id: '1',
        name: 'Classic Wagyu Burger',
        category: 'Main Course',
        soldCount: 142,
        icon: 'lunch_dining',
      },
      {
        id: '2',
        name: 'Truffle Mushroom Pizza',
        category: 'Stone Oven',
        soldCount: 98,
        icon: 'local_pizza',
      },
      {
        id: '3',
        name: 'Napa Cabernet 2018',
        category: 'Beverages',
        soldCount: 74,
        icon: 'wine_bar',
      },
      {
        id: '4',
        name: 'Warm Lava Cake',
        category: 'Dessert',
        soldCount: 56,
        icon: 'bakery_dining',
      },
    ];
  },

  async getActiveShifts(): Promise<ActiveShift[]> {
    await delay(400);
    checkAuth();
    return [
      {
        id: '1',
        initials: 'JD',
        name: 'Julia De Luca',
        role: 'Floor Manager',
        timeText: 'In: 10:00 AM',
        status: 'Active',
      },
      {
        id: '2',
        initials: 'MA',
        name: 'Marcus Aurelius',
        role: 'Head Chef',
        timeText: 'In: 11:30 AM',
        status: 'Active',
      },
      {
        id: '3',
        initials: 'ST',
        name: 'Sarah Thompson',
        role: 'Server',
        timeText: 'In: 12:00 PM',
        status: 'Active',
      },
      {
        id: '4',
        initials: 'RK',
        name: 'Robert Kim',
        role: 'Bartender',
        timeText: 'Scheduled: 4:00 PM',
        status: 'Late',
      },
    ];
  },

  async getNotifications(): Promise<SystemNotification[]> {
    await delay(300);
    checkAuth();
    return [
      {
        id: '1',
        title: 'VIP Reservation',
        message: 'Table 14 has a VIP arrival in 15 minutes.',
        time: 'Just now',
      },
      {
        id: '2',
        title: 'Kitchen Alert',
        message: 'Average ticket prep time exceeds 15m limits.',
        time: '5m ago',
      },
      {
        id: '3',
        title: 'Inventory Warning',
        message: 'Cabernet Sauvignon stock is running critically low.',
        time: '1h ago',
      },
    ];
  },

  async logout(): Promise<void> {
    await delay(500);
    isUserAuthenticated = false;
  },
};
