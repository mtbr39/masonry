export interface Category {
  id: string;
  name: string;
}

export interface Photo {
  id: string;
  url: string;
  categoryId: string;
  createdAt: Date;
  width: number;
  height: number;
}

export interface CanvasItem {
  id: string;
  type: "photo" | "text";
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  // photo
  photoUrl?: string;
  // text
  content?: string;
  fontSize?: number;
  color?: string;
  fontWeight?: string;
}
