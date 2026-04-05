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
