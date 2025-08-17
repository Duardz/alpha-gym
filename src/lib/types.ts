// Member types
export type MembershipType = 'Day Pass' | 'Warrior Pass' | 'Gladiator Pass' | 'Alpha Elite Pass';
export type MemberStatus = 'Active' | 'Expired';

export interface Member {
  id: string;
  name: string;
  contact: string;
  membershipType: MembershipType;
  startDate: string;
  expiryDate: string;
  status: MemberStatus;
  createdAt: Date;
  updatedAt: Date;
}

// Walk-in types
export type PaymentMethod = 'Cash' | 'GCash' | 'Bank Transfer' | 'Credit Card';

export interface WalkIn {
  id: string;
  name: string;
  date: Date;
  payment: number;
  method: PaymentMethod;
  createdAt: Date;
}

// Inventory types
export interface InventoryItem {
  id: string;
  productName: string;
  price: number;
  stock: number;
  createdAt: Date;
  updatedAt: Date;
}

// Cashflow types
export type CashflowType = 'income' | 'expense';
export type IncomeSource = 'Day Pass' | 'Warrior Pass' | 'Gladiator Pass' | 'Alpha Elite Pass' | 'Product Sale';
export type ExpenseSource = 'Rent' | 'Utilities' | 'Salaries' | 'Maintenance' | 'Equipment' | 'Marketing' | 'Other';

export interface CashflowEntry {
  id: string;
  type: CashflowType;
  source: IncomeSource | ExpenseSource;
  amount: number;
  date: string;
  notes: string;
  linkedId?: string; // For auto-linked entries (member ID, walk-in ID, etc.)
  createdAt: Date;
  updatedAt: Date;
}

// Dashboard stats types
export interface DashboardStats {
  totalMembers: number;
  activeMembers: number;
  todayWalkIns: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  netProfit: number;
  membershipBreakdown: {
    warrior: number;
    gladiator: number;
    alphaElite: number;
  };
}

// Form types
export interface MemberForm {
  name: string;
  contact: string;
  membershipType: MembershipType;
  startDate: string;
  expiryDate?: string; // Optional for auto-calculated types
}

export interface WalkInForm {
  name: string;
  payment: number;
  method: PaymentMethod;
}

export interface InventoryForm {
  productName: string;
  price: number;
  stock: number;
}

export interface ExpenseForm {
  source: ExpenseSource;
  amount: number;
  date: string;
  notes: string;
}