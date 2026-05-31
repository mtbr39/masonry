export interface Category {
  id: string;
  name: string;
  order: number;
  audioUrl?: string;
}

export interface Photo {
  id: string;
  url: string;
  categoryId?: string;
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
  // 投稿者のニックネーム（任意）。設定時は左上に重ねて表示する
  nickname?: string;
  // photo
  photoUrl?: string;
  // text
  content?: string;
  fontSize?: number;
  color?: string;
  fontWeight?: string;
}
