// Existing types...
export interface Project {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'completed' | 'on-hold' | 'draft';
  client: string;
  team: TeamMember[];
  progress: number;
  deadline: string;
  budget: number;
  tags: string[];
  createdAt: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: 'todo' | 'in-progress' | 'review' | 'completed';
  assignee: TeamMember;
  priority: 'low' | 'medium' | 'high';
  dueDate: string;
  projectId: string;
  comments: Comment[];
  attachments: File[];
}

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  avatar: string;
  email: string;
  status: 'online' | 'offline' | 'away';
  department: string;
}

export interface Comment {
  id: string;
  content: string;
  author: TeamMember;
  createdAt: string;
  replies?: Comment[];
}

export interface File {
  id: string;
  name: string;
  type: string;
  size: number;
  url: string;
  uploadedBy: TeamMember;
  uploadedAt: string;
  version: number;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  start: string;
  end: string;
  type: 'meeting' | 'deadline' | 'review' | 'other';
  attendees: TeamMember[];
  projectId?: string;
}

// --- WAREHOUSE SPECIFIC TYPES ---

export interface SKU {
  id: string;
  code: string; // Kode SKU
  name: string; // Nama
  description: string; // Deskripsi
  category: string; // Kategori (Internal use)
  minStock: number;
  unit: string;
  hpp: number; // HPP
  hppUpdatedAt: string; // HPP Update
  createdAt: string; // Tanggal Dibuat
  price: number; // Harga Jual (Optional/Internal)
  image?: string;
}

export interface StockItem {
  id: string;
  skuId: string;
  sku: SKU;
  quantity: number;
  location: string; // 'Gudang A', 'Rak B-01', etc.
  noKarung?: string; // TAMBAHAN: Nomor Karung
  status: 'available' | 'reserved' | 'damaged';
  lastUpdated: string;
}

export interface Shipment {
  id: string;
  referenceNo: string;
  type: 'inbound' | 'outbound' | 'factory_outbound' | 'return';
  date: string;
  status: 'pending' | 'processing' | 'completed' | 'cancelled';
  source: string;
  destination: string;
  items: { skuId: string; skuName: string; qty: number }[];
  notes?: string;
}

export interface StockOpnameSession {
  id: string;
  date: string;
  auditor: string;
  status: 'in-progress' | 'completed';
  totalItems: number;
  discrepancy: number;
}
